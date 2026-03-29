import { Card, CardBody, CardTitle } from "@swiss/ui";
import { MdStream } from "react-icons/md";

export default function Home() {
  return (
    <div className="bg-(--surface) font-sans text-(--on-surface)">
      <section className="mx-auto flex max-w-400 flex-col items-center gap-8 px-8 py-20 md:px-12 md:py-28 2xl:px-24">
        <div className="flex h-16 w-16 items-center justify-center border border-(--security-emerald)/30 bg-(--security-emerald)/5">
          <MdStream
            className="text-3xl text-(--security-emerald)"
            aria-hidden
          />
        </div>
        <h1 className="text-center font-['Space_Grotesk'] text-4xl font-bold tracking-tight text-(--on-surface) md:text-6xl">
          LIVE STREAM
        </h1>
        <p className="max-w-xl text-center text-lg text-(--on-surface-variant)">
          Stream UI and API wiring will live here. Shared design system and
          layout match monolith-drop.
        </p>
        <Card className="w-full max-w-md rounded-none border border-(--on-surface)/10 bg-(--surface-container-low)/80 p-8 backdrop-blur-sm">
          <CardTitle className="font-['Space_Grotesk'] text-lg font-bold tracking-wide text-(--on-surface) uppercase">
            Status
          </CardTitle>
          <CardBody className="mt-2 text-sm text-(--on-surface-variant)">
            Run{" "}
            <code className="text-(--on-surface)">
              task monolith-stream-api:dev
            </code>{" "}
            for the Go API on port 8084.
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
