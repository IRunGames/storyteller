"use client";

import { useId, useState } from "react";
import NextLink from "next/link";
import { Alert, Badge, Button, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { Copy, Pencil, RefreshCw } from "lucide-react";
import {
  sa_copySystemStatBlockDefinition,
  type StoryStatBlockDefinition,
} from "@/app/(app)/(nav)/stories/[id]/stat-blocks/actions";
import { DeleteButton } from "@/components/confirm/delete-button";
import { LocalDate } from "@/components/dates/local-date";
import { StatBlockDefinitionView } from "@/components/stat-blocks/stat-block-definition-view";
import { toaster } from "@/components/ui/toaster";

/** Whether one stamp is later than another; a missing stamp is older than any. */
function isNewer(stamp: string | undefined, than: string | undefined): boolean {
  if (stamp === undefined) return false;
  return than === undefined || Date.parse(stamp) > Date.parse(than);
}

/** ", updated <when>", or that the definition was last saved before saves were stamped. */
function Updated({ stamp }: { stamp: string | undefined }) {
  if (stamp === undefined) return <>, update date not recorded</>;
  return (
    <>
      , updated <LocalDate value={new Date(stamp)} withTime />
    </>
  );
}

/**
 * The story page's Stat block section: the definition the story's elements
 * carry, to read, which is the story's own copy when it has one and its
 * game system's otherwise, under a line for each saying when it was last
 * saved, the game's marked Newer when it has changed since the copy was. The
 * storyteller copies the game's to the story here, and once there is a copy,
 * opens it on its own page to change it or overwrites it with the game's as
 * it stands, which asks first, since the copy's changes go. A story with no
 * game system and no copy has no section.
 */
export function StoryStatBlock({
  idStory,
  initial,
  mutedColor,
}: {
  idStory: number;
  initial: StoryStatBlockDefinition;
  /** The secondary text's colour, which differs on a cover (StoryPanel). */
  mutedColor: string;
}) {
  const headingId = useId();
  const { isStoryteller, system } = initial;
  const [copy, setCopy] = useState(initial.copy);
  const [isCopying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!system && !copy) return null;
  const shown = copy ?? system?.definition ?? { groups: [] };

  async function copyToStory() {
    setCopying(true);
    setError(null);
    try {
      const result = await sa_copySystemStatBlockDefinition(idStory);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCopy(result.copy);
      toaster.create({ title: "This story has its own stat block now.", type: "success" });
    } catch {
      setError("The stat block could not be copied. Try again.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <Stack as="section" aria-labelledby={headingId} gap="4">
      <Heading id={headingId} size="xl">
        Stat block
      </Heading>
      <Stack gap="0" color={mutedColor}>
        <Text>
          {copy ? "This story has its own stat block." : "This story uses its game's stat block."}
        </Text>
        {copy && (
          <Text data-testid="stat-block-copy">
            This story&apos;s copy
            <Updated stamp={copy.updatedAt} />
          </Text>
        )}
        {system && (
          <HStack gap="2" data-testid="stat-block-game">
            <Text>
              {system.label}&apos;s
              <Updated stamp={system.definition.updatedAt} />
            </Text>
            {copy && isNewer(system.definition.updatedAt, copy.updatedAt) && (
              <Badge colorPalette="orange" variant="solid">
                Newer
              </Badge>
            )}
          </HStack>
        )}
      </Stack>

      {isStoryteller && (
        <HStack wrap="wrap" gap="3">
          {copy ? (
            <>
              <Button asChild variant="outline">
                <NextLink href={`/stories/${idStory}/stat-blocks`}>
                  <Pencil /> Edit stat block
                </NextLink>
              </Button>
              {system && (
                <DeleteButton
                  trigger="button"
                  verb="Overwrite"
                  thing="this story's stat block"
                  label="Overwrite with the game's"
                  icon={<RefreshCw />}
                  done="This story's stat block now matches the game's."
                  failed="The stat block could not be overwritten. Try again."
                  onDelete={async () => {
                    const result = await sa_copySystemStatBlockDefinition(idStory);
                    if (result.ok) setCopy(result.copy);
                    return result;
                  }}
                >
                  {`${system.label}'s stat block as it stands replaces this story's copy, and every change made to the copy is lost.`}
                </DeleteButton>
              )}
            </>
          ) : (
            system && (
              <Button variant="outline" loading={isCopying} onClick={copyToStory}>
                <Copy /> Copy to this story
              </Button>
            )
          )}
        </HStack>
      )}
      {error && (
        <Alert.Root role="alert" status="error" size="sm">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <StatBlockDefinitionView definition={shown} mutedColor={mutedColor} />
    </Stack>
  );
}
