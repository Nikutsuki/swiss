"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import TypingAnimation from "@/components/TypingAnimation";
import GlowingText from "@/components/GlowingText";

export default function Home() {
  const [activeSection, setActiveSection] = useState(0);
  const [inQuoteSection, setInQuoteSection] = useState(false);
  const sections = ["Intro", "About", "Skills", "Projects", "Contact"];
  const projects: Array<{ name: string; bullets: string[]; screenshots: string[]; liveUrl: string }> = [
    {
      name: "Monolith",
      bullets: [
        "End-to-end encrypted pastebin built for private, secure text sharing.",
        "Includes passkey-based passwordless authentication for strong account security.",
        "App-wide auth and utility flow designed for clean UX and secure defaults.",
      ],
      screenshots: ["/projects/monolith.png"],
      liveUrl: "https://monolith.nikutsuki.top",
    },
    {
      name: "Monolith Stream",
      bullets: [
        "Watch-together platform with shared lobbies and synchronized playback behavior.",
        "Real-time collaboration focus with responsive controls for multi-user sessions.",
        "Strong UX emphasis for quickly starting and managing stream rooms.",
      ],
      screenshots: ["/projects/monolith-stream.png"],
      liveUrl: "https://stream.nikutsuki.top",
    },
    {
      name: "Monolith Drop",
      bullets: [
        "Peer-to-peer file transfer app built around short-lived session sharing.",
        "Practical transfer UX aimed at quick setup and low-friction handoff.",
        "Session-oriented flow that keeps file exchange simple and focused.",
      ],
      screenshots: ["/projects/monolith-drop.png"],
      liveUrl: "https://drop.nikutsuki.top",
    },
  ];
  const scrollingRef = useRef(false);
  const [isLastSection, setIsLastSection] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeProject, setActiveProject] = useState(0);
  const [activeScreenshot, setActiveScreenshot] = useState(0);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);
  const mainContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      const legacyNavigator = navigator as Navigator & { msMaxTouchPoints?: number };
      const hasTouchCapability =
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        (legacyNavigator.msMaxTouchPoints ?? 0) > 0;

      const isNarrowScreen = window.innerWidth < 768;
      const isPortrait = window.innerHeight > window.innerWidth;
      const mobileDetected = isNarrowScreen && (hasTouchCapability || isPortrait);

      setIsMobile(mobileDetected);
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    window.addEventListener("orientationchange", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
      window.removeEventListener("orientationchange", checkMobile);
    };
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const sectionElements = document.querySelectorAll<HTMLElement>("section:not(.quote-section)");
      const scrollPosition = window.scrollY + window.innerHeight / 2;

      let inSection = false;
      let isInQuoteSection = false;

      const quoteSection = document.querySelector<HTMLElement>(".quote-section");
      if (quoteSection) {
        const quoteSectionTop = quoteSection.offsetTop;
        const quoteSectionBottom = quoteSectionTop + quoteSection.offsetHeight;

        if (scrollPosition >= quoteSectionTop && scrollPosition < quoteSectionBottom) {
          isInQuoteSection = true;
          setInQuoteSection(true);
        } else {
          setInQuoteSection(false);
        }
      }

      if (isInQuoteSection) {
        return;
      }

      sectionElements.forEach((section, index) => {
        const sectionTop = section.offsetTop;
        const sectionBottom = sectionTop + section.offsetHeight;

        if (scrollPosition >= sectionTop && scrollPosition < sectionBottom) {
          setActiveSection(index);
          inSection = true;
          setIsLastSection(index === sectionElements.length - 1);
        }
      });

      if (!inSection) {
        const quoteSectionEl = document.querySelector<HTMLElement>(".quote-section");
        if (quoteSectionEl) {
          const quoteSectionTop = quoteSectionEl.offsetTop;
          const quoteSectionBottom = quoteSectionTop + quoteSectionEl.offsetHeight;

          if (scrollPosition >= quoteSectionTop && scrollPosition < quoteSectionBottom) {
            if (scrollPosition < quoteSectionTop + quoteSectionEl.offsetHeight / 2) {
              setActiveSection(2);
            } else {
              setActiveSection(3);
            }
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleDesktopScroll = useCallback(() => {
    const handleWheel = (e: WheelEvent) => {
      if (scrollingRef.current) {
        e.preventDefault();
        return;
      }

      scrollingRef.current = true;

      const allSections = document.querySelectorAll<HTMLElement>("section");
      const scrollPosition = window.scrollY + window.innerHeight / 2;
      let currentVisibleSectionIndex = -1;

      allSections.forEach((section, index) => {
        const sectionTop = section.offsetTop;
        const sectionBottom = sectionTop + section.offsetHeight;
        if (scrollPosition >= sectionTop && scrollPosition < sectionBottom) {
          currentVisibleSectionIndex = index;
        }
      });

      const direction = e.deltaY > 0 ? 1 : -1;
      let nextSectionIndex = currentVisibleSectionIndex + direction;
      if (nextSectionIndex < 0) nextSectionIndex = 0;
      if (nextSectionIndex >= allSections.length) nextSectionIndex = allSections.length - 1;
      e.preventDefault();

      const nextSection = allSections[nextSectionIndex];
      if (nextSection && nextSectionIndex !== currentVisibleSectionIndex) {
        window.scrollTo({ top: nextSection.offsetTop, behavior: "smooth" });

        const isNextSectionQuote = nextSection.classList.contains("quote-section");
        if (isNextSectionQuote) {
          setInQuoteSection(true);
        } else {
          setInQuoteSection(false);
          let regularIndex = 0;
          for (let i = 0; i < nextSectionIndex; i += 1) {
            if (!allSections[i]?.classList.contains("quote-section")) {
              regularIndex += 1;
            }
          }
          setActiveSection(regularIndex);
        }
      } else {
        scrollingRef.current = false;
      }

      setTimeout(() => {
        scrollingRef.current = false;
      }, 500);
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  const handleMobileScroll = useCallback(() => {
    let currentTouchY = 0;
    let lastScrollTime = 0;
    const touchThreshold = 50;
    const scrollCooldown = 700;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0]?.clientY ?? 0;
      currentTouchY = touchStartY.current;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) {
        return;
      }

      e.preventDefault();
      currentTouchY = e.touches[0]?.clientY ?? 0;
      const touchDiff = touchStartY.current - currentTouchY;

      if (scrollingRef.current || Date.now() - lastScrollTime < scrollCooldown) {
        return;
      }

      if (Math.abs(touchDiff) < touchThreshold) {
        return;
      }

      scrollingRef.current = true;
      lastScrollTime = Date.now();

      const allSections = document.querySelectorAll<HTMLElement>("section");
      const scrollPosition = window.scrollY + window.innerHeight / 2;
      let currentVisibleSectionIndex = -1;

      allSections.forEach((section, index) => {
        const sectionTop = section.offsetTop;
        const sectionBottom = sectionTop + section.offsetHeight;
        if (scrollPosition >= sectionTop && scrollPosition < sectionBottom) {
          currentVisibleSectionIndex = index;
        }
      });

      const direction = touchDiff > 0 ? 1 : -1;
      let nextSectionIndex = currentVisibleSectionIndex + direction;
      if (nextSectionIndex < 0) nextSectionIndex = 0;
      if (nextSectionIndex >= allSections.length) nextSectionIndex = allSections.length - 1;

      const nextSection = allSections[nextSectionIndex];
      if (nextSection && nextSectionIndex !== currentVisibleSectionIndex) {
        window.scrollTo({ top: nextSection.offsetTop, behavior: "smooth" });

        const isNextSectionQuote = nextSection.classList.contains("quote-section");
        if (isNextSectionQuote) {
          setInQuoteSection(true);
        } else {
          setInQuoteSection(false);
          let regularIndex = 0;
          for (let i = 0; i < nextSectionIndex; i += 1) {
            if (!allSections[i]?.classList.contains("quote-section")) {
              regularIndex += 1;
            }
          }
          setActiveSection(regularIndex);
        }

        touchStartY.current = currentTouchY;
      }

      setTimeout(() => {
        scrollingRef.current = false;
      }, scrollCooldown - 50);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      touchEndY.current = e.changedTouches[0]?.clientY ?? 0;
    };

    const container = mainContainerRef.current;
    if (!container) {
      return () => {};
    }

    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: false });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  useEffect(() => {
    const cleanup = isMobile ? handleMobileScroll() : handleDesktopScroll();
    return cleanup;
  }, [handleDesktopScroll, handleMobileScroll, isMobile]);

  const scrollToSection = (index: number) => {
    const sectionElements = document.querySelectorAll<HTMLElement>("section:not(.quote-section)");
    const section = sectionElements[index];
    if (!section) {
      return;
    }
    window.scrollTo({ top: section.offsetTop, behavior: "smooth" });
  };

  const scrollToNextSection = () => {
    const allSections = document.querySelectorAll<HTMLElement>("section");
    const regularSections = document.querySelectorAll<HTMLElement>("section:not(.quote-section)");

    if (!inQuoteSection) {
      const nextRegularSectionIndex = activeSection + 1;
      const nextRegularSection = regularSections[nextRegularSectionIndex];
      if (nextRegularSection) {
        window.scrollTo({ top: nextRegularSection.offsetTop, behavior: "smooth" });
      }
      return;
    }

    const quoteSection = document.querySelector<HTMLElement>(".quote-section");
    let quoteSectionIndex = -1;
    for (let i = 0; i < allSections.length; i += 1) {
      if (allSections[i] === quoteSection) {
        quoteSectionIndex = i;
        break;
      }
    }

    if (quoteSectionIndex !== -1) {
      const nextSection = allSections[quoteSectionIndex + 1];
      if (nextSection) {
        window.scrollTo({ top: nextSection.offsetTop, behavior: "smooth" });
      }
    }
  };

  const goToNextProject = useCallback(() => {
    setActiveScreenshot(0);
    setActiveProject((prev) => (prev + 1) % projects.length);
  }, [projects.length]);

  const goToPrevProject = useCallback(() => {
    setActiveScreenshot(0);
    setActiveProject((prev) => (prev - 1 + projects.length) % projects.length);
  }, [projects.length]);

  const currentProject = projects[activeProject] ?? projects[0];
  const currentScreenshots = currentProject?.screenshots ?? [];

  const goToNextScreenshot = useCallback(() => {
    if (!currentScreenshots.length) {
      return;
    }
    setActiveScreenshot((prev) => (prev + 1) % currentScreenshots.length);
  }, [currentScreenshots.length]);

  const goToPrevScreenshot = useCallback(() => {
    if (!currentScreenshots.length) {
      return;
    }
    setActiveScreenshot((prev) => (prev - 1 + currentScreenshots.length) % currentScreenshots.length);
  }, [currentScreenshots.length]);

  return (
    <div
      ref={mainContainerRef}
      className="flex flex-col items-center min-h-screen relative overflow-hidden z-0 justify-center"
      style={{
        backgroundColor: "#0a0a0a",
        backgroundImage: "radial-gradient(circle, #808080 0px, transparent 1px)",
        backgroundSize: "60px 60px",
      }}
    >
      <header className="fixed top-0 left-0 w-full bg-black/80 backdrop-blur-sm z-50 py-3 border-b border-gray-800">
        <nav className="container mx-auto px-4 flex justify-between items-center">
          <button
            className="md:hidden text-white p-2 focus:outline-none"
            onClick={toggleMobileMenu}
            aria-label="Toggle menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {mobileMenuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>

          <span className="md:hidden text-teal-300 font-mono font-bold">Matthew</span>

          <ul className="hidden md:flex space-x-8 md:space-x-10 lg:space-x-16 justify-center mx-auto">
            {sections.map((section, index) => (
              <li key={section}>
                <button
                  onClick={() => {
                    scrollToSection(index);
                    setMobileMenuOpen(false);
                  }}
                  className={`font-mono text-sm md:text-base transition-colors duration-300 ${
                    !inQuoteSection && activeSection === index
                      ? "text-teal-300"
                      : "text-white hover:text-teal-100"
                  }`}
                >
                  <span className="mr-2">{index}.</span>
                  <span className="uppercase">{section}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="w-6 md:hidden" />
        </nav>

        <div
          className={`md:hidden absolute w-full bg-black/95 backdrop-blur-md transition-all duration-300 ease-in-out overflow-hidden border-t border-gray-800 ${
            mobileMenuOpen ? "max-h-[300px] py-4" : "max-h-0"
          }`}
        >
          <ul className="flex flex-col items-center space-y-4 py-2">
            {sections.map((section, index) => (
              <li key={`${section}-mobile`} className="w-full text-center">
                <button
                  onClick={() => {
                    scrollToSection(index);
                    setMobileMenuOpen(false);
                  }}
                  className={`font-mono text-base py-2 transition-colors duration-300 ${
                    !inQuoteSection && activeSection === index
                      ? "text-teal-300"
                      : "text-white hover:text-teal-100"
                  }`}
                >
                  <span className="mr-2">{index}.</span>
                  <span className="uppercase">{section}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </header>

      <div className="hidden md:flex fixed right-10 top-1/2 transform -translate-y-1/2 z-50 flex-col gap-4">
        {sections.map((section, index) => (
          <button
            key={`${section}-dot`}
            onClick={() => scrollToSection(index)}
            className={`w-4 h-4 rounded-full transition-all duration-300 ${
              !inQuoteSection && activeSection === index ? "bg-teal-300" : "bg-white"
            } cursor-pointer`}
            aria-label={`Navigate to ${section} section`}
          />
        ))}
      </div>

      <button
        onClick={scrollToNextSection}
        className={`fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-black/50 p-3 rounded-full border border-teal-500 hover:bg-teal-500 transition-all duration-300 animate-bounce cursor-pointer group ${
          isLastSection ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        aria-label="Go to next section"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-teal-400 group-hover:text-black transition-colors duration-300"
        >
          <polyline points="6 9 12 15 18 9" className="group-hover:bg-teal-400" />
        </svg>
      </button>

      <section className="w-full md:w-4/5 h-dvh relative flex flex-col items-center justify-center px-4 md:px-6">
        <div className="flex w-full h-2/3 flex-col items-center justify-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-mono font-semibold text-teal-300 drop-shadow-[0_0_15px_rgba(20,184,166,0.9)]">
            Matthew
          </h1>
          <div className="text-xl sm:text-2xl md:text-3xl font-mono mt-4 text-neutral-300 text-center text-wrap px-2">
            <TypingAnimation
              texts={[
                "Web Developer",
                "Problem Solver",
                "Rust Enjoyer",
                "Low Level Passionate",
                "Reverse Engineer",
                "Idk what to tell you ¯\\_(ツ)_/¯",
              ]}
              typingSpeed={100}
              deletingSpeed={100}
              delayBetweenTexts={2000}
            />
          </div>
        </div>
      </section>

      <section className="w-full md:w-4/5 h-dvh relative flex flex-col items-center justify-center p-4 md:p-8">
        <h2 className="text-3xl md:text-4xl font-mono font-semibold text-teal-300 mb-4 md:mb-8">About Me</h2>
        <div className="max-w-3xl text-white overflow-y-auto max-h-[70vh] md:max-h-none pr-2">
          <p className="mb-3 text-xs sm:text-sm md:text-lg lg:text-xl font-mono text-neutral-300">
            I&apos;m a passionate software engineer with <span className="text-teal-300 font-semibold">4 years</span>{" "}
            of programming experience, but my journey with computers started much earlier.
          </p>
          <p className="mb-3 text-xs sm:text-sm md:text-lg lg:text-xl font-mono text-neutral-300">
            My fascination with technology began when I was just{" "}
            <span className="text-teal-300 font-semibold">10 years old</span>, tinkering with every device I could
            get my hands on. By <span className="text-teal-300 font-semibold">15</span>, I had written my first lines
            of code, and I was immediately hooked by the ability to create something from nothing but logic and
            imagination.
          </p>
          <p className="mb-3 text-xs sm:text-sm md:text-lg lg:text-xl font-mono text-neutral-300">
            Throughout my career, I&apos;ve worked on a diverse range of projects, from web applications to low-level
            systems. I&apos;m particularly drawn to challenging problems that require creative solutions and deep
            technical understanding.
          </p>
          <p className="mb-3 text-xs sm:text-sm md:text-lg lg:text-xl font-mono text-neutral-300">
            My passion for understanding how things work at a fundamental level has led me to explore reverse
            engineering and low-level programming. I enjoy taking apart complex systems to understand their inner
            workings, which has given me a unique perspective on problem-solving and software design.
          </p>
          <div className="flex items-center mt-4 md:mt-6 bg-black/30 p-2 md:p-3 rounded-lg border border-gray-800 w-fit">
            <Image src="/arch-logo.svg" alt="Arch Linux Logo" width={20} height={20} className="mr-2 md:w-6 md:h-6" />
            <span className="text-[#1793D1] font-mono font-medium text-xs sm:text-sm md:text-base">I use Arch btw</span>
          </div>
        </div>
      </section>

      <section className="w-full md:w-5/6 h-dvh relative flex flex-col items-center justify-center p-4 md:p-8">
        <h2 className="text-3xl md:text-4xl font-mono font-semibold text-teal-300 mb-4 md:mb-8">Skills</h2>
        <div className="flex flex-col md:flex-row w-full max-w-5xl gap-4 md:gap-12 overflow-y-auto max-h-[75vh] md:max-h-none pr-2">
          <div className="flex-1 text-white">
            <div className="font-mono text-lg md:text-xl lg:text-2xl text-teal-300 mb-2 md:mb-4">SKILLS {"{"} </div>
            <p className="mb-2 md:mb-3 text-xs sm:text-sm md:text-base lg:text-lg ml-3 md:ml-6 lg:ml-8 font-mono text-neutral-300">
              I excel in dissecting complex problems into manageable tasks, essential for crafting robust, maintainable
              code in large-scale projects. I&apos;m driven by challenges, always seeking opportunities to enhance my
              skills. My self-directed learning approach empowers me to quickly grasp and adapt to new technologies
              autonomously.
            </p>
            <p className="mb-2 md:mb-3 text-xs sm:text-base md:text-lg lg:text-xl ml-3 md:ml-6 lg:ml-8 font-mono text-neutral-300">
              My passion for understanding problems on a deeper level has naturally drawn me to reverse engineering and
              low-level languages. This approach allows me to build more efficient solutions by truly understanding the
              underlying mechanisms.
            </p>
            <div className="font-mono text-lg md:text-xl lg:text-2xl text-teal-300 mt-2 md:mt-4">{"}"};</div>
          </div>

          <div className="flex flex-col md:flex-row items-center mt-3 md:mt-0">
            <div className="h-1 w-full md:h-auto md:w-1 bg-teal-500 self-center md:self-stretch my-0 md:my-0 md:mx-8 rounded-full shadow-teal-600" />
            <div className="w-full md:w-auto mt-3 md:mt-0 flex justify-center md:justify-start">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:gap-x-4 md:gap-y-4 lg:gap-y-6">
                <div className="flex items-center gap-1 md:gap-3">
                  <Image src="/icons/javascript.svg" alt="JavaScript" width={24} height={24} className="w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7" />
                  <span className="font-mono text-neutral-300 text-sm md:text-base">JavaScript</span>
                </div>
                <div className="flex items-center gap-1 md:gap-3">
                  <Image src="/icons/react.svg" alt="React" width={24} height={24} className="w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7" />
                  <span className="font-mono text-neutral-300 text-sm md:text-base">React</span>
                </div>
                <div className="flex items-center gap-1 md:gap-3">
                  <Image src="/icons/rust.svg" alt="Rust" width={24} height={24} className="w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7" />
                  <span className="font-mono text-neutral-300 text-sm md:text-base">Rust</span>
                </div>
                <div className="flex items-center gap-1 md:gap-3">
                  <Image src="/icons/svelte.svg" alt="Svelte" width={24} height={24} className="w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7" />
                  <span className="font-mono text-neutral-300 text-sm md:text-base">Svelte</span>
                </div>
                <div className="flex items-center gap-1 md:gap-3">
                  <Image src="/icons/cpp.svg" alt="C++" width={24} height={24} className="w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7" />
                  <span className="font-mono text-neutral-300 text-sm md:text-base">C++</span>
                </div>
                <div className="flex items-center gap-1 md:gap-3">
                  <Image src="/icons/tailwind.svg" alt="Tailwind" width={24} height={24} className="w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7" />
                  <span className="font-mono text-neutral-300 text-sm md:text-base">Tailwind</span>
                </div>
                <div className="flex items-center gap-1 md:gap-3">
                  <Image src="/icons/c.svg" alt="C" width={24} height={24} className="w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7" />
                  <span className="font-mono text-neutral-300 text-sm md:text-base">C</span>
                </div>
                <div className="flex items-center gap-1 md:gap-3">
                  <Image src="/icons/arduino.svg" alt="Arduino" width={24} height={24} className="w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7" />
                  <span className="font-mono text-neutral-300 text-sm md:text-base">Arduino</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="quote-section w-full md:w-4/5 h-dvh relative flex flex-col items-center justify-center p-4 md:p-8">
        <div className="w-full md:w-5/6 text-center">
          <div className="mt-8 md:mt-12">
            <GlowingText text="Intelligence is the ability to avoid doing work, yet getting the work done." />
            <p className="text-lg md:text-xl text-neutral-300 font-mono text-right mt-4">- Linus Torvalds</p>
          </div>
        </div>
      </section>

      <section className="w-full md:w-4/5 h-dvh relative flex flex-col items-center justify-center p-4 md:p-8">
        <h2 className="text-3xl md:text-4xl font-mono font-semibold text-teal-300 mb-4 md:mb-8">Projects</h2>
        <div className="w-full max-w-6xl">
          <article className="bg-black/30 border border-gray-800 rounded-xl p-3 md:p-5 hover:border-teal-500/70 hover:shadow-[0_0_18px_rgba(45,212,191,0.2)] transition-all duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-start">
              <div className="order-2 lg:order-1">
                <h3 className="text-lg md:text-2xl font-mono font-semibold text-teal-300 mb-3">{currentProject?.name}</h3>
                <ul className="space-y-2">
                  {currentProject?.bullets.map((bullet) => (
                    <li key={bullet} className="text-sm md:text-base font-mono text-neutral-300 leading-relaxed flex gap-2">
                      <span className="text-teal-300 mt-[2px]">-</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <a
                    href={currentProject?.liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 font-mono text-sm md:text-base text-teal-300 hover:text-teal-200 underline decoration-teal-500/70 underline-offset-4 transition-colors"
                  >
                    <span>{currentProject?.liveUrl}</span>
                  </a>
                </div>
              </div>

              <div className="order-1 lg:order-2">
                <button
                  type="button"
                  onClick={() => setIsImageModalOpen(true)}
                  className="relative w-full aspect-video rounded-lg overflow-hidden border border-gray-800 mb-3 block cursor-zoom-in group"
                  aria-label="Open project screenshot fullscreen"
                >
                  <Image
                    src={currentScreenshots[activeScreenshot] ?? ""}
                    alt={`${currentProject?.name ?? "Project"} screenshot`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  />
                  <div className="absolute right-2 top-2 text-xs font-mono text-teal-200 bg-black/60 border border-teal-700 px-2 py-1 rounded">
                    Click to expand
                  </div>
                </button>

                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={goToPrevScreenshot}
                    className="px-3 py-1.5 font-mono text-xs md:text-sm text-teal-300 border border-teal-600 rounded-lg hover:bg-teal-500/10 transition-colors"
                    aria-label="Previous screenshot"
                    disabled={currentScreenshots.length <= 1}
                  >
                    Screenshot Prev
                  </button>
                  <span className="font-mono text-xs md:text-sm text-neutral-300">
                    {Math.min(activeScreenshot + 1, Math.max(currentScreenshots.length, 1))}/{Math.max(currentScreenshots.length, 1)}
                  </span>
                  <button
                    onClick={goToNextScreenshot}
                    className="px-3 py-1.5 font-mono text-xs md:text-sm text-teal-300 border border-teal-600 rounded-lg hover:bg-teal-500/10 transition-colors"
                    aria-label="Next screenshot"
                    disabled={currentScreenshots.length <= 1}
                  >
                    Screenshot Next
                  </button>
                </div>
              </div>
            </div>
          </article>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              onClick={goToPrevProject}
              className="px-4 py-2 font-mono text-sm md:text-base text-teal-300 border border-teal-600 rounded-lg hover:bg-teal-500/10 transition-colors"
              aria-label="Previous project"
            >
              Previous
            </button>

            <div className="flex items-center gap-2">
              {projects.map((project, index) => (
                <button
                  key={`${project.name}-dot`}
                  onClick={() => {
                    setActiveProject(index);
                    setActiveScreenshot(0);
                  }}
                  aria-label={`View ${project.name}`}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    activeProject === index ? "w-8 bg-teal-300" : "w-2.5 bg-white/50 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={goToNextProject}
              className="px-4 py-2 font-mono text-sm md:text-base text-teal-300 border border-teal-600 rounded-lg hover:bg-teal-500/10 transition-colors"
              aria-label="Next project"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="w-full md:w-4/5 h-dvh relative flex flex-col items-center justify-center p-4 md:p-8">
        <h2 className="text-3xl md:text-4xl font-mono font-semibold text-teal-300 mb-4 md:mb-8">Contact</h2>
        <div className="flex flex-col md:flex-row w-full max-w-5xl gap-8 md:gap-12">
          <div className="flex-1 text-white">
            <h3 className="text-2xl md:text-3xl font-mono font-semibold text-teal-400 mb-2 md:mb-4">
              Have a project in mind?
            </h3>
            <p className="text-base md:text-xl font-mono text-neutral-300 mb-4 md:mb-8">
              My inbox is always open for new ideas.
            </p>
            <div className="flex flex-col gap-4">
              <a href="https://github.com/Nikutsuki" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
                <Image src="/icons/github.svg" alt="GitHub" width={24} height={24} className="md:w-8 md:h-8 invert" />
                <span className="text-neutral-300 font-mono text-base md:text-xl">Nikutsuki</span>
              </a>
              <a href="mailto:nikutsuki@icloud.com" className="flex items-center gap-3">
                <Image src="/icons/envelope.svg" alt="Email" width={24} height={24} className="md:w-8 md:h-8 invert" />
                <span className="text-neutral-300 font-mono text-base md:text-xl">nikutsuki@icloud.com</span>
              </a>
            </div>
          </div>
          <div className="flex-1 mt-8 md:mt-0">
            <form className="flex flex-col gap-4">
              <input
                type="email"
                placeholder="Email"
                className="p-3 bg-black/30 border border-gray-800 rounded-lg text-neutral-300 font-mono focus:outline-none focus:ring-2 focus:ring-teal-400 transition duration-300 selection:bg-teal-400 selection:text-black"
              />
              <input
                type="text"
                placeholder="Subject"
                className="p-3 bg-black/30 border border-gray-800 rounded-lg text-neutral-300 font-mono focus:outline-none focus:ring-2 focus:ring-teal-400 transition duration-300 selection:bg-teal-400 selection:text-black"
              />
              <textarea
                placeholder="Message"
                className="p-3 bg-black/30 border border-gray-800 rounded-lg text-neutral-300 font-mono h-24 md:h-32 focus:outline-none focus:ring-2 focus:ring-teal-400 transition duration-300 selection:bg-teal-400 selection:text-black"
              />
              <button
                type="submit"
                className="p-3 bg-teal-400 text-black font-mono font-semibold rounded-lg hover:bg-teal-500 transition-colors duration-300"
              >
                Submit
              </button>
            </form>
          </div>
        </div>
      </section>

      {isImageModalOpen ? (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm p-2 md:p-4 flex items-center justify-center">
          <div className="w-full max-w-[95vw]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base md:text-xl font-mono text-teal-300">{currentProject?.name}</h3>
              <button
                type="button"
                onClick={() => setIsImageModalOpen(false)}
                className="px-3 py-1.5 font-mono text-sm text-teal-300 border border-teal-600 rounded-lg hover:bg-teal-500/10 transition-colors"
                aria-label="Close fullscreen image"
              >
                Close
              </button>
            </div>

            <div className="relative w-full h-[72vh] md:h-[80vh] rounded-lg overflow-hidden border border-gray-700">
              <Image
                src={currentScreenshots[activeScreenshot] ?? ""}
                alt={`${currentProject?.name ?? "Project"} fullscreen screenshot`}
                fill
                sizes="100vw"
                className="object-contain bg-black"
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={goToPrevScreenshot}
                className="px-3 py-1.5 font-mono text-sm text-teal-300 border border-teal-600 rounded-lg hover:bg-teal-500/10 transition-colors"
                disabled={currentScreenshots.length <= 1}
              >
                Prev
              </button>
              <span className="font-mono text-xs md:text-sm text-neutral-300">
                {Math.min(activeScreenshot + 1, Math.max(currentScreenshots.length, 1))}/{Math.max(currentScreenshots.length, 1)}
              </span>
              <button
                onClick={goToNextScreenshot}
                className="px-3 py-1.5 font-mono text-sm text-teal-300 border border-teal-600 rounded-lg hover:bg-teal-500/10 transition-colors"
                disabled={currentScreenshots.length <= 1}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
