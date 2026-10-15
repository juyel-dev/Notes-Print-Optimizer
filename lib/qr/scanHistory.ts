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

export interface ParsedWifiCredentials {
  ssid: string;
  auth: string;
  password: string;
  hidden: boolean;
}

/**
 * Parse `WIFI:T:WPA;S:name;P:pass;H:true;;` with `\;` `\,` `\:` `\\`
 * escapes. Returns null when no `S:` (SSID) field is present — callers must
 * treat unparseable payloads as opaque, never render them raw (they may
 * still contain a plaintext `P:` password).
 */
export function parseWifiQrPayload(text: string): ParsedWifiCredentials | null {
  const body = text.trim().replace(/^WIFI:/i, '');
  const fields: Record<string, string> = {};
  let key = '';
  let val = '';
  let inKey = true;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && i + 1 < body.length) {
      val += body[++i];
    } else if (inKey && ch === ':') {
      inKey = false;
    } else if (!inKey && ch === ';') {
      fields[key.toUpperCase()] = val;
      key = '';
      val = '';
      inKey = true;
    } else if (inKey) {
      if (ch !== ';') key += ch;
    } else {
      val += ch;
    }
  }
  if (!fields.S) return null;
  return {
    ssid: fields.S,
    auth: fields.T || 'nopass',
    password: fields.P ?? '',
    hidden: /^true$/i.test(fields.H ?? ''),
  };
}

/**
 * Display label that never leaks credentials: non-Wi-Fi payloads pass
 * through unchanged; Wi-Fi payloads show only the SSID. When the payload
 * does not parse, a redacted placeholder is returned — never the raw text,
 * which may contain a plaintext password.
 */
export function wifiSafeDisplayLabel(text: string): string {
  if (!isWifiQrPayload(text)) return text;
  return parseWifiQrPayload(text)?.ssid ?? 'Wi-Fi network (details hidden)';
}
