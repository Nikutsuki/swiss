"use client";

import { useEffect, useState } from "react";

type TypingAnimationProps = {
  texts: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  delayBetweenTexts?: number;
};

const TypingAnimation = ({
  texts,
  typingSpeed = 150,
  deletingSpeed = 75,
  delayBetweenTexts = 1000,
}: TypingAnimationProps) => {
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 500);
    return () => clearInterval(cursorInterval);
  }, []);

  useEffect(() => {
    if (!texts.length) {
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const currentText = texts[currentTextIndex] ?? "";

    if (!isDeleting && displayText === currentText) {
      timeout = setTimeout(() => setIsDeleting(true), delayBetweenTexts);
    } else if (isDeleting && displayText === "") {
      timeout = setTimeout(() => {
        setIsDeleting(false);
        setCurrentTextIndex((prev) => (prev + 1) % texts.length);
      }, 0);
    } else {
      const speed = isDeleting ? deletingSpeed : typingSpeed;
      timeout = setTimeout(() => {
        setDisplayText((prev) => {
          if (isDeleting) {
            return prev.substring(0, prev.length - 1);
          }
          return currentText.substring(0, prev.length + 1);
        });
      }, speed);
    }

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [
    currentTextIndex,
    delayBetweenTexts,
    deletingSpeed,
    displayText,
    isDeleting,
    texts,
    typingSpeed,
  ]);

  return (
    <span className="inline-block">
      {displayText}
      <span
        className={`ml-1 ${cursorVisible ? "opacity-100" : "opacity-0"} transition-opacity duration-100`}
      >
        |
      </span>
    </span>
  );
};

export default TypingAnimation;
