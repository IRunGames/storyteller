"use client";

import { useId, useState } from "react";
import {
  Alert,
  Clipboard,
  IconButton,
  Input,
  InputGroup,
  Popover,
  Portal,
  Spinner,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { Link2 } from "lucide-react";
import { sa_getJoinLink, type JoinLink } from "@/app/(app)/run/[id]/actions";

/**
 * The storyteller's way to hand out the story's join link: a button in the
 * middle of their table's header that opens the link, ready to copy, and
 * how many of the seats it may give out are taken. Anyone who follows it
 * sits at the story, as a guest if they have no account (/join/[code]).
 *
 * The link is fetched each time the popover opens rather than with the
 * page: the code is made the first time it is asked for (sa_getJoinLink),
 * so a storyteller who never opens this never has one, and the count is
 * fresh. The link is built on this page's origin, so it points at wherever
 * the table is being run.
 *
 * Tooltip and popover share one trigger id, for the reason
 * NavFeedbackPopover gives.
 */
export function JoinLinkButton({ idStory }: { idStory: number }) {
  const triggerId = useId();
  const [link, setLink] = useState<JoinLink | null | "loading">(null);
  const [failed, setFailed] = useState(false);

  async function load() {
    setLink("loading");
    setFailed(false);
    try {
      setLink(await sa_getJoinLink(idStory));
    } catch {
      setLink(null);
      setFailed(true);
    }
  }

  const url = link && link !== "loading" ? `${window.location.origin}/join/${link.code}` : "";

  return (
    <Popover.Root
      positioning={{ placement: "bottom" }}
      ids={{ trigger: triggerId }}
      onOpenChange={(details) => {
        if (details.open) void load();
      }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton
              aria-label="Join link"
              variant="ghost"
              boxSize="11"
              rounded="10px"
              color="nav.icon"
            >
              <Link2 />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Tooltip.Positioner>
          <Tooltip.Content>Join link</Tooltip.Content>
        </Tooltip.Positioner>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="sm">
            <Popover.Arrow />
            <Popover.Header fontWeight="semibold">
              <Popover.Title>Invite by link</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              {link === "loading" ? (
                <Spinner size="sm" aria-label="Getting the link" />
              ) : failed || link === null ? (
                <Alert.Root status="error">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>The link could not be made. Try again.</Alert.Description>
                  </Alert.Content>
                </Alert.Root>
              ) : (
                <Stack gap="3">
                  <Text textStyle="sm" color="fg.muted">
                    Anyone with this link can join the table, without an account if they have none.{" "}
                    {link.joined} of {link.cap} have joined this way.
                  </Text>
                  <Clipboard.Root value={url}>
                    <InputGroup
                      endElement={
                        <Clipboard.Trigger asChild>
                          <IconButton aria-label="Copy the link" variant="ghost" size="xs" me="-2">
                            <Clipboard.Indicator />
                          </IconButton>
                        </Clipboard.Trigger>
                      }
                    >
                      <Clipboard.Input asChild>
                        <Input readOnly aria-label="Join link" />
                      </Clipboard.Input>
                    </InputGroup>
                  </Clipboard.Root>
                </Stack>
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
