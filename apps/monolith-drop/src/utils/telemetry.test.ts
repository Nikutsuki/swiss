import { describe, expect, it } from "vitest";

import {
  DEFAULT_SPEED_EMA_ALPHA,
  advanceTelemetry,
  initTelemetryState,
} from "./telemetry";

describe("advanceTelemetry", () => {
  it("initializes EMA from first non-zero raw speed", () => {
    const t0 = 1000;
    const s0 = initTelemetryState(t0);
    const { next, sample } = advanceTelemetry(s0, 0, 1_000_000, t0 + 1000);
    expect(sample.currentSpeedBps).toBe(0);
    expect(sample.averageSpeedBps).toBe(0);
    expect(sample.etaSeconds).toBeNull();

    const { next: n2, sample: sam2 } = advanceTelemetry(next, 100_000, 1_000_000, t0 + 2000);
    expect(sam2.currentSpeedBps).toBe(100_000);
    expect(sam2.averageSpeedBps).toBeCloseTo(50_000, 0);
    expect(n2.emaBps).toBe(100_000);
  });

  it("smooths speed with EMA across samples", () => {
    const t0 = 0;
    let state = initTelemetryState(t0);
    state = advanceTelemetry(state, 0, 10_000_000, 0).next;
    const s1 = advanceTelemetry(state, 1_000_000, 10_000_000, 1000);
    expect(s1.sample.currentSpeedBps).toBe(1_000_000);
    const s2 = advanceTelemetry(s1.next, 1_100_000, 10_000_000, 2000);
    const alpha = DEFAULT_SPEED_EMA_ALPHA;
    const expectedEma = alpha * 100_000 + (1 - alpha) * 1_000_000;
    expect(s2.sample.currentSpeedBps).toBeCloseTo(expectedEma, -3);
  });

  it("computes ETA when blended throughput is stable", () => {
    const t0 = 0;
    let state = initTelemetryState(t0);
    for (let i = 1; i <= 5; i++) {
      const bytes = i * 500_000;
      const { next, sample } = advanceTelemetry(
        state,
        bytes,
        5_000_000,
        i * 1000,
        DEFAULT_SPEED_EMA_ALPHA,
      );
      state = next;
      if (i === 5) {
        expect(sample.etaSeconds).not.toBeNull();
        expect(sample.etaSeconds!).toBeGreaterThan(0);
        expect(sample.etaSeconds!).toBeLessThan(20);
      }
    }
  });
});
