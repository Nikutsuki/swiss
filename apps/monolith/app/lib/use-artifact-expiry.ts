"use client";

import { useEffect, useState } from "react";

/**
 * Expiry progress (1 = full time left, 0 = expired) and a human-readable countdown for EXPIRES line.
 */
export function useArtifactExpiry(
  createdAt: string | undefined,
  expiresAt: string | undefined | null,
): { expirationProgress: number; remainingTime: string } {
  const [expirationProgress, setExpirationProgress] = useState(1);
  const [remainingTime, setRemainingTime] = useState("");

  useEffect(() => {
    if (!createdAt || !expiresAt) {
      setExpirationProgress(1);
      setRemainingTime("Never");
      return;
    }

    const updateTimer = () => {
      const expires = new Date(expiresAt).getTime();
      const created = new Date(createdAt).getTime();
      const now = Date.now();
      const total = expires - created;
      const left = expires - now;

      if (left <= 0 || total <= 0) {
        setExpirationProgress(0);
        setRemainingTime("Expired");
        return;
      }

      setExpirationProgress(left / total);

      const seconds = Math.floor((left / 1000) % 60);
      const minutes = Math.floor((left / 1000 / 60) % 60);
      const hours = Math.floor((left / 1000 / 60 / 60) % 24);
      const days = Math.floor(left / 1000 / 60 / 60 / 24);

      let timeStr = "";
      if (days > 0) timeStr += `${days}d `;
      timeStr += `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")} Remaining`;
      setRemainingTime(timeStr);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [createdAt, expiresAt]);

  return { expirationProgress, remainingTime };
}
