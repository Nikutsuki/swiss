import { redirect } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@swiss/ui";

export default function Home() {
  async function createLobby() {
    "use server";
    const lobbyId = uuidv4().substring(0, 8);
    redirect(`/lobby/${lobbyId}`);
  }

  return (
    <div className="min-h-dvh bg-(--surface) text-(--on-surface) flex justify-center items-center">
      <main className="w-full max-w-7xl px-4 sm:px-8 lg:px-16 py-8 sm:py-12 lg:py-16">
        <section className="mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-8 lg:gap-10">
          <div className="flex flex-col justify-center text-center lg:text-left">
            <h1 className="font-headline text-4xl md:text-5xl lg:text-6xl font-black leading-tight tracking-tight uppercase">
              Direct
              <br />
              <span className="text-(--security-emerald)">Screen Sharing</span>
            </h1>

            <p className="mt-6 text-(--on-surface-variant) text-sm md:text-base lg:text-lg max-w-2xl leading-relaxed mx-auto lg:mx-0">
              Pure peer-to-peer data transmission. No central media relay. Direct
              from your hardware to theirs using encrypted WebRTC tunnels.
            </p>

            <form action={createLobby} className="mt-8 md:mt-10 w-full sm:w-auto">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                bold
                className="w-full sm:w-auto px-10 h-14 md:h-16 tracking-[0.2em] uppercase text-sm"
              >
                Start Broadcasting
              </Button>
            </form>
          </div>

          {/* Feature bullets */}
          <aside
            id="security"
            className="h-full flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-(--outline-variant)/10 pt-6 lg:pt-0 lg:pl-8 xl:pl-10"
          >
            <div className="grid grid-cols-1 gap-6 md:gap-7">
              <div className="flex flex-col gap-2.5">
                <span className="text-(--security-emerald) font-mono text-xs tracking-tight">
                  01 //
                </span>
                <h3 className="font-headline text-lg font-semibold uppercase tracking-tight">
                  Zero‑Cloud
                </h3>
                <p className="text-(--on-surface-variant) text-sm leading-relaxed">
                  Data is never routed through proprietary media relays. All video and
                  audio frames flow directly between peers over encrypted ICE
                  connections.
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                <span className="text-(--security-emerald) font-mono text-xs tracking-tight">
                  02 //
                </span>
                <h3 className="font-headline text-lg font-semibold uppercase tracking-tight">
                  Local Encryption
                </h3>
                <p className="text-(--on-surface-variant) text-sm leading-relaxed">
                  Keys never leave your device. Session secrets are derived
                  per‑lobby, stored in memory only, and rotated when peers join or
                  leave.
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                <span className="text-(--security-emerald) font-mono text-xs tracking-tight">
                  03 //
                </span>
                <h3 className="font-headline text-lg font-semibold uppercase tracking-tight">
                  Raw Performance
                </h3>
                <p className="text-(--on-surface-variant) text-sm leading-relaxed">
                  Hardware‑accelerated encoding tuned for detailed content. Optimized
                  for 4K60 screen shares with minimal CPU overhead.
                </p>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}