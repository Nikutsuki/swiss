import EncryptedPastePage from "./encrypted-paste-page";

export default function Page({
  params,
}: {
  params: Promise<{ pasteId: string }>;
}) {
  return <EncryptedPastePage params={params} />;
}
