This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## File transfer performance

Dynamic chunking in `@swiss/webrtc-signaling` scales payload size and `bufferedAmount` ceilings by file size:

| File size | Chunk payload | Max buffered |
|-----------|---------------|--------------|
| Under 10 MB | 64 KiB | 1 MiB |
| 10 MB – 100 MB | 128 KiB | 2 MiB |
| Over 100 MB | 256 KiB | 4 MiB |

**Manual benchmark**: On a stable LAN path, compare wall-clock time to send the same file (for example 200–500 MB) against a build that used fixed 64 KiB / 1 MiB. The feature target is about **20% higher throughput** on large files; exact results depend on CPU, browser, and network.

**Automated checks**

- Telemetry (EMA / ETA): `pnpm --filter monolith-drop test`
- Chunking thresholds: `pnpm --filter @swiss/webrtc-signaling test`
- Playwright smoke (`/session` create flow): `pnpm --filter monolith-drop test:e2e` (starts or reuses `dev:http` on port 3002)

Full P2P E2E is gated behind `MONOLITH_DROP_E2E_P2P=1`; see `specs/001-file-upload-optimization/quickstart.md`.

### Large incoming files (StreamSaver)

Downloads over **256 MiB** use [StreamSaver.js](https://github.com/jimmywarting/StreamSaver.js) so data is written through a `WritableStream` to disk instead of allocating a single `Uint8Array` for the whole file (see `app/lib/stream-saver-sink.ts`). Smaller files still use an in-memory buffer and the existing blob download click.

StreamSaver relies on a secure context (HTTPS) and its hosted “mitm” helper by default; for self-hosted deployments you may need to configure `streamSaver.mitm` per the StreamSaver docs.
