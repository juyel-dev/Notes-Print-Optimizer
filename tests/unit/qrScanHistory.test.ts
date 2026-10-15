import { describe, expect, it } from 'vitest';
import {
  filterPersistableScanHistory,
  isWifiQrPayload,
  parsePersistedScanHistory,
  parseWifiQrPayload,
  wifiSafeDisplayLabel,
} from '../../lib/qr/scanHistory';

describe('QR scan history persistence', () => {
  it('recognizes Wi-Fi payloads despite leading whitespace or lowercase prefix', () => {
    expect(isWifiQrPayload('WIFI:T:WPA;S:home;P:secret;;')).toBe(true);
    expect(isWifiQrPayload('  wifi:T:WPA;S:home;P:secret;;')).toBe(true);
    expect(isWifiQrPayload('https://example.com')).toBe(false);
  });

  it('omits Wi-Fi credentials from persistent history but preserves safe entries and order', () => {
    expect(filterPersistableScanHistory([
      'https://example.com',
      'WIFI:T:WPA;S:home;P:private-password;;',
      'mailto:hello@example.com',
    ])).toEqual([
      'https://example.com',
      'mailto:hello@example.com',
    ]);
  });

  it('filters legacy Wi-Fi payloads when loading history from localStorage', () => {
    const legacy = JSON.stringify([
      'WIFI:T:WPA;S:old-network;P:old-secret;;',
      'https://example.com',
    ]);
    expect(parsePersistedScanHistory(legacy)).toEqual(['https://example.com']);
  });

  it('handles invalid storage and caps persisted history at twenty entries', () => {
    expect(parsePersistedScanHistory('{broken')).toEqual([]);
    const history = Array.from({ length: 25 }, (_, index) => `https://example.com/${index}`);
    expect(filterPersistableScanHistory(history)).toHaveLength(20);
  });
});

describe('QR Wi-Fi payload parsing', () => {
  it('parses ssid, auth, password and hidden flag', () => {
    expect(parseWifiQrPayload('WIFI:T:WPA;S:home;P:s3cret;H:true;;')).toEqual({
      ssid: 'home',
      auth: 'WPA',
      password: 's3cret',
      hidden: true,
    });
  });

  it('defaults missing auth to nopass and handles escapes', () => {
    const parsed = parseWifiQrPayload('WIFI:S:café\\;bar;;');
    expect(parsed?.ssid).toBe('café;bar');
    expect(parsed?.auth).toBe('nopass');
    expect(parsed?.password).toBe('');
  });

  it('returns null when no SSID is present', () => {
    expect(parseWifiQrPayload('WIFI:T:WPA;P:secret;;')).toBeNull();
    expect(parseWifiQrPayload('WIFI:;;')).toBeNull();
  });
});

describe('QR Wi-Fi safe display labels', () => {
  it('passes non-Wi-Fi payloads through unchanged', () => {
    expect(wifiSafeDisplayLabel('https://example.com')).toBe('https://example.com');
    expect(wifiSafeDisplayLabel('hello world')).toBe('hello world');
  });

  it('shows only the SSID for parseable Wi-Fi payloads', () => {
    const label = wifiSafeDisplayLabel('WIFI:T:WPA;S:home;P:super-secret;;');
    expect(label).toBe('home');
    expect(label).not.toContain('super-secret');
  });

  it('redacts unparseable Wi-Fi payloads instead of leaking them raw', () => {
    const label = wifiSafeDisplayLabel('WIFI:T:WPA;P:super-secret;;');
    expect(label).not.toContain('super-secret');
    expect(label).not.toMatch(/^WIFI:/i);
  });
});
