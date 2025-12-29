import { API_BASE_URL } from './constants';
import { logger } from './logger';

/**
 * Default placeholder image URL
 * Using null to indicate we should use a local placeholder component instead
 * This avoids network requests for placeholder images
 */
export const DEFAULT_PLACEHOLDER_IMAGE: string | null = null;

/**
 * Get full image URL from medicine data
 * Handles various image field formats from backend
 * Also handles 404 errors by trying to find matching file name
 */
export function getMedicineImageUrl(medicine: any): string | null {
  // Try multiple possible field names
  let imageUrl = 
    medicine?.imageUrl || 
    medicine?.image || 
    medicine?.images?.[0] || 
    '';

  // If empty or null, return null to trigger fallback
  if (!imageUrl || imageUrl.trim() === '') {
    logger.log('[ImageHelper] No imageUrl found for medicine:', medicine?.name || medicine?._id);
    return null;
  }

  // If already a full URL (starts with http/https), return as is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    logger.log('[ImageHelper] Using full URL:', imageUrl);
    return imageUrl;
  }

  // If it's a relative path, prepend API_BASE_URL
  // Handle cases where path might start with / or not
  const cleanPath = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  const fullUrl = `${API_BASE_URL}${cleanPath}`;
  
  logger.log('[ImageHelper] Constructed URL:', {
    original: imageUrl,
    cleanPath,
    apiBase: API_BASE_URL,
    fullUrl
  });
  
  return fullUrl;
}

/**
 * Try to find matching image file name from medicine name
 * This is a fallback when the stored imageUrl doesn't match actual files
 * Tries multiple variations of the medicine name
 */
export function getFallbackImageUrl(medicine: any): string | null {
  if (!medicine?.name) {
    return null;
  }

  // Try multiple variations of the file name
  const variations = [
    // Original name with underscores: "Panadol Extra" -> "Panadol_Extra.jpg"
    medicine.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') + '.jpg',
    // Lowercase: "Panadol Extra" -> "panadol_extra.jpg"
    medicine.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '.jpg',
    // Remove common words and try: "Panadol Extra 500mg" -> "Panadol_Extra.jpg"
    medicine.name.replace(/\d+\s*(mg|ml|g|kg|iu|mcg)/gi, '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') + '.jpg',
  ];

  // Return first variation (most likely to match)
  // The Image component will handle 404 and show placeholder
  return `${API_BASE_URL}/medicine-images/${variations[0]}`;
}

/**
 * Get the final image URL with fallback chain
 * Returns: primaryUrl -> fallbackUrl -> null (use local placeholder)
 */
export function getImageUrlWithFallback(medicine: any, hasError: boolean = false, hasFallbackError: boolean = false): string | null {
  // If both primary and fallback failed, return null to use local placeholder
  if (hasError && hasFallbackError) {
    return null;
  }

  // If primary failed, try fallback
  if (hasError && !hasFallbackError) {
    const fallbackUrl = getFallbackImageUrl(medicine);
    return fallbackUrl || null;
  }

  // Try primary URL
  const primaryUrl = getMedicineImageUrl(medicine);
  if (primaryUrl) {
    return primaryUrl;
  }

  // If no primary URL, try fallback
  const fallbackUrl = getFallbackImageUrl(medicine);
  return fallbackUrl || null;
}

/**
 * Check if medicine has a valid image
 */
export function hasValidImage(medicine: any): boolean {
  const imageUrl = 
    medicine?.imageUrl || 
    medicine?.image || 
    medicine?.images?.[0] || 
    '';
  
  return imageUrl && imageUrl.trim() !== '';
}

/**
 * Get image dimensions for optimization
 */
export function getImageDimensions(size: 'small' | 'medium' | 'large' = 'medium'): { width: number; height: number } {
  switch (size) {
    case 'small':
      return { width: 150, height: 150 };
    case 'medium':
      return { width: 300, height: 300 };
    case 'large':
      return { width: 600, height: 600 };
    default:
      return { width: 300, height: 300 };
  }
}

