"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Badge, Field, HStack, NativeSelect, Separator, Stack, Text } from "@chakra-ui/react";
import { Minus, Pencil } from "lucide-react";
import { isElementKind } from "@/lib/elements";
import type { ElementDetail, ElementPanelDetail, PlayItem, SceneLink } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import {
  sa_getElementDetail,
  sa_moveSceneElement,
  sa_unlinkSceneElement,
  sa_updateSceneElement,
  sa_updateStoryElement,
} from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { RunElementForm } from "./run-element-form";
import { ElementDetailRows } from "./run-element-detail";
import { RunSceneSection } from "./run-scene-section";
import { sa_listStatusOptions } from "@/components/status/actions";

type Props = {
  idStory: number;
  /** The scene the table is on, whose link to the element the panel shows; null for none. */
  idStoryScene: number | null;
  idElement: number;
  /** What the pill or the library calls the element, until it has loaded. */
  label: string;
  /**
   * The name at the top of the panel, drawn by whatever holds the panel: the
   * library's popover makes it the popover's title, a pill a heading under
   * itself. Given the text to show, "Edit Dafydd" while the form is open.
   */
  heading: (text: string) => ReactNode;
  /**
   * The scene is complete: nothing goes into it or comes out of it, so the
   * scene's status is only shown, Remove from scene and Move to are left
   * out, and the pencil edits the element alone.
   */
  locked?: boolean;
  /** The element's status in the scene has been moved from here. */
  onSceneStatusChange: (status: string) => void;
  /** The In this scene info toggle has been pressed from here, or put back. */
  onShowInfoChange?: (showInfo: boolean) => void;
  /**
   * The element has been edited in the scene, moved, or filed under other
   * stacks from here, as its pill now is.
   */
  onItemChange: (item: PlayItem) => void;
  /** The element has been edited from here, as the story now holds it. */
  onEdited?: (element: ElementDetail) => void;
  /**
   * The picture the pill shows has been changed from here: its address, or
   * null for none. The link's own picture for this scene when it has one,
   * else the element's.
   */
  onImageChange: (imageUrl: string | null) => void;
  /** The element has been taken out of the scene from here. */
  onRemovedFromScene: () => void;
  /**
   * From a pill: the tag of the stack it is in, which Move to takes it out
   * of (null for Default), and the scene's other stacks, which Move to
   * offers. The library leaves both out, and the panel has no Move to.
   */
  stackTag?: string | null;
  otherStacks?: string[];
  /** The scene's stacks, in order, for the Stack row's dialog; left out, the tags are only shown. */
  sceneStacks?: string[];
};

/** What the panel shows once it has loaded: the detail and both workflows. */
type Loaded = ElementPanelDetail & {
  elementOptions: StatusOption[];
  sceneOptions: StatusOption[];
};

/**
 * The element panel: everything about the element as the story holds it,
 * and, when it is in the scene the table is on, about its link to that
 * scene. A pill opens it in place under itself (RunPlayPill); the library
 * opens it in a popover (RunElementInfoPopover). Fetched as it mounts
 * (sa_getElementDetail), so it shows what is stored now, the status menu's
 * last choice included, rather than what the page loaded with; a holder
 * that wants it loaded afresh mounts it afresh.
 *
 * A badge beside the name says which it is: SCENE for an element in the
 * scene, STORY for one that is only the story's. Only a SCENE element has
 * the scene's part, first, as a card (RunSceneSection): its status on the
 * In this scene heading with the − that takes it out, its stacks, its info
 * toggle, its picture and other images for this scene, and, under the
 * element's own rows, Move to. Moving its status tells the play space, so
 * the pill keeps up. The element's own status is among its own rows either
 * way.
 *
 * The pill shows the link's picture for this scene when it has one, else
 * the element's, so a change to either here is reported as whichever the
 * pill should now show (onImageChange).
 *
 * The pencil swaps the detail for RunElementForm, filled in. A SCENE
 * element is edited with its scene status (sa_updateSceneElement), which
 * hands the play space the pill as it now is; a STORY element, or one in a
 * complete scene, is edited alone (sa_updateStoryElement). Either way the
 * panel goes back to the detail, loaded again.
 */
export function RunElementPanel({
  idStory,
  idStoryScene,
  idElement,
  label,
  heading,
  locked = false,
  onSceneStatusChange,
  onShowInfoChange,
  onItemChange,
  onEdited,
  onImageChange,
  onRemovedFromScene,
  stackTag = null,
  otherStacks = [],
  sceneStacks,
}: Props) {
  // undefined while loading, null when there is nothing to show.
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  // The link's own picture for this scene, as the scene card last read or
  // set it; null for none. What the pill shows over the element's picture.
  const [sceneImageUrl, setSceneImageUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Bumped to load again, after an edit saved in the scene.
  const [loads, setLoads] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([
      sa_getElementDetail(idStory, idElement, idStoryScene),
      sa_listStatusOptions("elements"),
      sa_listStatusOptions("scene_elements"),
    ])
      .then(([found, elementOptions, sceneOptions]) => {
        if (live) setLoaded(found ? { ...found, elementOptions, sceneOptions } : null);
      })
      .catch(() => {
        if (live) setLoaded(null);
      });
    return () => {
      live = false;
    };
  }, [idStory, idElement, idStoryScene, loads]);

  // The scene's part of the panel: only for an element in the scene, and
  // only while there is a scene to speak of.
  const inScene = Boolean(loaded?.link) && idStoryScene !== null;

  // Changes kept in the loaded detail, so the pencil's form starts from what
  // was just set here rather than what the panel opened with.
  const patchElement = (patch: Partial<ElementDetail>) =>
    setLoaded((current) =>
      current ? { ...current, element: { ...current.element, ...patch } } : current,
    );
  const patchLink = (patch: Partial<SceneLink>) =>
    setLoaded((current) =>
      current?.link ? { ...current, link: { ...current.link, ...patch } } : current,
    );

  // Move to: the pill leaves this stack for the one chosen, which redraws it
  // there and so closes this panel with it.
  async function moveTo(tag: string) {
    if (!tag || idStoryScene === null) return;
    setMoving(true);
    try {
      const result = await sa_moveSceneElement(idStory, idStoryScene, idElement, stackTag, tag);
      if (result.ok) onItemChange(result.item);
      else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The element could not be moved. Try again.", type: "error" });
    } finally {
      setMoving(false);
    }
  }

  // The − beside In this scene: the link is deleted (sa_unlinkSceneElement)
  // and the element stays in the story. From a pill, the pill leaves the
  // play space, taking this panel with it; from the library, the panel
  // stays open on the element, now STORY.
  async function removeFromScene() {
    if (idStoryScene === null) return;
    setRemoving(true);
    try {
      const result = await sa_unlinkSceneElement(idStory, idStoryScene, idElement);
      if (result.ok) {
        setLoaded((current) => (current ? { ...current, link: null } : current));
        toaster.create({ title: "Removed from the scene", type: "success" });
        onRemovedFromScene();
      } else {
        toaster.create({ title: result.error, type: "error" });
      }
    } catch {
      toaster.create({ title: "The element could not be removed. Try again.", type: "error" });
    } finally {
      setRemoving(false);
    }
  }

  const name = loaded?.element.name ?? label;

  return (
    <Stack gap="3">
      <HStack justify="space-between" gap="2">
        <HStack gap="2" minW="0" wrap="wrap">
          {heading(editing ? `Edit ${name}` : name)}
          {/* SCENE or STORY: whether this is the element in the scene at
              the table, or only the story's. */}
          {loaded && (
            <Badge size="xs" variant="outline" data-testid="element-panel-where">
              {inScene ? "SCENE" : "STORY"}
            </Badge>
          )}
        </HStack>
        {loaded && !editing && (
          <PrepIconButton label={`Edit ${name}`} onClick={() => setEditing(true)} outlined>
            <Pencil />
          </PrepIconButton>
        )}
      </HStack>
      {loaded && editing ? (
        <EditForm
          idStory={idStory}
          idStoryScene={idStoryScene}
          idElement={idElement}
          element={loaded.element}
          // A complete scene takes no change, so its element is edited as
          // the story's.
          link={inScene && !locked ? loaded.link : null}
          onSavedInScene={(item) => {
            onItemChange(item);
            setEditing(false);
            setLoaded(undefined);
            setLoads((count) => count + 1);
          }}
          onSavedInStory={(element) => {
            patchElement(element);
            setEditing(false);
            onEdited?.(element);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : loaded === undefined ? (
        <Text color="fg.muted">Loading…</Text>
      ) : loaded === null ? (
        <Text color="fg.muted">This element is no longer in the story.</Text>
      ) : (
        <Stack gap="4">
          {loaded.link && inScene && idStoryScene !== null && (
            <RunSceneSection
              idStory={idStory}
              idStoryScene={idStoryScene}
              idElement={idElement}
              name={name}
              link={loaded.link}
              locked={locked}
              sceneOptions={loaded.sceneOptions}
              sceneStacks={sceneStacks}
              action={
                // Hidden while the action is out, so a second press cannot
                // send it twice.
                !locked &&
                !removing && (
                  <PrepIconButton
                    label="Remove from scene"
                    onClick={() => void removeFromScene()}
                    outlined
                  >
                    <Minus />
                  </PrepIconButton>
                )
              }
              onStatusChange={(status) => {
                patchLink({ status });
                onSceneStatusChange(status);
              }}
              onShowInfoChange={(showInfo) => {
                patchLink({ showInfo });
                onShowInfoChange?.(showInfo);
              }}
              onTagsChange={(item) => {
                patchLink({ tags: item.sceneTags ?? [] });
                onItemChange(item);
              }}
              onImageLoaded={setSceneImageUrl}
              onImageChange={(url) => {
                setSceneImageUrl(url);
                onImageChange(url ?? loaded.element.imageUrl);
              }}
            />
          )}
          <ElementDetailRows
            element={loaded.element}
            statusOptions={loaded.elementOptions}
            onStatusChange={(status) => patchElement({ status })}
            idStory={idStory}
            idStoryScene={idStoryScene}
            onImageChange={(imageUrl) => {
              patchElement({ imageUrl });
              // The link's own picture, if any, still stands in front.
              onImageChange(sceneImageUrl ?? imageUrl);
            }}
          />
          {inScene && !locked && otherStacks.length > 0 && (
            <>
              <Separator />
              <Field.Root>
                <Field.Label>Move to</Field.Label>
                <NativeSelect.Root size="sm" disabled={moving}>
                  <NativeSelect.Field
                    value=""
                    onChange={(event) => void moveTo(event.target.value)}
                  >
                    <option value="" disabled>
                      Choose a stack
                    </option>
                    {otherStacks.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * The pencil's form: with the scene's status for an element in an open
 * scene, saved with its link (sa_updateSceneElement); without it for a
 * STORY element, saved alone (sa_updateStoryElement).
 */
function EditForm({
  idStory,
  idStoryScene,
  idElement,
  element,
  link,
  onSavedInScene,
  onSavedInStory,
  onCancel,
}: {
  idStory: number;
  idStoryScene: number | null;
  idElement: number;
  element: ElementDetail;
  link: SceneLink | null;
  onSavedInScene: (item: PlayItem) => void;
  onSavedInStory: (element: ElementDetail) => void;
  onCancel: () => void;
}) {
  const initial = {
    kind: isElementKind(element.kind) ? element.kind : "OTHER",
    name: element.name,
    initialName: element.initialName ?? "",
    title: element.title ?? "",
    description: element.description ?? "",
    notes: element.notes ?? "",
    url: element.url ?? "",
    urlText: element.urlText ?? "",
    status: element.status,
    sceneStatus: link?.status ?? "",
    sceneUrl: link?.url ?? "",
    sceneUrlText: link?.urlText ?? "",
  } as const;

  if (link && idStoryScene !== null) {
    return (
      <RunElementForm
        initial={initial}
        save={(values) => sa_updateSceneElement(idStory, idStoryScene, idElement, values)}
        onSaved={({ item }) => onSavedInScene(item)}
        onCancel={onCancel}
        submitLabel="Save element"
      />
    );
  }
  return (
    <RunElementForm
      inScene={false}
      initial={initial}
      save={(values) => sa_updateStoryElement(idStory, idElement, values)}
      onSaved={({ element: saved }) => onSavedInStory(saved)}
      onCancel={onCancel}
      submitLabel="Save element"
    />
  );
}
