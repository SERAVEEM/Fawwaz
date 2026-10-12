// ponytail: build-time asset helper; outputs static strings at compile time with 0kb runtime JS
import placeholdersData from '../data/placeholders.json';

const PLACEHOLDERS = placeholdersData as Record<string, string>;

// Clean base URL from environment (falls back to R2 CDN)
const rawBase = import.meta.env.PUBLIC_ASSETS_URL || 'https://pub-f2c6b9ebd0204e4ab7f918bf404e647a.r2.dev';
const BASE_URL = rawBase.replace(/\/+$/, '');

/**
 * Resolves an asset path to the Cloudflare R2 CDN URL.
 * Falls back to local asset path if PUBLIC_ASSETS_URL is empty.
 */
export function r2(path: string): string {
  if (!path) return '';
  // Keep external URLs intact (e.g. http://, https://)
  if (/^https?:\/\//i.test(path)) return path;
  
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!BASE_URL) return cleanPath;
  return `${BASE_URL}${cleanPath}`;
}

/**
 * Returns the inlined base64 blurred placeholder (LQIP) for an image.
 * Renders instantly with 0 network requests.
 */
export function getPlaceholder(path: string): string {
  if (!path) return '';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const basePath = cleanPath.split('?')[0];
  return PLACEHOLDERS[cleanPath] || PLACEHOLDERS[basePath] || '';
}
