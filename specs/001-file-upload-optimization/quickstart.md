# Quickstart: File Upload Optimization

## Overview
This feature improves the file transfer performance and UI in the monolith-drop application.

## Development Setup

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Run the monolith-drop app**:
   ```bash
   pnpm --filter monolith-drop dev
   ```

3. **Run the signaling API** (if not already running):
   ```bash
   pnpm --filter signaling-api dev
   ```

## Verification

### Automated Tests
- Run vitest for telemetry utilities: `pnpm --filter monolith-drop test`
- Run vitest for signaling sender logic: `pnpm --filter @swiss/webrtc-signaling test`

### Manual Verification
1. Open two browser windows at `http://localhost:3000/session`.
2. Create a session in one and join from the other.
3. Select multiple files for upload (some large >100MB).
4. **Observe**:
   - Multiple progress cards are visible.
   - Speed (current/average) and ETA are displayed and stable (no flickering).
   - Speed for large files is improved due to optimized chunking.
   - Clicking "X" removes completed transfers.
