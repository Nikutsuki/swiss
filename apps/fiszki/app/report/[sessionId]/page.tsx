import SessionReport from "@/app/report/[sessionId]/session-report";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <SessionReport sessionId={sessionId} />;
}
