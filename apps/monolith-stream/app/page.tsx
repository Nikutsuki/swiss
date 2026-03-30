import { redirect } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Button, Card, CardTitle, CardBody } from "@swiss/ui";
import { Video } from "lucide-react";

export default function Home() {
  async function createLobby() {
    "use server";
    const lobbyId = uuidv4().substring(0, 8); // short id
    redirect(`/lobby/${lobbyId}`);
  }

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <Card className="w-full max-w-md text-center">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-(--surface-container-high) rounded-full">
            <Video className="w-8 h-8 text-(--security-emerald)" />
          </div>
        </div>
        <CardTitle>P2P Watch Together</CardTitle>
        <CardBody className="mb-8">
          Create a lobby to share your screen or local video files with friends in real-time. No sign-up required.
        </CardBody>
        <form action={createLobby}>
          <Button type="submit" className="w-full" size="lg" bold>
            Create New Lobby
          </Button>
        </form>
      </Card>
    </div>
  );
}