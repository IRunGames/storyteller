"use client";

import { useId, useState } from "react";
import {
  Accordion,
  Alert,
  Avatar,
  HStack,
  IconButton,
  Image,
  List,
  Popover,
  Portal,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { Info } from "lucide-react";
import {
  formatSessionLength,
  SESSION_STATUS_TEXT,
  sessionHeading,
  type StorySessionDetail,
} from "@/lib/stories";
import { sa_getStorySession } from "@/app/(app)/(nav)/stories/actions";

type Props = {
  idStorySession: number;
  /** The button's colour; the story page passes its panel's muted text. */
  color?: string;
};

// The small info button on a session row and the popover it opens: the
// session's image, heading, length, who came, its summary, and the notes
// and lingering questions folded into an accordion so a long entry does
// not push the rest out of sight. The detail is fetched on first open
// rather than with the list, since most rows are never opened, and kept
// for the next time; nothing here changes while the page is up.
export function SessionInfoPopover({ idStorySession, color }: Props) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<StorySessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);
  // Both machines look their trigger up by id; with separate ids the
  // tooltip's wins and the popover opens at the page corner.
  const triggerId = useId();

  async function load() {
    if (detail || isLoading) return;
    setLoading(true);
    setError(null);
    try {
      const found = await sa_getStorySession(idStorySession);
      if (found) setDetail(found);
      else setError("This session is no longer here.");
    } catch {
      setError("Could not load the session.");
    } finally {
      setLoading(false);
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) void load();
  }

  const heading = detail ? sessionHeading(detail) : "Session";

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
      positioning={{ placement: "bottom-end" }}
      ids={{ trigger: triggerId }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton
              aria-label="Session info"
              variant="ghost"
              size="xs"
              rounded="full"
              color={color}
            >
              <Info />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Session info</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          {/* Notes run long, so the popover scrolls inside itself rather
              than off the bottom of the viewport. */}
          <Popover.Content w="sm" maxH="80vh" overflowY="auto">
            <Popover.Arrow />
            {/* Popover.Title, not bare text: it is what the dialog's
                aria-labelledby points at, so the popover gets a name. */}
            <Popover.Header fontWeight="semibold">
              <Popover.Title>{heading}</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              {error ? (
                // role="alert", which Chakra's Alert does not set itself.
                <Alert.Root role="alert" status="error" size="sm">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                </Alert.Root>
              ) : detail ? (
                <SessionDetail detail={detail} />
              ) : (
                <Stack gap="3">
                  <Skeleton h="5" w="1/3" />
                  <Skeleton h="4" />
                  <Skeleton h="4" w="2/3" />
                </Stack>
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

function SessionDetail({ detail }: { detail: StorySessionDetail }) {
  const playersId = useId();
  const folds = [
    { value: "notes", label: "Notes", text: detail.notes },
    { value: "questions", label: "Lingering questions", text: detail.lingeringQuestions },
  ].filter((fold) => fold.text);

  return (
    <Stack gap="4">
      {detail.imageLink && (
        // Decoration beside a heading that already names the session, so
        // the alt is empty and the image reads as presentation.
        <Image src={detail.imageLink} alt="" rounded="md" w="full" maxH="40" objectFit="cover" />
      )}

      {/* The length is generated once the session is done; before that the
          status says why there is none. */}
      <Text textStyle="sm" color="fg.muted">
        {detail.length === null
          ? SESSION_STATUS_TEXT[detail.status]
          : formatSessionLength(detail.length)}
      </Text>

      <Stack gap="2">
        <Text id={playersId} textStyle="sm" fontWeight="semibold">
          Players
        </Text>
        {detail.players.length === 0 ? (
          <Text textStyle="sm" color="fg.muted">
            No players recorded.
          </Text>
        ) : (
          <List.Root aria-labelledby={playersId} listStyleType="none" gap="2">
            {detail.players.map((player) => (
              <List.Item key={player.idUser}>
                <HStack gap="2">
                  <Avatar.Root size="xs">
                    <Avatar.Fallback name={player.name} />
                    {player.image && <Avatar.Image src={player.image} alt="" />}
                  </Avatar.Root>
                  <Text textStyle="sm">{player.name}</Text>
                </HStack>
              </List.Item>
            ))}
          </List.Root>
        )}
      </Stack>

      {detail.summary && <Text textStyle="sm">{detail.summary}</Text>}

      {folds.length > 0 && (
        <Accordion.Root collapsible multiple size="sm" variant="enclosed">
          {folds.map((fold) => (
            <Accordion.Item key={fold.value} value={fold.value}>
              <Accordion.ItemTrigger>
                <Text flex="1" textStyle="sm">
                  {fold.label}
                </Text>
                <Accordion.ItemIndicator />
              </Accordion.ItemTrigger>
              <Accordion.ItemContent>
                {/* The text keeps its line breaks: the seed writes one note
                    or question per line, and so will the form. */}
                <Accordion.ItemBody textStyle="sm" whiteSpace="pre-line">
                  {fold.text}
                </Accordion.ItemBody>
              </Accordion.ItemContent>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      )}
    </Stack>
  );
}
