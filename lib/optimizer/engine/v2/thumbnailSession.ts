/**
 * Commit-or-rollback cleanup for a document's thumbnail URL session.
 *
 * Processing can emit progressive previews before every page has been
 * persisted. If the run fails, keep the URLs from the previous successful
 * document and revoke only the newly produced partial URLs. On success, do
 * the inverse: retire previous URLs and keep the complete new set.
 */
export function settleThumbnailSession(
  activeUrls: Set<string>,
  previousUrls: ReadonlySet<string>,
  succeeded: boolean,
  revokeUrl: (url: string) => void,
): void {
  for (const url of Array.from(activeUrls)) {
    const shouldRetire = succeeded ? previousUrls.has(url) : !previousUrls.has(url);
    if (!shouldRetire) continue;

    try {
      revokeUrl(url);
    } finally {
      activeUrls.delete(url);
    }
  }
}
