"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  ClientOnly,
  Container,
  Heading,
  HStack,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Clock, LogOut, Users } from "lucide-react";
import {
  formatWaited,
  formatWaitingCount,
  WAITING_HEARTBEAT_MS,
  type PlayStory,
  type WaitingRoomState,
} from "@/lib/play";
import type { StorySession } from "@/lib/stories";
import { sa_leaveWaitingRoom, sa_waitForSession } from "@/app/(app)/play/[id]/actions";
import { StorySessions } from "@/components/stories/story-sessions";
import { LeaveWaitingRoomDialog } from "./leave-waiting-room-dialog";
import { PlayCover } from "./play-cover";
import { useLeaveGuard } from "./use-leave-guard";

type Props = {
  story: Pick<PlayStory, "idStory" | "title">;
  /** The heartbeat the page made as it put the caller in the room. */
  initial: WaitingRoomState;
  /** The first page of the story's sessions, loaded by the page. */
  sessions: StorySession[];
  /**
   * The picture behind the room, one of WAITING_BACKGROUNDS, picked by the
   * page on the server so the server and the browser draw the same one.
   */
  background: string;
};

/**
 * Where a player waits when they come to the table before the storyteller
 * has opened a session: one of the waiting room's pictures behind, how many
 * are waiting and
 * for how long, and the sessions so far to read through meanwhile.
 *
 * The page keeps a heartbeat going while it is open. Each beat keeps the
 * caller's session_players row WAITING, brings back the count, and says
 * whether the table has opened; when it has, or the story was put away
 * meanwhile, the room hands over to /play/[id], which decides between the
 * table and the dialog.
 *
 * Leaving is deliberate. Give up deletes the caller's waiting row and goes
 * home; following any link out first asks, through
 * LeaveWaitingRoomDialog, and deletes the row before moving on; closing or
 * reloading the tab gets the browser's own prompt (see useLeaveGuard). A way
 * out the guard cannot see, such as the back button, still deletes the row
 * as the room unmounts. Going to the table does not: sa_joinSession attaches
 * the waiting row to the session there.
 */
export function WaitingRoom({ story, initial, sessions, background }: Props) {
  const router = useRouter();
  // Read through a ref by the heartbeat, so the effect below runs once per
  // story rather than again whenever the router object changes: its cleanup
  // deletes the waiting row, which must only happen when the room goes.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });
  const [state, setState] = useState(initial);
  const { idStory } = story;
  // True until the room has decided to go: to the table, or out once the
  // waiting row is gone. It arms the leave guard, and tells the cleanup
  // whether the row still needs deleting.
  const staying = useRef(true);
  const [pendingLeave, setPendingLeave] = useState<URL | null>(null);
  const [isLeaving, setLeaving] = useState(false);

  async function leaveTo(to: URL) {
    setLeaving(true);
    staying.current = false;
    try {
      await sa_leaveWaitingRoom(idStory);
    } catch {
      // The row goes quiet and drops out of the count on its own; it is not
      // worth keeping someone who asked to leave.
    }
    if (to.origin === window.location.origin) {
      router.push(to.pathname + to.search + to.hash);
    } else {
      window.location.assign(to.href);
    }
  }

  useLeaveGuard(staying, setPendingLeave);

  useEffect(() => {
    let cancelled = false;

    async function beat() {
      try {
        const next = await sa_waitForSession(idStory);
        if (cancelled) return;
        if (!next) {
          // The story went away, or the caller is no longer one of its players.
          staying.current = false;
          routerRef.current.replace("/play");
        } else if (next.hasOpenSession || next.isUnplayable) {
          staying.current = false;
          routerRef.current.replace(`/play/${idStory}`);
        } else {
          setState(next);
        }
      } catch {
        // A missed beat is not worth interrupting anyone for; the next one
        // tries again, and the row stays WAITING through several missed beats.
      }
    }

    // A beat on mount as well as on the interval: the page put the caller
    // in the room as it rendered, but a remount (React's development double
    // mount, or a return through the back button) has deleted the row in its
    // cleanup since.
    beat();
    const timer = setInterval(beat, WAITING_HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (staying.current) sa_leaveWaitingRoom(idStory).catch(() => {});
    };
  }, [idStory]);

  return (
    <PlayCover title={story.title} imageUrl={background}>
      <Container maxW="3xl" w="full" py={{ base: "6", md: "8" }}>
        <Stack
          gap="6"
          p={{ base: "5", md: "8" }}
          bg="bg.panel"
          borderWidth="1px"
          rounded="xl"
          shadow="lg"
        >
          <Stack gap="2">
            <Text textStyle="sm" color="fg.muted" fontWeight="medium">
              Waiting room
            </Text>
            <Heading as="h1" size="2xl">
              {story.title}
            </Heading>
            <Text color="fg.muted">
              The storyteller has not opened the table yet. You will be taken to it as soon as
              they do.
            </Text>
          </Stack>

          <HStack gap="6" wrap="wrap">
            <HStack gap="2">
              <Users size={18} />
              <Text>{formatWaitingCount(state.waitingCount)}</Text>
            </HStack>
            <HStack gap="2">
              <Clock size={18} />
              {/* The clock is read off the browser's own time, which the
                  server cannot know, so it renders only once on the client. */}
              <ClientOnly fallback={<Skeleton h="5" w="24" />}>
                <WaitedClock since={state.waitingSince} />
              </ClientOnly>
            </HStack>
            {/* No question asked: pressing it is the decision. */}
            <Button
              variant="outline"
              size="sm"
              ms="auto"
              onClick={() => leaveTo(new URL("/home", window.location.href))}
              loading={isLeaving && pendingLeave === null}
              loadingText="Giving up"
            >
              <LogOut />
              Give up
            </Button>
          </HStack>

          <Stack as="section" aria-labelledby="waiting-sessions-heading" gap="3">
            <Heading id="waiting-sessions-heading" as="h2" size="md">
              Sessions so far
            </Heading>
            <StorySessions idStory={idStory} initial={sessions} showTitles />
          </Stack>
        </Stack>
      </Container>
      <LeaveWaitingRoomDialog
        title={story.title}
        open={pendingLeave !== null}
        isLeaving={isLeaving}
        onLeave={() => pendingLeave && leaveTo(pendingLeave)}
        onStay={() => setPendingLeave(null)}
      />
    </PlayCover>
  );
}

// Its own component so the once-a-second tick re-renders this line only, not
// the session list beside it.
function WaitedClock({ since }: { since: Date }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = (now - new Date(since).getTime()) / 1000;
  return <Text fontVariantNumeric="tabular-nums">Waiting {formatWaited(seconds)}</Text>;
}
