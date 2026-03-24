import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-(--surface) font-['Space_Grotesk'] tracking-tight font-bold uppercase">
      <div className="mx-auto grid grid-cols-2 md:grid-cols-3 items-center px-6 py-4 md:px-10">
        
        <div className="flex justify-self-start">
          <Link
            href="/"
            className="text-2xl font-black tracking-widest text-white"
            aria-label="Home"
          >
            MONOLITH
          </Link>
        </div>

        <nav className="hidden justify-self-center md:flex items-center gap-8">
          <Link href="/archive" className="text-(--on-surface-variant) transition-colors hover:text-white">
            Archive
          </Link>
          <Link href="/api" className="text-(--on-surface-variant) transition-colors hover:text-white">
            API
          </Link>
          <Link href="/docs" className="text-(--on-surface-variant) transition-colors hover:text-white">
            Docs
          </Link>
        </nav>

        <div className="flex items-center gap-6 justify-self-end">
          
          {/* <div className="hidden sm:flex items-center gap-2 text-(--on-surface-variant)">
            <span className="material-symbols-outlined cursor-pointer rounded p-2 transition-all duration-200 hover:bg-(--surface-container-low) hover:text-white">
              settings
            </span>
            <span className="material-symbols-outlined cursor-pointer rounded p-2 transition-all duration-200 hover:bg-(--surface-container-low) hover:text-white">
              shield
            </span>
            <span className="material-symbols-outlined cursor-pointer rounded p-2 transition-all duration-200 hover:bg-(--surface-container-low) hover:text-white">
              account_circle
            </span>
          </div> */}

          <Link
            href="/"
            className="bg-(--on-surface) text-(--on-primary) active:scale-95 inline-flex items-center px-6 py-2 text-sm font-bold tracking-widest transition-all duration-200 hover:opacity-80"
          >
            New Paste
          </Link>

        </div>
      </div>
    </header>
  );
}