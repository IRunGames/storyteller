"use client";

import { useEffect, useState, type ReactNode } from "react";
import { HStack, Separator, Stack, Text } from "@chakra-ui/react";
import { Pencil } from "lucide-react";
import { isElementKind } from "@/lib/elements";
import { SCENE_ELEMENT_HIDDEN, type SceneItem } from "@/lib/scene-elements";
import type { ElementDetail, ElementPanelDetail, SceneLink } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { sa_getElementDetail } from "@/components/elements/actions";
import { sa_unlinkSceneElement } from "@/components/scene-elements/actions";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { DeleteButton } from "@/components/confirm/delete-button";
import { ElementHistory } from "@/components/elements/element-history";
import { sa_getStatBlocks, type ElementStatBlock } from "@/components/stat-blocks/actions";
import { ElementStatBlocks } from "@/components/stat-blocks/stat-block-view";
import { useSceneItemsContext } from "@/components/table-shell/scene-items-context";
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
   * scene's status and stack are only shown, Remove from scene is left out,
   * and the pencil edits the element alone.
   */
  locked?: boolean;
  /**
   * Whether the pencil is offered. A pill in a complete scene leaves it
   * out, the scene being there to read; the library keeps it, since the
   * element in the story may still be edited from there.
   */
  canEdit?: boolean;
  /**
   * The element has been edited from here, in the scene or in the story, or
   * moved to another stack: the play space already shows it, and a holder
   * that lists elements, the library, lists afresh.
   */
  onChanged?: () => void;
  /** The link has been taken out of the scene from here, by id; the play space already knows. */
  onRemovedFromScene?: (idSceneElement: number) => void;
  /**
   * From a pill: the tag of the stack it is in, which the stacks menu moves
   * it out of (null for Default). The library leaves it out, and the menu
   * moves the element out of the first stack it is filed under.
   */
  stackTag?: string | null;
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
 * over its top edge, with the menu that moves it to another stack at the
 * pill's end: its status and
 * info toggle with the thumbnail of its pictures for this scene at the
 * right, its link and its copy of the stat blocks, closed to start; the
 * trashcan beside the pencil takes
 * it out of the scene. The element's own rows follow under a STORY pill of
 * the same cut (ElementDetailRows); an element that is only the story's
 * has the rows alone. Moving its status tells the play space, so
 * the pill keeps up. The element's own status is among its own rows either
 * way. Last of all, History: the story's other scenes the element has been
 * in (ElementHistory), closed until its chevron is pressed.
 *
 * The pill shows the link's picture for this scene when it has one, else
 * the element's, so a change to either here gives the play space whichever
 * the pill should now show (setImage). Every change made here goes to the
 * table's play space the same way (useSceneItemsContext), so the pill keeps
 * up without the panel's holder relaying it.
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
  onChanged,
  onRemovedFromScene,
  stackTag = null,
  sceneStacks,
}: Props) {
  const sceneItems = useSceneItemsContext();
  // undefined while loading, null when there is nothing to show.
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  // The link's own picture for this scene, as the scene card last read or
  // set it, whether it is annotated, and whether it is a players' copy
  // covered in fog or with fog on it anywhere; a null url for none. What
  // the pill shows over the element's picture.
  const [sceneImage, setSceneImage] = useState<{
    url: string | null;
    annotated: boolean;
    fogCovered: boolean;
    fogActive: boolean;
  }>({ url: null, annotated: false, fogCovered: false, fogActive: false });
  const [editing, setEditing] = useState(false);
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
      sceneItems.removeLink(link);
      onRemovedFromScene?.(link);
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
              <IconButtonWithTooltip
                label={`Edit ${name}`}
                onClick={() => setEditing(true)}
                outlined
              >
                <Pencil />
              </IconButtonWithTooltip>
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
            sceneItems.replace(item);
            onChanged?.();
            setEditing(false);
            setLoaded(undefined);
            setLoads((count) => count + 1);
          }}
          onSavedInStory={(element) => {
            patchElement(element);
            setEditing(false);
            sceneItems.editElement(element);
            onChanged?.();
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
              stackTag={stackTag}
              holder={{ idStory, idSceneElement: loaded.link.idSceneElement }}
              // The chat names the element as its pill does; an invisible
              // element's roll stays with the storyteller.
              rollAs={{ title: label, quiet: loaded.link.status === SCENE_ELEMENT_HIDDEN }}
              elementHasStats={loaded.elementBlocks.some((block) => block.carried.length > 0)}
              onStatusChange={(status) => {
                patchLink({ status });
                sceneItems.patchLink(loaded.link!.idSceneElement, { sceneStatus: status });
              }}
              onShowInfoChange={(showInfo) => {
                patchLink({ showInfo });
                sceneItems.patchLink(loaded.link!.idSceneElement, { showInfo });
              }}
              // Moved from a pill, the pill is redrawn in the stack chosen,
              // which closes this panel with it.
              onMoved={(item) => {
                patchLink({ tags: item.sceneTags ?? [] });
                sceneItems.replace(item);
                onChanged?.();
              }}
              onImageLoaded={(url, annotated, fogCovered, fogActive) =>
                setSceneImage({ url, annotated, fogCovered, fogActive })
              }
              onImageChange={(url, annotated, fogCovered, fogActive) => {
                setSceneImage({ url, annotated, fogCovered, fogActive });
                // Without a picture of its own, the link shows the element's,
                // annotated and covered in fog if that picture is.
                const own = loaded.element.picture;
                sceneItems.setImage(
                  idElement,
                  url ?? loaded.element.imageUrl,
                  url === null ? own?.isAnnotated === true : annotated,
                  url === null ? own?.fogCovered === true : fogCovered,
                  url === null ? own?.fogActive === true : fogActive,
                );
              }}
            />
          )}
          <ElementDetailRows
            element={loaded.element}
            statusOptions={loaded.elementOptions}
            onStatusChange={(status) => patchElement({ status })}
            onTagsChange={(tags) => {
              patchElement({ tags });
              sceneItems.editElement({ ...loaded.element, tags });
              onChanged?.();
            }}
            idStory={idStory}
            idStoryScene={idStoryScene}
            onImageChange={(picked, picture) => {
              // Shown as the players see it, when it is an annotated picture.
              const imageUrl = picture?.shownUrl ?? picked;
              patchElement({ imageUrl, picture });
              // The link's own picture, if any, still stands in front.
              sceneItems.setImage(
                idElement,
                sceneImage.url ?? imageUrl,
                sceneImage.url === null ? picture?.isAnnotated === true : sceneImage.annotated,
                sceneImage.url === null ? picture?.fogCovered === true : sceneImage.fogCovered,
                sceneImage.url === null ? picture?.fogActive === true : sceneImage.fogActive,
              );
            }}
            onPictureChange={(picture) => {
              const imageUrl = picture.shownUrl ?? loaded.element.imageUrl;
              patchElement({ imageUrl, picture });
              sceneItems.setImage(
                idElement,
                sceneImage.url ?? imageUrl,
                sceneImage.url === null ? picture.isAnnotated : sceneImage.annotated,
                sceneImage.url === null ? picture.fogCovered : sceneImage.fogCovered,
                sceneImage.url === null ? picture.fogActive : sceneImage.fogActive,
              );
            }}
            onAnnotatedChange={(annotated) => {
              const picture = loaded.element.picture;
              if (picture) {
                patchElement({
                  picture: {
                    ...picture,
                    isAnnotated: annotated,
                    hasDrawing: annotated || picture.hasDrawing,
                  },
                });
              }
              // The pill is marked while its picture is this annotated one,
              // not the link's own. Its address is unchanged until the
              // picture is read back, and so is what that address shows.
              sceneItems.setImage(
                idElement,
                sceneImage.url ?? loaded.element.imageUrl,
                sceneImage.url === null ? annotated : sceneImage.annotated,
                sceneImage.url === null ? picture?.fogCovered === true : sceneImage.fogCovered,
                sceneImage.url === null ? picture?.fogActive === true : sceneImage.fogActive,
              );
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
  onSavedInScene: (item: SceneItem) => void;
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
        idStory={idStory}
        initial={initial}
        target={{ kind: "scene", idStoryScene, idSceneElement: link.idSceneElement }}
        onSaved={({ item }: { item: SceneItem }) => onSavedInScene(item)}
        onCancel={onCancel}
        submitLabel="Save element"
      />
    );
  }
  return (
    <RunElementForm
      idStory={idStory}
      initial={initial}
      target={{ kind: "story", idElement }}
      onSaved={({ element: saved }: { element: ElementDetail }) => onSavedInStory(saved)}
      onCancel={onCancel}
      submitLabel="Save element"
    />
  );
}
