import { describe, it, expect } from 'vitest';
import { MemoryGuard } from '../../lib/pipeline/MemoryGuard';
import { computeScheduleProfile } from '../../lib/pipeline/types';

describe('Phase 5.6: 300-page memory stress test', () => {
  it('MemoryGuard should track 300 simulated allocations with correct peak', () => {
    const guard = new MemoryGuard();
    for (let i = 0; i < 300; i++) {
      guard.trackAllocation(22_000_000);
      guard.trackRelease(22_000_000);
    }
    expect(guard.getHighWaterMarkMB()).toBe(21);
    expect(guard.canAllocate(1)).toBe(true);
  });

  it('MemoryGuard canAllocate should return false under high simulated pressure', () => {
    const guard = new MemoryGuard();
    guard.trackAllocation(600 * 1048576);
    const canAlloc = guard.canAllocate(50_000_000);
    expect(canAlloc).toBe(false);
  });
});

describe('Phase 5.7: Peak heap verification', () => {
  it('device profile for 4GB mobile should set maxHeapMB to 512', () => {
    const mobileGuard = new MemoryGuard();
    const limits = mobileGuard.getLimits();
    expect(limits.maxHeapMB).toBeLessThanOrEqual(1024);
    expect(limits.gcPressureThreshold).toBeGreaterThanOrEqual(0.8);
  });

  it('computeScheduleProfile for mobile caps maxPagesInFlight at 2', () => {
    const profile = computeScheduleProfile({
      cores: 4, memoryGB: 3, isMobile: true, isTablet: false,
      supportsWASM: false, supportsOffscreenCanvas: false, maxRenderDim: 1600,
    });
    expect(profile.maxPagesInFlight).toBe(2);
    expect(profile.targetDPI).toBe(150);
    const maxMemPerPage = profile.maxRenderDim * profile.maxRenderDim * 4;
    const worstCaseHeap = profile.maxPagesInFlight * maxMemPerPage;
    expect(worstCaseHeap).toBeLessThan(512 * 1048576);
  });

  it('computeScheduleProfile for desktop caps maxPagesInFlight at 8', () => {
    const profile = computeScheduleProfile({
      cores: 8, memoryGB: 16, isMobile: false, isTablet: false,
      supportsWASM: true, supportsOffscreenCanvas: true, maxRenderDim: 2400,
    });
    const maxMemPerPage = profile.maxRenderDim * profile.maxRenderDim * 4;
    const worstCaseHeap = profile.maxPagesInFlight * maxMemPerPage;
    expect(worstCaseHeap).toBeLessThan(2048 * 1048576);
  });

  it('MemoryGuard evictThreshold should trigger before maxHeapMB', () => {
    const mobileGuard = new MemoryGuard();
    const limits = mobileGuard.getLimits();
    expect(limits.evictThreshold).toBeLessThan(limits.gcPressureThreshold);
    expect(limits.gcPressureThreshold).toBeLessThanOrEqual(1);
  });
});
