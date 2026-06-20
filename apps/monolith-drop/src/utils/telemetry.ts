/** EMA smoothing factor for instantaneous throughput (0–1). */
export const DEFAULT_SPEED_EMA_ALPHA = 0.1;

/** Blend weights: average vs EMA for ETA denominator. */
const ETA_AVG_WEIGHT = 0.8;
const ETA_EMA_WEIGHT = 0.3;

export type TelemetryState = {
  lastAt: number;
  lastBytes: number;
  startedAt: number;
  emaBps: number;
};

export type TelemetrySample = {
  currentSpeedBps: number;
  averageSpeedBps: number;
  etaSeconds: number | null;
};

export function initTelemetryState(nowMs: number): TelemetryState {
  return {
    lastAt: nowMs,
    lastBytes: 0,
    startedAt: nowMs,
    emaBps: 0,
  };
}

/**
 * Updates smoothed speed (EMA of raw deltas) and ETA from blended throughput.
 */
export function advanceTelemetry(
  prev: TelemetryState,
  progressBytes: number,
  totalBytes: number,
  nowMs: number,
  alpha: number = DEFAULT_SPEED_EMA_ALPHA,
): { next: TelemetryState; sample: TelemetrySample } {
  const dtSec = (nowMs - prev.lastAt) / 1000;
  let rawBps = 0;
  if (dtSec > 0 && progressBytes >= prev.lastBytes) {
    rawBps = (progressBytes - prev.lastBytes) / dtSec;
  }

  let emaBps = prev.emaBps;
  if (rawBps > 0) {
    emaBps = prev.emaBps <= 0 ? rawBps : alpha * rawBps + (1 - alpha) * prev.emaBps;
  }

  const elapsedSec = (nowMs - prev.startedAt) / 1000;
  const averageBps = elapsedSec > 0 ? progressBytes / elapsedSec : 0;

  const blendedBps = ETA_AVG_WEIGHT * averageBps + ETA_EMA_WEIGHT * emaBps;
  const remaining = Math.max(0, totalBytes - progressBytes);
  const etaSeconds =
    blendedBps > 1 && remaining > 0 ? remaining / blendedBps : null;

  return {
    next: {
      ...prev,
      lastAt: nowMs,
      lastBytes: progressBytes,
      emaBps,
    },
    sample: {
      currentSpeedBps: emaBps,
      averageSpeedBps: averageBps,
      etaSeconds,
    },
  };
}
