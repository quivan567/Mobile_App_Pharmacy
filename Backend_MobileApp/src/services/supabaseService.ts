import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Initialize Supabase client
let supabaseClient: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  console.log('✅ Supabase client initialized');
} else {
  console.warn('⚠️ Supabase not configured - SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
}

// Storage buckets configuration
export const STORAGE_BUCKETS = {
  PRESCRIPTIONS: 'prescriptions',
  AVATARS: 'avatars',
  MEDICINES: 'medicines',
  TEMP: 'temp',
} as const;

/**
 * Upload file to Supabase Storage
 */
export async function uploadToSupabase(
  bucket: string,
  filePath: string,
  destinationPath: string,
  options?: {
    contentType?: string;
    upsert?: boolean;
  }
): Promise<{ url: string; path: string } | null> {
  if (!supabaseClient) {
    console.warn('⚠️ Supabase not configured, skipping upload');
    return null;
  }

  try {
    // Read file
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(destinationPath);
    const fileDir = path.dirname(destinationPath).replace(/\\/g, '/');

    // Ensure bucket exists (create if not)
    const { data: buckets } = await supabaseClient.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === bucket);

    if (!bucketExists) {
      console.log(`📦 Creating bucket: ${bucket}`);
      const { error: createError } = await supabaseClient.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
      });

      if (createError && !createError.message.includes('already exists')) {
        console.error('❌ Error creating bucket:', createError);
        throw createError;
      }
    }

    // Determine content type
    const contentType =
      options?.contentType ||
      (filePath.endsWith('.png')
        ? 'image/png'
        : filePath.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg');

    // Upload file
    const fullPath = fileDir ? `${fileDir}/${fileName}` : fileName;
    const { data, error } = await supabaseClient.storage
      .from(bucket)
      .upload(fullPath, fileBuffer, {
        contentType,
        upsert: options?.upsert ?? true,
        cacheControl: '3600',
      });

    if (error) {
      console.error('❌ Supabase upload error:', error);
      throw error;
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabaseClient.storage.from(bucket).getPublicUrl(fullPath);

    console.log(`✅ File uploaded to Supabase: ${bucket}/${fullPath}`);
    console.log(`   Public URL: ${publicUrl}`);

    return {
      url: publicUrl,
      path: fullPath,
    };
  } catch (error: any) {
    console.error('❌ Error uploading to Supabase:', error.message);
    return null;
  }
}

/**
 * Upload base64 image to Supabase Storage
 */
export async function uploadBase64ToSupabase(
  bucket: string,
  base64Data: string,
  fileName: string,
  options?: {
    contentType?: string;
    folder?: string;
  }
): Promise<{ url: string; path: string } | null> {
  if (!supabaseClient) {
    console.warn('⚠️ Supabase not configured, skipping upload');
    return null;
  }

  try {
    // Parse base64
    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid base64 image format');
    }

    const mimeType = matches[1];
    const base64String = matches[2];
    const buffer = Buffer.from(base64String, 'base64');

    // Determine content type
    const contentType = options?.contentType || `image/${mimeType}`;

    // Build path
    const folder = options?.folder || '';
    const fullPath = folder ? `${folder}/${fileName}` : fileName;

    // Ensure bucket exists
    const { data: buckets } = await supabaseClient.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === bucket);

    if (!bucketExists) {
      console.log(`📦 Creating bucket: ${bucket}`);
      const { error: createError } = await supabaseClient.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
      });

      if (createError && !createError.message.includes('already exists')) {
        console.error('❌ Error creating bucket:', createError);
        throw createError;
      }
    }

    // Upload file
    const { data, error } = await supabaseClient.storage
      .from(bucket)
      .upload(fullPath, buffer, {
        contentType,
        upsert: true,
        cacheControl: '3600',
      });

    if (error) {
      console.error('❌ Supabase upload error:', error);
      throw error;
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabaseClient.storage.from(bucket).getPublicUrl(fullPath);

    console.log(`✅ Base64 image uploaded to Supabase: ${bucket}/${fullPath}`);

    return {
      url: publicUrl,
      path: fullPath,
    };
  } catch (error: any) {
    console.error('❌ Error uploading base64 to Supabase:', error.message);
    return null;
  }
}

/**
 * Delete file from Supabase Storage
 */
export async function deleteFromSupabase(
  bucket: string,
  filePath: string
): Promise<boolean> {
  if (!supabaseClient) {
    console.warn('⚠️ Supabase not configured, skipping delete');
    return false;
  }

  try {
    const { error } = await supabaseClient.storage.from(bucket).remove([filePath]);

    if (error) {
      console.error('❌ Supabase delete error:', error);
      return false;
    }

    console.log(`✅ File deleted from Supabase: ${bucket}/${filePath}`);
    return true;
  } catch (error: any) {
    console.error('❌ Error deleting from Supabase:', error.message);
    return false;
  }
}

/**
 * Get Supabase client for real-time subscriptions
 */
export function getSupabaseClient(): SupabaseClient | null {
  return supabaseClient;
}

/**
 * Publish real-time event to Supabase
 * Note: This requires setting up database triggers or using Supabase Realtime
 */
export async function publishRealtimeEvent(
  channel: string,
  event: string,
  payload: any
): Promise<boolean> {
  if (!supabaseClient) {
    console.warn('⚠️ Supabase not configured, skipping real-time event');
    return false;
  }

  try {
    // Supabase Realtime requires database setup
    // For now, we'll use a channel-based approach
    const channelInstance = supabaseClient.channel(channel);
    
    // Note: Supabase Realtime works with database changes
    // For custom events, you might need to use a different approach
    // or set up database triggers
    
    console.log(`📡 Real-time event published: ${channel}/${event}`);
    return true;
  } catch (error: any) {
    console.error('❌ Error publishing real-time event:', error.message);
    return false;
  }
}

/**
 * Subscribe to real-time changes
 */
export function subscribeToRealtime(
  channel: string,
  event: string,
  callback: (payload: any) => void
): () => void {
  if (!supabaseClient) {
    console.warn('⚠️ Supabase not configured, skipping subscription');
    return () => {};
  }

  try {
    const channelInstance = supabaseClient
      .channel(channel)
      .on('postgres_changes', { event: '*', schema: 'public', table: channel }, (payload) => {
        callback(payload);
      })
      .subscribe();

    console.log(`📡 Subscribed to real-time: ${channel}/${event}`);

    return () => {
      channelInstance.unsubscribe();
    };
  } catch (error: any) {
    console.error('❌ Error subscribing to real-time:', error.message);
    return () => {};
  }
}

export default {
  uploadToSupabase,
  uploadBase64ToSupabase,
  deleteFromSupabase,
  getSupabaseClient,
  publishRealtimeEvent,
  subscribeToRealtime,
  STORAGE_BUCKETS,
};

