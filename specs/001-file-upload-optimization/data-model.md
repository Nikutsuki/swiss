# Data Model: File Upload Optimization

## Entities

### TransferSession

Represents an individual file transfer (upload or download) within the session workspace.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier (e.g., `out-X` or `in-Y`) |
| name | string | Original filename |
| size | number | Total file size in bytes |
| bytesTransfered | number | Total bytes sent or received so far |
| status | enum | `queued`, `active`, `done`, `error` |
| startTime | number | Timestamp when the transfer actually started |
| lastUpdateAt | number | Timestamp of the last progress update |
| currentSpeedEMA | number | Smoothed instantaneous speed (Exponential Moving Average) |
| averageSpeed | number | Overall average speed (bytes / total_time) |
| etaSeconds | number | Estimated seconds remaining |

## UI State Structure

The `SessionWorkspace` state will be refactored from single primary objects to collections:

```typescript
type TransferMap = Record<string, TransferSession>;

interface WorkspaceState {
  outgoing: TransferMap;
  incoming: TransferMap;
  // ... other state
}
```

## State Transitions

- **queued → active**: When `sendFileOverDataChannel` starts for an entry.
- **active → done**: On `onComplete` or successful resolution of the send promise.
- **active → error**: On `onError` or rejection of the send promise.
- **any → removed**: When the user clicks the "X" button.
