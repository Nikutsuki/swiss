import Link from "next/link";

import { Button, Card, CardBody, CardTitle } from "@swiss/ui";
import type { IconType } from "react-icons";
import {
  MdEnhancedEncryption,
  MdHub,
  MdNoEncryption,
  MdSpeed,
  MdSyncAlt,
  MdTimer,
  MdUploadFile,
  MdVpnKey,
} from "react-icons/md";

const pillars: {
  icon: IconType;
  title: string;
  body: string;
}[] = [
  {
    icon: MdHub,
    title: "WebRTC Protocol",
    body: "Industry standard using ICE & STUN to traverse NAT firewalls without server relaying.",
  },
  {
    icon: MdVpnKey,
    title: "AES-256-GCM",
    body: "Authenticated encryption utilizing the local Web Crypto API directly in the browser.",
  },
  {
    icon: MdSpeed,
    title: "Direct Stream",
    body: "Data streamed via DataChannel. File sizes are practically unlimited per local memory bounds.",
  },
  {
    icon: MdTimer,
    title: "Ephemeral Keys",
    body: "Encryption keys only exist for the tunnel duration and are purged upon transfer completion.",
  },
];

export default function Home() {
  return (
    <div className="bg-(--surface) font-sans text-(--on-surface)">
      <main className="min-h-dvh">
        {/* Combined Hero & WebRTC Architecture Section */}
        <section className="mx-auto grid max-w-400 grid-cols-1 items-center gap-10 sm:gap-12 xl:gap-12 border-b border-(--on-surface)/5 px-4 sm:px-8 md:px-12 2xl:px-24 py-10 sm:py-14 md:py-20">
          {/* Hero Content (Left) */}
          <div className="z-10 flex h-full flex-col justify-center">
            <h1 className="mb-5 sm:mb-6 font-['Space_Grotesk'] text-3xl sm:text-4xl md:text-6xl xl:text-7xl leading-[0.9] font-bold tracking-tight text-(--on-surface)">
              DIRECT LINE.
              <br />
              ZERO TRACE.
            </h1>

            <p className="mb-8 sm:mb-10 max-w-xl text-sm sm:text-base md:text-xl leading-relaxed text-(--on-surface-variant)">
              Peer-to-peer file transfer powered by WebRTC. Your data never
              touches a server. Encrypted at the source, decrypted at the
              destination.
            </p>

            <div className="mb-10 flex flex-col gap-4 sm:flex-row xl:mb-0">
              <Button
                asChild
                variant="primary"
                size="md"
                className="w-full sm:w-auto h-auto min-h-11 sm:min-h-12 px-6 sm:px-8 py-3 sm:py-4 text-xs sm:text-sm font-bold tracking-widest uppercase shadow-lg shadow-black/40 hover:scale-[0.98]"
              >
                <Link href="/session">Start Transfer</Link>
              </Button>
            </div>
          </div>

          {/* WebRTC Architecture Diagram (Right) */}
          <Card className="relative flex h-full w-full flex-col justify-center overflow-hidden rounded-none border border-(--on-surface)/10 p-4 sm:p-6 md:p-10 shadow-xl">
            <div className="relative z-10 mb-8 flex w-full flex-col items-stretch justify-between gap-6 md:flex-row">
              <Card className="w-full flex-1 rounded-none border border-(--on-surface)/5 border-l-4 border-l-(--security-emerald) bg-(--surface-container-high) p-4 sm:p-6 shadow-inner">
                <h4 className="mb-5 text-sm font-bold tracking-widest text-(--on-surface) uppercase">
                  Node A: Sender
                </h4>
                <div className="space-y-5">
                  <div className="flex items-start gap-4">
                    <MdEnhancedEncryption
                      className="shrink-0 text-lg text-(--security-emerald)"
                      aria-hidden
                    />
                    <div>
                      <div className="mb-1 text-xs font-bold text-(--on-surface) uppercase">
                        Source Encryption
                      </div>
                      <p className="text-xs leading-tight text-(--on-surface-variant)">
                        Web Crypto API: AES-GCM 256-bit applied offline.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="flex w-8 shrink-0 flex-col items-center justify-center md:w-16">
                <div className="h-8 w-px bg-[repeating-linear-gradient(180deg,var(--security-emerald)_0,var(--security-emerald)_6px,transparent_6px,transparent_12px)] opacity-60 md:h-px md:w-full md:bg-[repeating-linear-gradient(90deg,var(--security-emerald)_0,var(--security-emerald)_6px,transparent_6px,transparent_12px)]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:hidden">
                  <MdSyncAlt
                    className="text-4xl text-(--on-surface) opacity-10"
                    aria-hidden
                  />
                </div>
              </div>

              <Card className="w-full flex-1 rounded-none border border-(--on-surface)/5 border-r-4 border-r-(--on-surface) bg-(--surface-container-high) p-4 sm:p-6 shadow-inner">
                <h4 className="mb-5 text-sm font-bold tracking-widest text-(--on-surface) uppercase">
                  Node B: Receiver
                </h4>
                <div className="space-y-5">
                  <div className="flex items-start gap-4">
                    <MdNoEncryption
                      className="shrink-0 text-lg text-(--on-surface)"
                      aria-hidden
                    />
                    <div>
                      <div className="mb-1 text-xs font-bold text-(--on-surface) uppercase">
                        Client Decryption
                      </div>
                      <p className="text-xs leading-tight text-(--on-surface-variant)">
                        Decrypted purely client-side after transit.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="flex flex-col justify-between gap-6 border-t border-(--outline-variant)/30 pt-6 sm:flex-row">
              <div className="flex items-center gap-4">
                <div className="h-2.5 w-2.5 shrink-0 bg-(--security-emerald) rounded-xl" />
                <div>
                  <span className="block text-xs font-bold tracking-widest text-(--on-surface) uppercase">
                    Signalling Phase
                  </span>
                  <p className="mt-0.5 text-xs text-(--on-surface-variant)">
                    Server only facilitates initial handshake.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-2.5 w-2.5 shrink-0 bg-(--surface-bright) rounded-xl" />
                <div>
                  <span className="block text-xs font-bold tracking-widest text-(--on-surface) uppercase">
                    Zero Storage
                  </span>
                  <p className="mt-0.5 text-xs text-(--on-surface-variant)">
                    Server vanishes after P2P tunnel opens.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Transfer Action Block */}
        <section className="border-b border-(--on-surface)/5 bg-(--surface) px-4 sm:px-8 md:px-12 2xl:px-24 py-10 sm:py-14 md:py-20">
          <div className="mx-auto max-w-400 border border-(--on-surface)/10 bg-linear-to-b from-(--on-surface)/5 to-transparent p-1">
            <Card className="rounded-none border-0 bg-(--surface-container-low)/80 p-5 sm:p-8 md:p-10 text-center backdrop-blur-sm">
              <div className="mb-6 flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center border border-(--security-emerald)/30 bg-(--security-emerald)/5">
                  <MdUploadFile
                    className="text-2xl text-(--security-emerald)"
                    aria-hidden
                  />
                </div>
              </div>
              <CardTitle className="mb-3 font-['Space_Grotesk'] text-2xl font-bold tracking-tight text-(--on-surface) uppercase">
                Initiate Secure Transfer
              </CardTitle>
              <CardBody className="mx-auto mb-8 mt-0 max-w-md text-center text-sm">
                Select a payload to generate an ephemeral peer-to-peer tunnel
                link. Transfer begins only when the recipient connects.
              </CardBody>
              <div className="flex flex-col justify-center gap-4 sm:flex-row">
                <Button
                  asChild
                  variant="primary"
                  size="sm"
                  className="font-bold tracking-widest uppercase shadow-md hover:bg-(--security-emerald) hover:text-(--on-primary)"
                >
                  <Link href="/session">Select Files</Link>
                </Button>
                <Button
                  asChild
                  variant="secondary"
                  size="sm"
                  className="font-bold tracking-widest uppercase hover:bg-(--on-surface)/5"
                >
                  <Link href="/session">Join Transfer</Link>
                </Button>
              </div>
            </Card>
          </div>
        </section>

        {/* Technical Pillars */}
        <section className="bg-(--surface-container-lowest) px-4 sm:px-8 md:px-12 2xl:px-24 py-10 sm:py-14 md:py-20">
          <div className="mx-auto grid max-w-400 grid-cols-1 gap-0.5 bg-(--outline-variant)/10 md:grid-cols-2 lg:grid-cols-4">
            {pillars.map(({ icon: Icon, title, body }) => (
              <Card
                key={title}
                className="group rounded-none border-0 bg-(--surface) p-5 sm:p-8 md:p-10 transition-colors hover:bg-(--surface-container-low)"
              >
                <Icon
                  className="mb-5 block text-3xl text-(--security-emerald)"
                  aria-hidden
                />
                <h3 className="mb-3 font-['Space_Grotesk'] text-lg font-bold tracking-tight text-(--on-surface) uppercase">
                  {title}
                </h3>
                <CardBody className="mb-6 mt-0 text-sm leading-relaxed">
                  {body}
                </CardBody>
                <div className="h-0.5 w-12 bg-(--surface-container-lowest) transition-all duration-500 group-hover:w-full group-hover:bg-(--security-emerald)" />
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
