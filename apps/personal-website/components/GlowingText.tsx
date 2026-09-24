"use client";

import { useEffect, useMemo, useRef } from "react";
import useMousePosition from "@/components/MousePosition";

type GlowingTextProps = {
  text: string;
};

const GlowingText = ({ text }: GlowingTextProps) => {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const mouse = useMousePosition();
  const characters = useMemo(() => text.split(""), [text]);

  useEffect(() => {
    if (!containerRef.current || mouse.x === null || mouse.y === null || characters.length === 0) {
      return;
    }
    const mouseX = mouse.x;
    const mouseY = mouse.y;

    const charElements = containerRef.current.querySelectorAll<HTMLElement>(".char");
    charElements.forEach((charEl) => {
      const charRect = charEl.getBoundingClientRect();
      const charCenterX = charRect.left + charRect.width / 2;
      const charCenterY = charRect.top + charRect.height / 2;

      const distance = Math.sqrt(
        Math.pow(mouseX - charCenterX, 2) + Math.pow(mouseY - charCenterY, 2),
      );
      const maxDistance = 200;
      const intensity = Math.max(0, 1 - distance / maxDistance);

      if (intensity > 0) {
        const fontWeight = Math.min(800, 300 + Math.round(intensity * 500));
        charEl.style.fontWeight = `${fontWeight}`;
        charEl.style.textShadow = "0 0 6px oklch(0.777 0.152 181.912)";
      } else {
        charEl.style.fontWeight = "300";
        charEl.style.textShadow = "0 0 6px oklch(0.777 0.152 181.912)";
      }
    });
  }, [characters, mouse]);

  return (
    <span ref={containerRef}>
      {characters.map((char, index) => (
        <span
          key={`${char}-${index}`}
          className="char text-xl sm:text-3xl md:text-5xl lg:text-6xl font-mono font-light text-teal-400 quote_shadow mb-2 md:mb-6"
        >
          {char}
        </span>
      ))}
    </span>
  );
};

export default GlowingText;
