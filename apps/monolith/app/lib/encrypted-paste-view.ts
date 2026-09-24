export function ciphertextExportText(c: {
  encrypted_title: string;
  encrypted_content: string;
}): string {
  return `encrypted_title (base64url):\n${c.encrypted_title || "—"}\n\nencrypted_content (base64url):\n${c.encrypted_content || "—"}`;
}
