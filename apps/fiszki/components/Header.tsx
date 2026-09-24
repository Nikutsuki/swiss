import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-(--surface) font-['Space_Grotesk'] tracking-tight font-bold uppercase">
      <div className="mx-auto grid grid-cols-2 md:grid-cols-3 items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 md:px-10">

        <div className="flex justify-self-start">
          <Link
            href="/"
            className="text-sm sm:text-2xl font-black tracking-wide sm:tracking-widest text-white"
            aria-label="Home"
          >
            FISZKI
          </Link>
        </div>

        <nav className="hidden justify-self-center md:flex items-center gap-8">
          <Link href="/" className="text-(--on-surface-variant) transition-colors hover:text-white">
            Study Sets
          </Link>
          <Link href="/stats" className="text-(--on-surface-variant) transition-colors hover:text-white">
            Statistics
          </Link>
        </nav>

        <div className="flex items-center gap-6 justify-self-end">
          <Link
            href="/?new=1"
            className="bg-(--on-surface) text-(--on-primary) active:scale-95 inline-flex items-center px-3 sm:px-6 py-2 text-xs sm:text-sm font-bold tracking-widest transition-all duration-200 hover:opacity-80"
          >
            New Set
          </Link>
        </div>
      </div>
    </header>
  );
}
