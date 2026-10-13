// ponytail: build-time asset helper; outputs static strings at compile time with 0kb runtime JS
import placeholdersData from '../data/placeholders.json';

const PLACEHOLDERS = placeholdersData as Record<string, string>;

// Clean base URL from environment (falls back to local site path if empty)
const rawBase = import.meta.env.PUBLIC_ASSETS_URL || '';
const CDN_BASE = rawBase.replace(/\/+$/, '');
const SITE_BASE = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');

/**
 * Resolves an asset path to the local site URL (or CDN if PUBLIC_ASSETS_URL is explicitly set).
 */
export function r2(path: string): string {
  if (!path) return '';
  // Keep external URLs intact (e.g. http://, https://)
  if (/^https?:\/\//i.test(path)) return path;
  
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (CDN_BASE) return `${CDN_BASE}${cleanPath}`;
  return `${SITE_BASE}${cleanPath}`;
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
