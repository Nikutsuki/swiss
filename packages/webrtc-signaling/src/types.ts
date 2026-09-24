export type {
  SignalingErrorPayload,
  SignalingMessage,
} from "./generated/signaling-backend";

export type P2PRole = "caller" | "callee";

/** Alias for server `error` envelope payloads (same as SignalingErrorPayload). */
export type ServerErrorPayload = import("./generated/signaling-backend").SignalingErrorPayload;
