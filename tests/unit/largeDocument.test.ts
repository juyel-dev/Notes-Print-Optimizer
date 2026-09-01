import { describe, it, expect } from 'vitest';
import { MemoryGuard, memoryGuard } from '../../lib/pipeline/MemoryGuard';
import { computeScheduleProfile } from '../../lib/pipeline/types';

describe('MemoryGuard', () => {
  it('should detect memory limits based on device', () => {
    const guard = new MemoryGuard();
    const limits = guard.getLimits();
    expect(limits.maxHeapMB).toBeGreaterThan(0);
    expect(limits.evictThreshold).toBeGreaterThan(0);
    expect(limits.gcPressureThreshold).toBeGreaterThan(0);
  });

  it('canAllocate should return boolean', () => {
    expect(typeof memoryGuard.canAllocate(1024)).toBe('boolean');
  });

  it('trackAllocation and trackRelease should track bytes', () => {
    const guard = new MemoryGuard();
    guard.trackAllocation(1000);
    guard.trackAllocation(2000);
    expect(guard.getHighWaterMarkMB()).toBeGreaterThanOrEqual(0);
    guard.trackRelease(500);
  });

  it('isUnderPressure should return boolean', () => {
    expect(typeof memoryGuard.isUnderPressure()).toBe('boolean');
  });

  it('reset should clear state', () => {
    const guard = new MemoryGuard();
    guard.trackAllocation(99999);
    guard.reset();
    expect(guard.getHighWaterMarkMB()).toBe(0);
  });
});

describe('computeScheduleProfile', () => {
  it('should return low-tier for mobile devices', () => {
    const profile = computeScheduleProfile({
      cores: 4, memoryGB: 3, isMobile: true, isTablet: false,
      supportsWASM: false, supportsOffscreenCanvas: false, maxRenderDim: 1600,
    });
    expect(profile.renderConcurrency).toBe(1);
    expect(profile.maxPagesInFlight).toBe(2);
    expect(profile.targetDPI).toBe(150);
  });

  it('should return mid-tier for tablets', () => {
    const profile = computeScheduleProfile({
      cores: 6, memoryGB: 6, isMobile: false, isTablet: true,
      supportsWASM: true, supportsOffscreenCanvas: true, maxRenderDim: 2000,
    });
    expect(profile.processConcurrency).toBe(2);
    expect(profile.maxPagesInFlight).toBe(4);
    expect(profile.targetDPI).toBe(200);
  });

  it('should return high-tier for desktops', () => {
    const profile = computeScheduleProfile({
      cores: 8, memoryGB: 16, isMobile: false, isTablet: false,
      supportsWASM: true, supportsOffscreenCanvas: true, maxRenderDim: 2400,
    });
    expect(profile.renderConcurrency).toBe(2);
    expect(profile.maxPagesInFlight).toBe(8);
    expect(profile.targetDPI).toBe(250);
  });

  it('should handle 4GB desktop as low-tier (memoryGB <= 4)', () => {
    const profile = computeScheduleProfile({
      cores: 4, memoryGB: 4, isMobile: false, isTablet: false,
      supportsWASM: true, supportsOffscreenCanvas: true, maxRenderDim: 2000,
    });
    expect(profile.maxPagesInFlight).toBe(2);
    expect(profile.targetDPI).toBe(150);
  });
});
