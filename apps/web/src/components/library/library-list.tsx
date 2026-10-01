import NextLink from "next/link";
import { Badge, HStack, IconButton, Link, Portal, Stack, Text, Tooltip } from "@chakra-ui/react";
import { BookOpen } from "lucide-react";
import type { LibraryStory } from "@/app/(app)/(nav)/library/actions";

type Props = {
  /** The caller's own stories, loaded by the page. */
  stories: LibraryStory[];
};

/**
 * The Library page's list: one row per story the caller runs, each with a
 * book button into that story's library. Presentational only, with no hooks,
 * so the page can render it on the server.
 */
export function LibraryList({ stories }: Props) {
  if (stories.length === 0) {
    return (
      <Text color="fg.muted">
        You are not the storyteller of any story yet, so there is no library to open.{" "}
        <Link asChild variant="underline">
          <NextLink href="/stories/new">Start a story</NextLink>
        </Link>{" "}
        and its library comes with it.
      </Text>
    );
  }

  return (
    <Stack as="ul" role="list" aria-label="Your stories" gap="1" listStyleType="none">
      {stories.map((story) => (
        <HStack as="li" key={story.idStory} gap="3" py="2" borderBottomWidth="1px">
          <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
            <Tooltip.Trigger asChild>
              {/* A link styled as a button: the library is a page of its own,
                  so the browser can open it in a new tab. */}
              <IconButton
                asChild
                aria-label={`Open the library for ${story.title}`}
                variant="ghost"
              >
                <NextLink href={`/libraries/${story.idStory}`}>
                  <BookOpen />
                </NextLink>
              </IconButton>
            </Tooltip.Trigger>
            <Portal>
              <Tooltip.Positioner>
                <Tooltip.Content>Open library</Tooltip.Content>
              </Tooltip.Positioner>
            </Portal>
          </Tooltip.Root>
          <Stack gap="0" flex="1" minW="0">
            <Text fontWeight="medium" truncate>
              {story.title}
            </Text>
            {story.system && (
              <Text fontSize="sm" color="fg.muted" truncate>
                {story.system}
              </Text>
            )}
          </Stack>
          {/* Archived wins: an archived story is never active either, and
              saying both would be saying the same thing twice. */}
          {story.isArchived ? <Badge>Archived</Badge> : !story.isActive && <Badge>Inactive</Badge>}
        </HStack>
      ))}
    </Stack>
  );
}
