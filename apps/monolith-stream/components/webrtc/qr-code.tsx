"use client";

import { QRCodeSVG } from "qrcode.react";

export function StreamJoinQR(props: { value: string; size?: number }) {
  const { value, size = 196 } = props;
  if (!value.trim()) return null;
  return (
    <div className="rounded-lg bg-white p-3 shadow">
      <QRCodeSVG value={value} size={size} level="M" />
    </div>
  );
}
