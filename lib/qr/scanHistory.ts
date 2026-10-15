/**
 * QR history persistence policy.
 *
 * Wi-Fi QR payloads embed network credentials in plain text
 * (for example WIFI:T:WPA;S:network;P:password;;). Keep them available in
 * the in-memory history for the current session, but never write them to
 * localStorage. This also filters legacy persisted entries on load.
 */
const MAX_PERSISTED_SCAN_HISTORY = 20;

export function isWifiQrPayload(value: string): boolean {
  return /^WIFI:/i.test(value.trim());
}

export function filterPersistableScanHistory(history: string[]): string[] {
  return history
    .filter((entry) => !isWifiQrPayload(entry))
    .slice(0, MAX_PERSISTED_SCAN_HISTORY);
}

/** Filter legacy persisted history before it can be re-saved or displayed. */
export function parsePersistedScanHistory(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return filterPersistableScanHistory(
      parsed.filter((entry): entry is string => typeof entry === 'string'),
    );
  } catch {
    return [];
  }
}
