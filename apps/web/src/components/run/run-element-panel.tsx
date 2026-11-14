"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Field, HStack, NativeSelect, Separator, Stack, Text } from "@chakra-ui/react";
import { Pencil } from "lucide-react";
import { isElementKind } from "@/lib/elements";
import {
  SCENE_ELEMENT_HIDDEN,
  type ElementDetail,
  type ElementPanelDetail,
  type PlayItem,
  type SceneLink,
} from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import {
  sa_getElementDetail,
  sa_moveSceneElement,
  sa_unlinkSceneElement,
  sa_updateSceneElement,
  sa_updateStoryElement,
} from "@/components/run/actions";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { DeleteButton } from "@/components/confirm/delete-button";
import { ElementHistory } from "@/components/elements/element-history";
import { sa_getStatBlocks, type ElementStatBlock } from "@/components/stat-blocks/actions";
import { ElementStatBlocks } from "@/components/stat-blocks/stat-block-view";
import { ElementStatBlocksFold } from "./element-stat-blocks-fold";
import { RunElementForm } from "./run-element-form";
import { ElementDetailRows } from "./run-element-detail";
import { RunSceneSection } from "./run-scene-section";
import { sa_listStatusOptions } from "@/components/status/actions";

type Props = {
  idStory: number;
  /** The scene the table is on, whose link to the element the panel shows; null for none. */
  idStoryScene: number | null;
  idElement: number;
  /**
   * Which link of the element to the scene, from a pill; the library leaves
   * it out and the panel shows the element's first link, an element being in
   * a scene any number of times.
   */
  idSceneElement?: number | null;
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
  /**
   * Whether the pencil is offered. A pill in a complete scene leaves it
   * out, the scene being there to read; the library keeps it, since the
   * element in the story may still be edited from there.
   */
  canEdit?: boolean;
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
  /** The link has been taken out of the scene from here, by id. */
  onRemovedFromScene: (idSceneElement: number) => void;
  /**
   * From a pill: the tag of the stack it is in, which Move to takes it out
   * of (null for Default), and the scene's other stacks, which Move to
   * offers. The library leaves both out, and the panel has no Move to.
   */
  stackTag?: string | null;
  otherStacks?: string[];
  /** The scene's stacks, in order, for the heading's stacks menu; left out, the tags are only shown. */
  sceneStacks?: string[];
};

/** What the panel shows once it has loaded: the detail and both workflows. */
type Loaded = ElementPanelDetail & {
  elementOptions: StatusOption[];
  sceneOptions: StatusOption[];
  /** The element's own stat blocks, the baseline the link's copy was taken from. */
  elementBlocks: ElementStatBlock[];
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
 * Only an element in the scene has the scene's part, first, as a card
 * (RunSceneSection) under a SCENE pill the width of the panel that rides
 * over its top edge, with its stacks menu at the pill's end: its status and
 * info toggle with the thumbnail of its pictures for this scene at the
 * right, its link and its copy of the stat blocks, closed to start; the
 * trashcan beside the pencil takes
 * it out of the scene. The element's own rows follow under a STORY pill of
 * the same cut (ElementDetailRows), and, under them, Move to; an element
 * that is only the story's has the rows alone. Moving its status tells the play space, so
 * the pill keeps up. The element's own status is among its own rows either
 * way. Last of all, History: the story's other scenes the element has been
 * in (ElementHistory), closed until its chevron is pressed.
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
  idSceneElement = null,
  label,
  heading,
  locked = false,
  canEdit = true,
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
  // Bumped to load again, after an edit saved in the scene.
  const [loads, setLoads] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([
      sa_getElementDetail(idStory, idElement, idStoryScene, idSceneElement),
      sa_listStatusOptions("elements"),
      sa_listStatusOptions("scene_elements"),
      sa_getStatBlocks({ idStory, idElement }),
    ])
      .then(([found, elementOptions, sceneOptions, elementBlocks]) => {
        if (live) {
          setLoaded(
            found
              ? { ...found, elementOptions, sceneOptions, elementBlocks: elementBlocks ?? [] }
              : null,
          );
        }
      })
      .catch(() => {
        if (live) setLoaded(null);
      });
    return () => {
      live = false;
    };
  }, [idStory, idElement, idStoryScene, idSceneElement, loads]);

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
    if (!tag || idStoryScene === null || !loaded?.link) return;
    const link = loaded.link.idSceneElement;
    setMoving(true);
    try {
      const result = await sa_moveSceneElement(idStory, idStoryScene, link, stackTag, tag);
      if (result.ok) onItemChange(result.item);
      else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The element could not be moved. Try again.", type: "error" });
    } finally {
      setMoving(false);
    }
  }

  // The trashcan beside the pencil: the link is deleted
  // (sa_unlinkSceneElement), once the question is answered, and the element
  // stays in the story. From a pill, the pill leaves the play space, taking
  // this panel with it; from the library, the panel stays open on the
  // element, now STORY. A refusal is the popover's to show.
  async function removeFromScene() {
    if (idStoryScene === null || !loaded?.link) return { ok: false as const, error: "" };
    const link = loaded.link.idSceneElement;
    const result = await sa_unlinkSceneElement(idStory, idStoryScene, link);
    if (result.ok) {
      setLoaded((current) => (current ? { ...current, link: null } : current));
      onRemovedFromScene(link);
    }
    return result;
  }

  const name = loaded?.element.name ?? label;

  return (
    <Stack gap="3">
      <HStack justify="space-between" gap="2">
        <HStack gap="2" minW="0" wrap="wrap">
          {heading(editing ? `Edit ${name}` : name)}
        </HStack>
        {loaded && !editing && (
          <HStack gap="1" flexShrink="0">
            {canEdit && (
              <PrepIconButton label={`Edit ${name}`} onClick={() => setEditing(true)} outlined>
                <Pencil />
              </PrepIconButton>
            )}
            {inScene && !locked && (
              <DeleteButton
                thing={name}
                label="Remove from scene"
                verb="Remove"
                done="Removed from the scene"
                failed="The element could not be removed. Try again."
                onDelete={removeFromScene}
              >
                It leaves this scene, and its copy of the stats goes with it. The element stays in
                the story.
              </DeleteButton>
            )}
          </HStack>
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
              name={name}
              link={loaded.link}
              locked={locked}
              sceneOptions={loaded.sceneOptions}
              sceneStacks={sceneStacks}
              holder={{ idStory, idSceneElement: loaded.link.idSceneElement }}
              // The chat names the element as its pill does; an invisible
              // element's roll stays with the storyteller.
              rollAs={{ title: label, quiet: loaded.link.status === SCENE_ELEMENT_HIDDEN }}
              elementHasStats={loaded.elementBlocks.some((block) => block.carried.length > 0)}
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
            onTagsChange={(tags) => {
              patchElement({ tags });
              onEdited?.({ ...loaded.element, tags });
            }}
            idStory={idStory}
            idStoryScene={idStoryScene}
            onImageChange={(imageUrl) => {
              patchElement({ imageUrl });
              // The link's own picture, if any, still stands in front.
              onImageChange(sceneImageUrl ?? imageUrl);
            }}
          />
          {/* From a pill, the element's own blocks folded under its rows, to
              read beside the link's copy above; from the library, the
              element's blocks themselves, to change. */}
          {inScene && loaded.link ? (
            <ElementStatBlocksFold
              holder={{ idStory, idElement: loaded.element.idElement }}
              blocks={loaded.elementBlocks}
            />
          ) : (
            <ElementStatBlocks
              holder={{ idStory, idElement: loaded.element.idElement }}
              canEdit={!locked}
              rollAs={{ title: label, quiet: false }}
            />
          )}
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
          <Separator />
          <ElementHistory idStory={idStory} idElement={idElement} idStoryScene={idStoryScene} />
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
    sceneLabel: link?.label ?? "",
  } as const;

  if (link && idStoryScene !== null) {
    return (
      <RunElementForm
        initial={initial}
        save={(values) => sa_updateSceneElement(idStory, idStoryScene, link.idSceneElement, values)}
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
