import crypto from 'crypto';

// NOTE:
// This module centralizes Gemini-call reliability for the Mobile backend:
// - concurrency limit (semaphore)
// - optional in-memory caching (TTL)
// - retry with exponential backoff for 429/503/network errors
//
// It is intentionally lightweight (no extra deps) and safe to use across services.

type GeminiCallOptions = {
  modelName?: string;
  systemInstruction?: string;
  parts: any[]; // GoogleGenerativeAI "parts" array (text + optional inlineData for vision)
  cacheKey?: string; // if provided => enable cache + in-flight de-dup
  cacheTtlMs?: number; // default 24h
  maxRetries?: number; // default 3
  opName?: string; // for logs
};

type CacheEntry = {
  expiresAt: number;
  value: string;
};

// Global quota guard (process-wide) to avoid repeated 429 "quota exceeded" calls
let geminiQuotaExceeded = false;
let geminiQuotaResetTime: number | null = null;

class Semaphore {
  private max: number;
  private current = 0;
  private queue: Array<() => void> = [];

  constructor(max: number) {
    this.max = Math.max(1, max);
  }

  async acquire(): Promise<() => void> {
    if (this.current < this.max) {
      this.current++;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.current++;
    return () => this.release();
  }

  private release() {
    this.current = Math.max(0, this.current - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

const GEMINI_MAX_CONCURRENCY = Number(process.env.GEMINI_MAX_CONCURRENCY || 1);
const semaphore = new Semaphore(GEMINI_MAX_CONCURRENCY);

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string>>();

function nowMs() {
  return Date.now();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(err: any): boolean {
  const status = err?.status || err?.response?.status;
  const msg = String(err?.message || '').toLowerCase();
  const code = String((err as any)?.code || '').toLowerCase();

  // IMPORTANT: Distinguish between "rate limit" and "daily quota exhausted".
  // If quota is exhausted (common free-tier: 20 requests/day), retries will never help.
  if (status === 429 && msg.includes('exceeded your current quota')) {
    return false;
  }

  if (status === 429 || status === 503) return true;
  if (typeof status === 'number' && status >= 500 && status <= 599) return true;

  // Common transient network signals
  if (msg.includes('overloaded') || msg.includes('service unavailable')) return true;
  if (msg.includes('fetch failed') || msg.includes('network')) return true;
  if (code.includes('econnreset') || code.includes('etimedout') || code.includes('econnrefused') || code.includes('enotfound')) return true;

  return false;
}

function markGeminiQuotaExceeded() {
  geminiQuotaExceeded = true;
  // Back off for 60 minutes; real reset is usually daily but we retry hourly to recover automatically.
  geminiQuotaResetTime = nowMs() + 60 * 60 * 1000;
  console.log('⏸️ Gemini quota exceeded - skipping Gemini calls for 60 minutes');
}

function isGeminiQuotaExceeded(): boolean {
  if (!geminiQuotaExceeded) return false;
  if (geminiQuotaResetTime && nowMs() > geminiQuotaResetTime) {
    geminiQuotaExceeded = false;
    geminiQuotaResetTime = null;
    console.log('🔄 Gemini quota cooldown ended - will try Gemini again');
    return false;
  }
  return true;
}

function backoffDelayMs(err: any, attempt: number): number {
  const status = err?.status || err?.response?.status;
  // attempt is 0-based
  const base = status === 429 ? 3000 : 1000;
  const exp = Math.min(6, attempt); // cap exponent
  const jitter = Math.floor(Math.random() * 250);
  return base * Math.pow(2, exp) + jitter;
}

function stableHash(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function makeInternalCacheKey(opts: GeminiCallOptions) {
  if (opts.cacheKey) return opts.cacheKey;
  // If caller didn't provide one, we avoid caching by default.
  return '';
}

async function getGeminiModel(opts: GeminiCallOptions) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const modelName = opts.modelName || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  if (opts.systemInstruction && opts.systemInstruction.trim()) {
    // systemInstruction must be object with parts
    return genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: { parts: [{ text: opts.systemInstruction }] },
    });
  }

  return genAI.getGenerativeModel({ model: modelName });
}

export function buildGeminiCacheKey(namespace: string, payload: any): string {
  // Keep cache keys short but stable
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return `${namespace}:${stableHash(raw)}`;
}

export async function withGeminiSemaphore<T>(fn: () => Promise<T>): Promise<T> {
  const release = await semaphore.acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function geminiGenerateContentText(opts: GeminiCallOptions): Promise<string> {
  const opName = opts.opName || 'geminiGenerateContentText';
  const maxRetries = typeof opts.maxRetries === 'number' ? opts.maxRetries : 3;
  const ttlMs = typeof opts.cacheTtlMs === 'number' ? opts.cacheTtlMs : 24 * 60 * 60 * 1000;

  // Global guard: if we already detected quota exhaustion, skip quickly
  if (isGeminiQuotaExceeded()) {
    throw new Error(`[${opName}] Gemini quota exceeded (cooldown active)`);
  }

  const cacheKey = makeInternalCacheKey(opts);
  if (cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > nowMs()) {
      return cached.value;
    }
    const inflight = inFlight.get(cacheKey);
    if (inflight) return inflight;
  }

  const task = (async () => {
    return await withGeminiSemaphore(async () => {
      let lastErr: any = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const model = await getGeminiModel(opts);
          const result = await model.generateContent(opts.parts);
          const response = await result.response;
          const text = response?.text?.() || '';

          if (!text || !String(text).trim()) {
            throw new Error('Empty response from Gemini');
          }

          const out = String(text).trim();
          if (cacheKey) {
            cache.set(cacheKey, { value: out, expiresAt: nowMs() + ttlMs });
          }
          return out;
        } catch (err: any) {
          lastErr = err;

          const status = err?.status || err?.response?.status;
          const msg = String(err?.message || '').toLowerCase();
          if (status === 429 && msg.includes('exceeded your current quota')) {
            markGeminiQuotaExceeded();
            const shortMsg = String(err?.message || err).substring(0, 200);
            throw new Error(`[${opName}] Gemini daily quota exceeded: ${shortMsg}`);
          }

          if (attempt >= maxRetries || !isRetryableGeminiError(err)) {
            const shortMsg = String(err?.message || err).substring(0, 200);
            throw new Error(`[${opName}] Gemini call failed after ${attempt + 1} attempt(s): ${shortMsg}`);
          }

          const waitMs = backoffDelayMs(err, attempt);
          const status = err?.status || err?.response?.status || 'N/A';
          console.log(`⚠️ ${opName}: retrying Gemini (status=${status}) in ${waitMs}ms... (attempt ${attempt + 1}/${maxRetries + 1})`);
          await sleep(waitMs);
        }
      }

      // Should never reach here
      throw lastErr || new Error(`[${opName}] Gemini call failed`);
    });
  })();

  if (cacheKey) {
    inFlight.set(cacheKey, task);
  }

  try {
    return await task;
  } finally {
    if (cacheKey) {
      inFlight.delete(cacheKey);
    }
  }
}


