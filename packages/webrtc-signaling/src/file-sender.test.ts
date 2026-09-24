import { describe, expect, it } from "vitest";

import { getChunkingOptionsForFileSize } from "./file-sender";

describe("getChunkingOptionsForFileSize", () => {
  it("uses 64KiB / 1MiB buffer for files under 10MB", () => {
    const o = getChunkingOptionsForFileSize(9 * 1024 * 1024);
    expect(o.chunkPayloadSize).toBe(64 * 1024);
    expect(o.maxBufferedAmount).toBe(1024 * 1024);
  });

  it("uses 128KiB / 2MiB for files between 10MB and 100MB", () => {
    const o = getChunkingOptionsForFileSize(50 * 1024 * 1024);
    expect(o.chunkPayloadSize).toBe(128 * 1024);
    expect(o.maxBufferedAmount).toBe(2 * 1024 * 1024);
  });

  it("uses 256KiB / 4MiB for files over 100MB", () => {
    const o = getChunkingOptionsForFileSize(150 * 1024 * 1024);
    expect(o.chunkPayloadSize).toBe(256 * 1024);
    expect(o.maxBufferedAmount).toBe(4 * 1024 * 1024);
  });

  it("treats exactly 10MB as mid tier", () => {
    const o = getChunkingOptionsForFileSize(10 * 1024 * 1024);
    expect(o.chunkPayloadSize).toBe(128 * 1024);
  });

  it("treats exactly 100MB as mid tier", () => {
    const o = getChunkingOptionsForFileSize(100 * 1024 * 1024);
    expect(o.chunkPayloadSize).toBe(128 * 1024);
  });
});
