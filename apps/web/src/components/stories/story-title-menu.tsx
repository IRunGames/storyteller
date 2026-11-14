"use client";

import { useState, type ReactNode } from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { chakra, Heading, Menu, Portal, type HeadingProps } from "@chakra-ui/react";
import {
  BookOpen,
  ChevronDown,
  Clapperboard,
  GalleryHorizontalEnd,
  Pencil,
  Play,
  ScrollText,
} from "lucide-react";
import { storyboardPath } from "@/lib/storyboard";
import { StoryPlayPopover } from "./story-play-popover";

type Props = {
  idStory: number;
  title: string;
  /** The storyteller alone has Edit, Library, Build scenes and Play; everyone has Storyboard. */
  isStoryteller: boolean;
  /**
   * The element the title is drawn as: the h1 of a page about the story,
   * or a span inside another heading or a header that has its own h1.
   */
  as?: "h1" | "h2" | "h3" | "span";
  size?: HeadingProps["size"];
  fontWeight?: HeadingProps["fontWeight"];
  /** True on a dark panel over a cover, so the title and its caret stay light. */
  onImage?: boolean;
};

/**
 * The story's title with a caret after it, which opens the story's doors as
 * a menu: Overview, the story's own page, first for anyone; Edit, Library,
 * Build scenes and Play for the storyteller; and the Storyboard for anyone.
 * Play is the Play button by another door: it opens the same popover by the
 * title (StoryPlayPopover), asking which session, and the table opens from
 * there. Each item is a real link, so the browser's own ways with links
 * hold, Cmd-click opening one in another tab among them, but for the page
 * the menu is on, which is marked as the current one and is no link, since
 * there is nowhere to go. Build scenes links to /stories/<id>/scenes, the
 * page that opens the scene touched last, or makes the first one for a story
 * with none; the menu does not need to know which. The title is the
 * trigger, inside whatever element the page asks for (`as`): the story
 * page's h1, the library's inside its own h1, and a span in the table
 * headers, which have their h1 already.
 */
export function StoryTitleMenu({
  idStory,
  title,
  isStoryteller,
  as = "h1",
  size = "3xl",
  fontWeight,
  onImage = false,
}: Props) {
  const pathname = usePathname();
  const [playOpen, setPlayOpen] = useState(false);

  // Which door is the page itself: Build scenes is any scene's live page,
  // not only the one /stories/<id>/scenes would open, since that is where
  // scenes are built.
  const isCurrent = (value: string, href: string) =>
    value === "build"
      ? /^\/stories\/-?\d+\/scenes\/-?\d+$/.test(pathname ?? "")
      : pathname === href;
  const items: {
    value: string;
    label: string;
    href: string;
    icon: ReactNode;
    /** The item opens the Play popover rather than following its address. */
    opens?: boolean;
    /**
     * Left unloaded until clicked. Build scenes needs it: its page makes a
     * scene for a story with none, and a prefetch, which loads a page
     * before anyone asks for it, must not do that.
     */
    prefetch?: false;
  }[] = [
    { value: "overview", label: "Overview", href: `/stories/${idStory}`, icon: <ScrollText /> },
    ...(isStoryteller
      ? [
          { value: "edit", label: "Edit", href: `/stories/${idStory}/edit`, icon: <Pencil /> },
          {
            value: "library",
            label: "Library",
            href: `/stories/${idStory}/library`,
            icon: <BookOpen />,
          },
          {
            value: "build",
            label: "Build scenes",
            href: `/stories/${idStory}/scenes`,
            icon: <Clapperboard />,
            prefetch: false as const,
          },
          {
            value: "play",
            label: "Play",
            href: `/stories/${idStory}/run`,
            icon: <Play />,
            opens: true,
          },
        ]
      : []),
    {
      value: "storyboard",
      label: "Storyboard",
      href: storyboardPath(idStory),
      icon: <GalleryHorizontalEnd />,
    },
  ];

  // lazyMount: the items are only drawn while the menu is open, so a page
  // of story cards draws none of them until one is asked for.
  return (
    <Menu.Root positioning={{ placement: "bottom-start" }} lazyMount unmountOnExit>
      <StoryPlayPopover
        idStory={idStory}
        title={title}
        anchor
        open={playOpen}
        onOpenChange={setPlayOpen}
        placement="bottom-start"
      >
        <Heading as={as} size={size} fontWeight={fontWeight} minW="0" display="inline-flex">
          <Menu.Trigger asChild>
            <chakra.button
              type="button"
              display="inline-flex"
              alignItems="center"
              gap="1"
              minW="0"
              maxW="full"
              cursor="pointer"
              rounded="sm"
              textAlign="start"
              color={onImage ? "whiteAlpha.900" : undefined}
              _hover={{ color: onImage ? "white" : "fg.muted" }}
              _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
            >
              <chakra.span truncate title={title}>
                {title}
              </chakra.span>
              <chakra.span display="inline-flex" flexShrink="0" aria-hidden>
                <ChevronDown size={18} />
              </chakra.span>
            </chakra.button>
          </Menu.Trigger>
        </Heading>
      </StoryPlayPopover>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            {items.map((item) =>
              isCurrent(item.value, item.href) ? (
                <Menu.Item
                  key={item.value}
                  value={item.value}
                  aria-current="page"
                  fontWeight="semibold"
                  bg="bg.emphasized"
                >
                  {item.icon}
                  {item.label}
                </Menu.Item>
              ) : item.opens ? (
                <Menu.Item key={item.value} value={item.value} onClick={() => setPlayOpen(true)}>
                  {item.icon}
                  {item.label}
                </Menu.Item>
              ) : (
                <Menu.Item key={item.value} value={item.value} asChild>
                  <NextLink href={item.href} prefetch={item.prefetch}>
                    {item.icon}
                    {item.label}
                  </NextLink>
                </Menu.Item>
              ),
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
