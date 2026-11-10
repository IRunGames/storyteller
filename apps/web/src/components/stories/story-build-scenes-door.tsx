"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { Clapperboard } from "lucide-react";
import { sa_createLiveScene } from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";

type Props = {
  idStory: number;
  /** The scene to open, the storyteller's last touched (sa_getSceneToBuild); null with none yet. */
  buildSceneId: number | null;
  /** True when the door sits on the dark panel over a cover image. */
  onImage: boolean;
};

const LABEL = "Build Scenes";

/**
 * The story page's Build Scenes door: a link to the live-edit page of the
 * scene the storyteller touched last, as the library's scene cards open one.
 * A story with no scenes yet has no such page, so the door is then a button
 * that makes the story's first scene (sa_createLiveScene, as the live-edit
 * page's + does) and goes to it, rather than leaving the storyteller in the
 * library to find the + themselves: the door says Build Scenes, and that is
 * where scenes are built. The scene is a plain "New scene", renamed from
 * the panel behind its title once there. A client component because the
 * button is state and a navigation; a link needs neither, but one component
 * keeps the door one thing in the page's corner.
 */
export function StoryBuildScenesDoor({ idStory, buildSceneId, onImage }: Props) {
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

  const look = {
    variant: "ghost" as const,
    size: "sm" as const,
    rounded: "full",
    color: onImage ? "whiteAlpha.900" : undefined,
    _hover: onImage ? { bg: "whiteAlpha.200" } : undefined,
  };

  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        {buildSceneId === null ? (
          <IconButton
            type="button"
            aria-label={LABEL}
            aria-disabled={isMaking}
            opacity={isMaking ? "0.6" : undefined}
            onClick={() => void makeFirstScene()}
            {...look}
          >
            <Clapperboard size={18} />
          </IconButton>
        ) : (
          <IconButton asChild aria-label={LABEL} {...look}>
            <NextLink href={`/scenes/${buildSceneId}/live`}>
              <Clapperboard size={18} />
            </NextLink>
          </IconButton>
        )}
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{LABEL}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
