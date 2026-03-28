# Feature Specification: Optimize file upload UX and performance

**Feature Branch**: `001-file-upload-optimization`  
**Created**: 2026-03-28  
**Status**: Draft  
**Input**: User description: "@apps/monolith-drop/app/session is it possible to optimize the file upload for big files? currently the status seems to show that very small chunks are being uploaded and it tanks teh speed, also if im uploading several files at once they should all be disabled in the nice progress bar card at teh bottom, currently if 1 file is uploading and i upload a second one it just gets replaced, add a nice X button to close the already uploaded files, also add some sort of smoothing to the upload speed/downloaded amount cuz rn its just flickering, add some sort of debouncing or average, also split it into two things, current download/upload and average, and also add estimated time"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Efficient Large File Upload (Priority: P1)

As a user, I want to upload large files (e.g., >100MB) quickly and see accurate progress, so I don't have to wait unnecessarily long or wonder if the upload is stalled.

**Why this priority**: Performance is the core issue identified; "tanking speed" prevents the app from being usable for its primary purpose with large files.

**Independent Test**: Upload a 500MB file and verify that the upload speed is significantly higher than the baseline and the progress bar moves smoothly.

**Acceptance Scenarios**:

1. **Given** a large file selected for upload, **When** the upload starts, **Then** the system uses optimized chunk sizes to maintain high throughput.
2. **Given** an ongoing large upload, **When** viewing the progress card, **Then** the progress percentage and speed indicators update smoothly without flickering.

---

### User Story 2 - Concurrent Upload Management (Priority: P1)

As a user, I want to upload multiple files simultaneously and see the status of each, so I can manage my upload queue effectively.

**Why this priority**: Current behavior replaces the existing upload UI when a new one starts, making it impossible to track multiple transfers.

**Independent Test**: Start three concurrent file uploads and verify that all three are visible in the progress area.

**Acceptance Scenarios**:

1. **Given** one file is already uploading, **When** a second file is added, **Then** both uploads are displayed as separate entries in the progress card.
2. **Given** multiple active uploads, **When** one completes, **Then** the others remain visible and active.

---

### User Story 3 - Advanced Transfer Telemetry (Priority: P2)

As a user, I want to see detailed information about my upload progress, including current speed, average speed, and estimated time remaining.

**Why this priority**: Provides transparency and allows users to plan their work based on the expected completion time.

**Independent Test**: During an upload, verify that "Current Speed", "Average Speed", and "Estimated Time" are displayed and updated.

**Acceptance Scenarios**:

1. **Given** an active upload, **When** viewing the status, **Then** the system displays the instantaneous transfer rate and the overall average rate.
2. **Given** an active upload, **When** it has been running for at least 10 seconds, **Then** a calculated "Time Remaining" (ETA) is displayed.

---

### User Story 4 - Clean Up Upload Queue (Priority: P3)

As a user, I want to dismiss completed or cancelled uploads from my view, so I can keep my workspace tidy.

**Why this priority**: Prevents the progress card from becoming cluttered with old information.

**Independent Test**: Click the "X" button on a completed upload and verify it disappears from the list.

**Acceptance Scenarios**:

1. **Given** a completed or failed upload entry in the list, **When** I click the "X" button, **Then** that specific entry is removed from the UI.

## Edge Cases

- **Network Fluctuation**: How does the system handle a sudden drop in bandwidth or momentary disconnection during a large chunk upload?
- **Extreme Concurrency**: What happens if a user adds 50+ files at once? (Should there be a scrollable list or a limit?)
- **Zero-byte Files**: Does the system handle tiny or empty files gracefully without flickering or showing "Infinite" ETA?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST optimize chunk size for file uploads based on file size to maximize throughput.
- **FR-002**: System MUST support displaying multiple concurrent upload progress entries in the UI.
- **FR-003**: System MUST provide an "X" button for each upload entry to allow the user to dismiss it from the list.
- **FR-004**: System MUST calculate and display both instantaneous (current) and overall average upload speeds.
- **FR-005**: System MUST calculate and display an estimated time of completion (ETA) for each active upload.
- **FR-006**: System MUST apply a smoothing algorithm (e.g., moving average) to speed and ETA values to prevent UI flickering.
- **FR-007**: System MUST prevent new uploads from overwriting the UI state of existing active uploads.

### Key Entities

- **Upload Session**: Represents a single file transfer, tracking its unique ID, filename, total size, uploaded bytes, start time, current speed, average speed, and status (Uploading, Completed, Failed).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Large file (>100MB) upload speed is improved by at least 20% compared to the baseline implementation.
- **SC-002**: UI updates for speed and progress are smoothed such that values do not change more than twice per second (reducing flicker).
- **SC-003**: 100% of concurrent uploads started by the user are visible in the UI without being replaced by newer ones.
- **SC-004**: Users can dismiss any single upload entry from the UI with a single click.

## Assumptions

- The backend supports dynamic chunking or can handle larger fixed chunk sizes without timeout issues.
- The "nice progress bar card at the bottom" refers to the current transfer status component in `apps/monolith-drop`.
- "Disabled" in the user prompt was interpreted as "displayed" or "persisted" based on the context ("currently it gets replaced").
- Standard browser `File` and `ProgressEvent` APIs are sufficient for collecting the raw data needed for telemetry.
