import Link from "next/link";
import { MdAccountCircle, MdLockOpen, MdSettings } from "react-icons/md";

import { Button } from "@swiss/ui";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-(--surface) font-(family-name:--font-inter) tracking-tight uppercase">
      <div className="mx-auto flex w-full items-center justify-between gap-3 px-3 py-3 sm:px-6 sm:py-4 md:px-8">
        <Link
          href="/"
          className="font-['Space_Grotesk'] text-sm sm:text-xl font-bold tracking-wide sm:tracking-widest text-white"
          aria-label="Home"
        >
          MONOLITH DROP
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {/* <Link
            href="/session"
            className="border-l-2 border-(--security-emerald) pl-2 text-xs tracking-widest text-white"
          >
            Node
          </Link>
          <Link
            href="#"
            className="px-2 py-1 text-xs tracking-widest text-(--on-surface-variant) transition-colors duration-200 hover:bg-(--surface-container-high)"
          >
            History
          </Link>
          <Link
            href="#"
            className="px-2 py-1 text-xs tracking-widest text-(--on-surface-variant) transition-colors duration-200 hover:bg-(--surface-container-high)"
          >
            Network
          </Link> */}
        </nav>

        <div className="flex items-center gap-4">
          {/* <button
            type="button"
            className="text-(--security-emerald) transition-transform duration-150 hover:scale-95"
            aria-label="Lock"
          >
            <MdLockOpen className="text-2xl" aria-hidden />
          </button>
          <button
            type="button"
            className="text-(--security-emerald) transition-transform duration-150 hover:scale-95"
            aria-label="Settings"
          >
            <MdSettings className="text-2xl" aria-hidden />
          </button>
          <button
            type="button"
            className="text-(--security-emerald) transition-transform duration-150 hover:scale-95"
            aria-label="Account"
          >
            <MdAccountCircle className="text-2xl" aria-hidden />
          </button> */}

          <Button
            asChild
            variant="primary"
            size="md"
            className="ml-0 sm:ml-2 inline-flex rounded-none px-3 sm:px-6 py-2 text-xs sm:text-sm font-bold tracking-widest hover:opacity-80 active:scale-95"
          >
            <Link href="/">transfer files</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}