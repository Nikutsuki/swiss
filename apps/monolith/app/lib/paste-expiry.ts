export type PasteExpiryFields = {
  payload_wiped: boolean;
  expires_at?: string;
};

export function isPasteExpiredClient(meta: PasteExpiryFields): boolean {
  if (meta.payload_wiped) return true;
  if (meta.expires_at) {
    const t = Date.parse(meta.expires_at);
    return !Number.isNaN(t) && t <= Date.now();
  }
  return false;
}
