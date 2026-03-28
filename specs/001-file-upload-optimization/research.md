# Research: File Upload Optimization

## Decision 1: Dynamic Chunking Strategy

### Decision
Implement a dynamic `chunkPayloadSize` and `maxBufferedAmount` based on the file size.

### Rationale
Small files (e.g., <1MB) benefit from small chunks to provide granular progress. Large files (>100MB) benefit from larger chunks (e.g., 256KB or 512KB) to reduce the overhead of framing and the number of `dc.send` calls, which can improve throughput on high-latency or high-bandwidth connections.

- **Files < 10MB**: 64KB chunks, 1MB buffer.
- **Files 10MB - 100MB**: 128KB chunks, 2MB buffer.
- **Files > 100MB**: 256KB chunks, 4MB buffer.

*Note: Chromium has a 256KB limit for `dc.send` on older versions, but modern browsers support larger. We will stick to 256KB as a safe high-performance maximum.*

### Alternatives Considered
- **Fixed 1MB chunks**: Risks blocking the main thread for too long during serialization and might exceed `DataChannel` message limits on some browsers.
- **Adaptive chunking based on RTT**: Too complex to implement reliably without a control channel or transport-level metrics.

---

## Decision 2: Telemetry Smoothing Algorithm

### Decision
Use an **Exponential Moving Average (EMA)** for instantaneous speed and a **Linear Regression** or **Windowed Average** for ETA.

### Rationale
Instantaneous speed calculation `(delta_bytes / delta_time)` is highly volatile. An EMA (e.g., `alpha = 0.2`) provides a smooth value that still reacts to major changes.

For ETA, we will use the **Average Speed** (Total Bytes Sent / Total Time Elapsed) as it's more stable for long-term estimation, but weighted with the recent EMA speed for better accuracy during fluctuating conditions.

### Alternatives Considered
- **Simple Moving Average (SMA)**: Requires storing a history of samples, consuming more memory.
- **Debouncing**: Only updates the UI less frequently, but the values themselves would still jump.

---

## Decision 3: Multi-file UI Architecture

### Decision
Refactor `session-workspace.tsx` to use an object/map for `outgoing` and `incoming` transfers keyed by `transferId`. Render a list of `TransferCard` components.

### Rationale
Currently, the UI only tracks the latest transfer. Using a map/array allows tracking all active, completed, and failed transfers. Adding a `dismissed` flag or simply removing from the state allows the "X" button functionality.

### Alternatives Considered
- **Toast notifications**: Hard to track progress for multiple files at once.
- **Modal queue**: Obscures the main workspace.
