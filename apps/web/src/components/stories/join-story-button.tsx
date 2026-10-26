"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@chakra-ui/react";
import { LogIn } from "lucide-react";
import type { StoryPlayer } from "@/lib/stories";
import { sa_joinStory } from "@/app/(app)/(nav)/stories/actions";
import { toaster } from "@/components/ui/toaster";

type Props = {
  idStory: number;
  /** The caller's new seat, as the Players list shows it. */
  onJoined: (player: StoryPlayer) => void;
};

/**
 * Join, beside a story's Players heading while the story is looking for
 * players. It joins at once rather than asking first: the seat can be given
 * up again from the Leave game button beside it, so there is nothing to
 * confirm. The page is refreshed as well, so whatever else on it depended
 * on the seat catches up.
 *
 * The outcome is a toast either way. A refusal means the story stopped
 * looking, or the caller was seated elsewhere in the meantime; there is
 * nothing in the page to fix, and the refresh shows how things now stand.
 */
export function JoinStoryButton({ idStory, onJoined }: Props) {
  const router = useRouter();
  const [isJoining, setJoining] = useState(false);

  async function join() {
    setJoining(true);
    try {
      const result = await sa_joinStory(idStory);
      if (!result.ok) {
        toaster.create({ title: result.error, type: "error" });
        router.refresh();
        return;
      }
      onJoined(result.player);
      router.refresh();
      toaster.create({ title: "You have joined the game.", type: "success" });
    } catch {
      toaster.create({ title: "You could not join the game. Try again.", type: "error" });
    } finally {
      setJoining(false);
    }
  }

  return (
    <Button
      size="sm"
      colorPalette="blue"
      loading={isJoining}
      loadingText="Joining"
      onClick={() => void join()}
    >
      <LogIn size={16} />
      Join
    </Button>
  );
}
