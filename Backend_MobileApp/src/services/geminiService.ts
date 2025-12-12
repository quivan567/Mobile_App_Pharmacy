import axios from 'axios';
import { config } from '../config/index.js';

interface GeminiRequestPayload {
  prescriptionText?: string;
  foundMedicines: any[];
  notFoundMedicines: any[];
  extractedInfo?: any;
}

interface GeminiAdviceResult {
  summary?: string;
  safetyNotes?: string[];
  recommendations?: string[];
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/**
 * Call Google Gemini to generate higher–level advice for a prescription.
 * This is **optional** – if the API key is missing or call fails,
 * the backend will fall back gracefully and keep using OCR + DB matching.
 */
export async function generatePrescriptionAdviceWithGemini(
  payload: GeminiRequestPayload
): Promise<GeminiAdviceResult | null> {
  try {
    if (!GEMINI_API_KEY) {
      console.warn('[Gemini] GEMINI_API_KEY is not set – skipping Gemini analysis');
      return null;
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      GEMINI_MODEL
    )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const prompt = buildPrompt(payload);

    const response = await axios.post(
      apiUrl,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      },
      {
        timeout: 45000, // Increased from 15s to 45s to handle slower responses
      }
    );

    const text =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    if (!text) {
      return null;
    }

    // Try to parse as JSON first; if it fails, just wrap raw text.
    try {
      const parsed = JSON.parse(text);
      return parsed;
    } catch {
      return {
        summary: text,
      };
    }
  } catch (error: any) {
    console.error('[Gemini] Error calling Gemini API:', {
      message: error?.message,
      status: error?.response?.status,
      data: error?.response?.data,
    });
    return null;
  }
}

function buildPrompt({
  prescriptionText,
  foundMedicines,
  notFoundMedicines,
  extractedInfo,
}: GeminiRequestPayload): string {
  return [
    'Bạn là trợ lý dược sĩ, hãy phân tích đơn thuốc dưới đây và trả lời bằng JSON với cấu trúc:',
    `{
  "summary": "tóm tắt ngắn gọn (<= 3 câu) tình trạng và hướng điều trị",
  "safetyNotes": ["cảnh báo quan trọng bằng tiếng Việt, mỗi phần tử là 1 câu"],
  "recommendations": ["gợi ý cho dược sĩ / bệnh nhân, mỗi phần tử là 1 câu ngắn"]
}`,
    '',
    'Thông tin OCR trích xuất (bệnh nhân / bác sĩ / chẩn đoán):',
    JSON.stringify(extractedInfo || {}, null, 2),
    '',
    'Các thuốc đã tìm thấy trong hệ thống (foundMedicines):',
    JSON.stringify(foundMedicines || [], null, 2),
    '',
    'Các thuốc không tìm thấy / cần gợi ý thêm (notFoundMedicines):',
    JSON.stringify(notFoundMedicines || [], null, 2),
    '',
    'Toàn bộ text đơn thuốc (nếu có):',
    prescriptionText || '(không có)',
    '',
    'YÊU CẦU QUAN TRỌNG:',
    '- Chỉ trả về JSON **thuần** đúng cấu trúc đã mô tả, không thêm giải thích ngoài JSON.',
    '- Nếu thiếu dữ liệu, có thể để mảng rỗng hoặc chuỗi rỗng.',
  ].join('\n');
}


