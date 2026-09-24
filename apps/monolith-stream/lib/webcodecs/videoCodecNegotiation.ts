export const VIDEO_CODEC_PRIORITY = ["av01.0.08M.08", "vp09.00.10.08", "avc1.640028"] as const;

export type SupportedVideoCodec = (typeof VIDEO_CODEC_PRIORITY)[number];

export interface CodecCapabilities {
  encode: SupportedVideoCodec[];
  decode: SupportedVideoCodec[];
}

type HardwareAccelerationChoice = "prefer-hardware" | "prefer-software" | "no-preference";

const codecSupportCache = new Map<string, boolean>();
const bestEncodeAccelerationCache = new Map<SupportedVideoCodec, HardwareAccelerationChoice>();
const bestDecodeAccelerationCache = new Map<SupportedVideoCodec, HardwareAccelerationChoice>();

export function getBestEncodeHardwareAcceleration(
  codec: SupportedVideoCodec,
): HardwareAccelerationChoice | undefined {
  return bestEncodeAccelerationCache.get(codec);
}

export function getBestDecodeHardwareAcceleration(
  codec: SupportedVideoCodec,
): HardwareAccelerationChoice | undefined {
  return bestDecodeAccelerationCache.get(codec);
}

async function canEncode(codec: SupportedVideoCodec): Promise<boolean> {
  if (typeof window === "undefined" || typeof VideoEncoder === "undefined") {
    console.info("[webcodecs] canEncode: API missing", { codec, hasVideoEncoder: typeof VideoEncoder !== "undefined" });
    return false;
  }

  const cacheKey = `enc:${codec}`;
  const cached = codecSupportCache.get(cacheKey);
  if (cached != null) return cached;

  const candidates: Array<"prefer-hardware" | "prefer-software" | "no-preference"> = [
    "prefer-hardware",
    "prefer-software",
    "no-preference",
  ];

  for (const hardwareAcceleration of candidates) {
    try {
      const result = await VideoEncoder.isConfigSupported({
        codec,
        width: 640,
        height: 360,
        framerate: 30,
        bitrate: 1_000_000,
        hardwareAcceleration,
      });
      const supported = Boolean(result.supported);
      console.info("[webcodecs] canEncode", { codec, hardwareAcceleration, supported });
      if (supported) {
        codecSupportCache.set(cacheKey, true);
        bestEncodeAccelerationCache.set(codec, hardwareAcceleration);
        return true;
      }
    } catch {
      // Try next candidate.
      console.info("[webcodecs] canEncode: isConfigSupported threw", { codec, hardwareAcceleration, error: "unknown" });
    }
  }

  codecSupportCache.set(cacheKey, false);
  return false;
}

async function canDecode(codec: SupportedVideoCodec): Promise<boolean> {
  if (typeof window === "undefined" || typeof VideoDecoder === "undefined") {
    console.info("[webcodecs] canDecode: API missing", { codec, hasVideoDecoder: typeof VideoDecoder !== "undefined" });
    return false;
  }

  const cacheKey = `dec:${codec}`;
  const cached = codecSupportCache.get(cacheKey);
  if (cached != null) return cached;

  const candidates: Array<HardwareAccelerationChoice> = [
    "prefer-hardware",
    "prefer-software",
    "no-preference",
  ];

  for (const hardwareAcceleration of candidates) {
    try {
      const result = await VideoDecoder.isConfigSupported({
        codec,
        hardwareAcceleration,
      });
      const supported = Boolean(result.supported);
      console.info("[webcodecs] canDecode", { codec, hardwareAcceleration, supported });
      if (supported) {
        codecSupportCache.set(cacheKey, true);
        bestDecodeAccelerationCache.set(codec, hardwareAcceleration);
        return true;
      }
    } catch {
      console.info("[webcodecs] canDecode: isConfigSupported threw", { codec, hardwareAcceleration, error: "unknown" });
    }
  }

  codecSupportCache.set(cacheKey, false);
  return false;
}

export function normalizeCodecList(codecs: unknown): SupportedVideoCodec[] {
  if (!Array.isArray(codecs)) return [];

  const normalized = new Set<SupportedVideoCodec>();
  for (const codec of codecs) {
    if (typeof codec !== "string") continue;
    const lower = codec.toLowerCase();
    for (const candidate of VIDEO_CODEC_PRIORITY) {
      if (lower === candidate.toLowerCase()) {
        normalized.add(candidate);
      }
    }
  }

  return VIDEO_CODEC_PRIORITY.filter((codec) => normalized.has(codec));
}

export async function detectCodecCapabilities(): Promise<CodecCapabilities> {
  const encode: SupportedVideoCodec[] = [];
  const decode: SupportedVideoCodec[] = [];

  console.info("[webcodecs] Detecting codec capabilities...");
  for (const codec of VIDEO_CODEC_PRIORITY) {
    if (await canEncode(codec)) encode.push(codec);
    if (await canDecode(codec)) decode.push(codec);
  }

  console.info("[webcodecs] Detected codec capabilities", { encode, decode });
  return { encode, decode };
}

export function pickMutualCodec(local: CodecCapabilities, remote: CodecCapabilities): SupportedVideoCodec | null {
  for (const codec of VIDEO_CODEC_PRIORITY) {
    const localCanEncode = local.encode.includes(codec);
    const localCanDecode = local.decode.includes(codec);
    const remoteCanEncode = remote.encode.includes(codec);
    const remoteCanDecode = remote.decode.includes(codec);
    if (localCanEncode && localCanDecode && remoteCanEncode && remoteCanDecode) {
      return codec;
    }
  }
  return null;
}
