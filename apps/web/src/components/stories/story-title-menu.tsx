"use client";

import { useState, type ReactNode } from "react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { sa_createLiveScene } from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";

type Props = {
  idStory: number;
  title: string;
  /** The storyteller alone has Edit, Library, Build scenes and Play; everyone has Storyboard. */
  isStoryteller: boolean;
  /**
   * The scene Build scenes opens, the one touched last (sa_getSceneToBuild);
   * null, or left out, for a story with no scene yet, when the item makes
   * the first one and goes to it instead.
   */
  buildSceneId?: number | null;
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
 * Build scenes and Play for the storyteller; and the Storyboard for anyone. Play is the Play button by another door: it opens
 * the same popover by the title (StoryPlayPopover), asking which session,
 * and the table opens from there. Each item is a real link, so the browser's own
 * ways with links hold, Cmd-click opening one in another tab among them,
 * but for the page the menu is on, which is marked as the current one and
 * is no link, since there is nowhere to go, and for Build scenes on a story
 * with no scene yet, which has no page to link to: that item makes the
 * story's first scene (sa_createLiveScene, as the live page's + does) and
 * goes to it. The title is the trigger,
 * inside whatever element the page asks for
 * (`as`): the story page's h1, the library's inside its own h1, and a span
 * in the table headers, which have their h1 already.
 */
export function StoryTitleMenu({
  idStory,
  title,
  isStoryteller,
  buildSceneId = null,
  as = "h1",
  size = "3xl",
  fontWeight,
  onImage = false,
}: Props) {
  const pathname = usePathname();
  const [playOpen, setPlayOpen] = useState(false);

  // Which door is the page itself: Build scenes is any scene's live page,
  // not only the one it would open, since that is where scenes are built.
  const isCurrent = (value: string, href: string) =>
    value === "build" ? /^\/scenes\/-?\d+\/live$/.test(pathname ?? "") : pathname === href;
  const items: {
    value: string;
    label: string;
    href: string | null;
    icon: ReactNode;
    /** The item opens the Play popover rather than following its address. */
    opens?: boolean;
  }[] = [
    { value: "overview", label: "Overview", href: `/stories/${idStory}`, icon: <ScrollText /> },
    ...(isStoryteller
      ? [
          { value: "edit", label: "Edit", href: `/stories/${idStory}/edit`, icon: <Pencil /> },
          { value: "library", label: "Library", href: `/libraries/${idStory}`, icon: <BookOpen /> },
          {
            value: "build",
            label: "Build scenes",
            href: buildSceneId === null ? null : `/scenes/${buildSceneId}/live`,
            icon: <Clapperboard />,
          },
          { value: "play", label: "Play", href: `/run/${idStory}`, icon: <Play />, opens: true },
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
              item.href === null ? (
                <FirstSceneItem
                  key={item.value}
                  idStory={idStory}
                  value={item.value}
                  icon={item.icon}
                  label={item.label}
                />
              ) : isCurrent(item.value, item.href) ? (
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
                  <NextLink href={item.href}>
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

/**
 * Build scenes on a story with no scene yet, which has no page to link to:
 * it makes the first scene, a plain "New scene" renamed from the panel
 * behind its title once there (sa_createLiveScene, as the live page's +
 * does), and goes to it. The menu stays open while it works, the item
 * disabled, so the press is seen to be taken.
 */
function FirstSceneItem({
  idStory,
  value,
  icon,
  label,
}: {
  idStory: number;
  value: string;
  icon: ReactNode;
  label: string;
}) {
  const router = useRouter();
  const [isMaking, setMaking] = useState(false);

  async function makeFirstScene() {
    if (isMaking) return;
    setMaking(true);
    try {
      const result = await sa_createLiveScene(idStory, { title: "New scene", description: "" });
      if (!result.ok || !result.space.scene) {
        toaster.create({ title: "The scene could not be made. Try again.", type: "error" });
        return;
      }
      router.push(`/scenes/${result.space.scene.idStoryScene}/live`);
    } catch {
      toaster.create({ title: "The scene could not be made. Try again.", type: "error" });
    } finally {
      setMaking(false);
    }
  }

  return (
    <Menu.Item
      value={value}
      disabled={isMaking}
      closeOnSelect={false}
      onClick={() => void makeFirstScene()}
    >
      {icon}
      {label}
    </Menu.Item>
  );
}
