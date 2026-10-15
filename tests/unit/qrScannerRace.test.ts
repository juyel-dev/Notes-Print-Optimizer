import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QrScannerView } from '../../components/qrgen/QrScannerView';

const qrMocks = vi.hoisted(() => ({
  instances: [] as unknown[],
  startPromise: null as Promise<void> | null,
  startCalls: 0,
  stopCalls: 0,
  clearCalls: 0,
}));

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class FakeHtml5Qrcode {
    state = 1;

    constructor() {
      qrMocks.instances.push(this);
    }

    async start() {
      qrMocks.startCalls += 1;
      await qrMocks.startPromise;
      this.state = 2;
    }

    getState() {
      return this.state;
    }

    async stop() {
      qrMocks.stopCalls += 1;
      this.state = 1;
    }

    clear() {
      qrMocks.clearCalls += 1;
    }

    async scanFile() {
      return 'mock-scan';
    }

    static async getCameras() {
      return [];
    }
  },
  Html5QrcodeSupportedFormats: { QR_CODE: 1 },
}));

describe('QrScannerView camera lifecycle', () => {
  beforeEach(() => {
    qrMocks.instances = [];
    qrMocks.startCalls = 0;
    qrMocks.stopCalls = 0;
    qrMocks.clearCalls = 0;
    qrMocks.startPromise = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stops a camera if start resolves after the scanner unmounts', async () => {
    let releaseStart!: () => void;
    qrMocks.startPromise = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });

    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(QrScannerView));
    });

    const startButton = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Start scanning'),
    );
    expect(startButton).toBeDefined();

    await act(async () => {
      startButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      for (let i = 0; i < 12 && qrMocks.startCalls === 0; i += 1) {
        await Promise.resolve();
      }
    });
    expect(qrMocks.startCalls).toBe(1);
    expect(qrMocks.stopCalls).toBe(0);

    await act(async () => {
      root.unmount();
    });

    // Mimic the browser permission/start request resolving only after unmount.
    releaseStart();
    await act(async () => {
      for (let i = 0; i < 12; i += 1) await Promise.resolve();
    });

    expect(qrMocks.stopCalls).toBe(1);
    expect(qrMocks.clearCalls).toBeGreaterThanOrEqual(2);
  });
});
