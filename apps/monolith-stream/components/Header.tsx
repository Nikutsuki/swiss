import Link from "next/link";

import { Button } from "@swiss/ui";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-(--surface) font-(family-name:--font-inter) tracking-tight uppercase">
      <div className="mx-auto flex w-full items-center justify-between px-6 py-4 md:px-8">
        <Link
          href="/"
          className="font-['Space_Grotesk'] text-xl font-bold tracking-widest text-white"
          aria-label="Home"
        >
          MONOLITH STREAM
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary" />

        <div className="flex items-center gap-4">
          <Button
            asChild
            variant="primary"
            size="md"
            className="ml-2 hidden rounded-none px-6 py-2 text-sm font-bold tracking-widest hover:opacity-80 sm:inline-flex active:scale-95"
          >
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
