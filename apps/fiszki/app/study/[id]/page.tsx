import StudyWorkspace from "@/app/study/[id]/study-workspace";

export default async function StudyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StudyWorkspace setId={id} />;
}
