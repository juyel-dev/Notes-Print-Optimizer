import { describe, expect, it } from 'vitest';
import {
  filterPersistableScanHistory,
  isWifiQrPayload,
  parsePersistedScanHistory,
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
