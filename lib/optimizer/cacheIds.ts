/**
 * Generate a cache namespace that is unique across concurrent tabs and runs.
 *
 * Date.now() alone can collide when two tabs start processing in the same
 * millisecond; a collision makes their page rows overwrite each other in the
 * shared origin-wide IndexedDB store.
 */
let sequence = 0;

function createSessionToken(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // crypto.randomUUID may be unavailable in older/insecure browser contexts.
  }
  return `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

const sessionToken = createSessionToken();

export function createCachePdfId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${sessionToken}_${Date.now().toString(36)}_${sequence.toString(36)}`;
}
