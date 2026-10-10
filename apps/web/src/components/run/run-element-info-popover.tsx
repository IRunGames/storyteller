"use client";

import { useId, useState, type ReactNode } from "react";
import {
  DataList,
  Field,
  Heading,
  HStack,
  IconButton,
  NativeSelect,
  Popover,
  Portal,
  Separator,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { Info, Pencil } from "lucide-react";
import { ELEMENT_KIND_LABELS, isElementKind } from "@/lib/elements";
import type { PlayItem, SceneElementDetail } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import {
  sa_getSceneElementDetail,
  sa_moveSceneElement,
  sa_updateSceneElement,
} from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { RunElementForm } from "./run-element-form";
import { sa_listStatusOptions } from "@/components/status/actions";
import { StatusPill } from "@/components/status/status-pill";
import { LocalDate } from "@/components/dates/local-date";

type Props = {
  idStory: number;
  idStoryScene: number;
  idElement: number;
  /** What the pill calls the element, to name the button. */
  label: string;
  /** The scene element's status has been moved from here, for the play space's pill. */
  onSceneStatusChange: (status: string) => void;
  /** The element has been edited or moved from here, as the play space's pill now shows it. */
  onItemChange: (item: PlayItem) => void;
  /** The tag of the stack the pill is in, which Move to takes it out of; null for Default. */
  stackTag: string | null;
  /** The scene's other stacks, which Move to offers. */
  otherStacks: string[];
};

/** What the popover shows once it has loaded: the detail and both workflows. */
type Loaded = {
  detail: SceneElementDetail;
  elementOptions: StatusOption[];
  sceneOptions: StatusOption[];
};

/**
 * A pill's info button: a popover with everything about the element, as the
 * story holds it, and about its link to this scene. Fetched each time it
 * opens (sa_getSceneElementDetail), so it shows what is stored now, the eye's
 * last press included, rather than what the page loaded with.
 *
 * Both statuses are the storyteller's to move here, as StatusPills: how the
 * element stands in this scene beside its name in the heading, since that is
 * what the table is about and what the eye and the pill's styling show; then
 * how it stands in the story, among the element's own rows. Moving the first
 * tells the play space, so the pill's eye and styling keep up.
 *
 * The pencil at the heading's far end swaps the detail for RunElementForm,
 * the form a stack's + makes elements with, filled in; saving it
 * (sa_updateSceneElement) hands the play space the pill as it now is and
 * goes back to the detail, loaded again.
 *
 * Below a rule at the bottom, Move to lists the scene's other stacks and
 * moves the element to the one chosen (sa_moveSceneElement).
 */
export function RunElementInfoPopover({
  idStory,
  idStoryScene,
  idElement,
  label,
  onSceneStatusChange,
  onItemChange,
  stackTag,
  otherStacks,
}: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  // undefined while loading, null when there is nothing to show.
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const detail = loaded?.detail;
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);

  // Move to: the pill leaves this stack for the one chosen, which redraws it
  // there and so closes this popover with it.
  async function moveTo(tag: string) {
    if (!tag) return;
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

  async function load() {
    setLoaded(undefined);
    try {
      const [found, elementOptions, sceneOptions] = await Promise.all([
        sa_getSceneElementDetail(idStory, idStoryScene, idElement),
        sa_listStatusOptions("elements"),
        sa_listStatusOptions("scene_elements"),
      ]);
      setLoaded(found ? { detail: found, elementOptions, sceneOptions } : null);
    } catch {
      setLoaded(null);
    }
  }

  return (
    // Not lazyMount: zag only links the dialog to its Popover.Title when the
    // title is in the page as the machine starts (attachment-tags-popover.tsx).
    <Popover.Root
      ids={{ trigger: triggerId }}
      positioning={{ placement: "bottom-end" }}
      onOpenChange={(details) => {
        // Each opening starts on the detail, not a form left half done.
        setEditing(false);
        if (details.open) void load();
      }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton aria-label={`About ${label}`} size="xs" variant="ghost" rounded="full">
              <Info />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>About {label}</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="sm" maxH="70vh" overflowY="auto">
            <Popover.Arrow />
            <Popover.Header>
              <HStack justify="space-between" gap="2">
                {/* The scene status beside the name: how the element stands
                    in this scene is what the table is about. The form has a
                    pill of its own, so this one stands aside while editing. */}
                <HStack gap="2" minW="0" wrap="wrap">
                  <Popover.Title fontWeight="semibold">
                    {editing
                      ? `Edit ${detail?.element.name ?? label}`
                      : (detail?.element.name ?? label)}
                  </Popover.Title>
                  {loaded && !editing && (
                    <StatusPill
                      table="scene_elements"
                      id={loaded.detail.link.idSceneElement}
                      status={loaded.detail.link.status}
                      options={loaded.sceneOptions}
                      canEdit
                      onChanged={(status) => {
                        setLoaded((current) =>
                          current
                            ? {
                                ...current,
                                detail: {
                                  ...current.detail,
                                  link: { ...current.detail.link, status },
                                },
                              }
                            : current,
                        );
                        onSceneStatusChange(status);
                      }}
                    />
                  )}
                </HStack>
                {detail && !editing && (
                  <PrepIconButton
                    label={`Edit ${detail.element.name}`}
                    onClick={() => setEditing(true)}
                  >
                    <Pencil />
                  </PrepIconButton>
                )}
              </HStack>
            </Popover.Header>
            <Popover.Body>
              {detail && editing ? (
                <RunElementForm
                  initial={{
                    kind: isElementKind(detail.element.kind) ? detail.element.kind : "OTHER",
                    name: detail.element.name,
                    initialName: detail.element.initialName ?? "",
                    title: detail.element.title ?? "",
                    description: detail.element.description ?? "",
                    notes: detail.element.notes ?? "",
                    status: detail.element.status,
                    sceneStatus: detail.link.status,
                  }}
                  save={(values) => sa_updateSceneElement(idStory, idStoryScene, idElement, values)}
                  onSaved={(item) => {
                    onItemChange(item);
                    setEditing(false);
                    void load();
                  }}
                  onCancel={() => setEditing(false)}
                  submitLabel="Save element"
                />
              ) : loaded === undefined ? (
                <Text color="fg.muted">Loading…</Text>
              ) : loaded === null ? (
                <Text color="fg.muted">This element is no longer in the scene.</Text>
              ) : (
                <Stack gap="4">
                  <ElementDetail
                    loaded={loaded}
                    // Kept in the loaded detail, so the pencil's form starts
                    // from the status the pill has just moved to rather than
                    // the one the popover opened with, and saving does not
                    // put the old one back.
                    onElementStatusChange={(status) =>
                      setLoaded((current) =>
                        current
                          ? {
                              ...current,
                              detail: {
                                ...current.detail,
                                element: { ...current.detail.element, status },
                              },
                            }
                          : current,
                      )
                    }
                  />
                  {otherStacks.length > 0 && (
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
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

function ElementDetail({
  loaded: {
    detail: { element, link },
    elementOptions,
  },
  onElementStatusChange,
}: {
  loaded: Loaded;
  onElementStatusChange: (status: string) => void;
}) {
  const tags = (list: string[]) => (list.length > 0 ? list.join(", ") : null);
  // Name, title, description and notes are always listed, a dash for an
  // empty one, so the storyteller sees what is still to write; the rest
  // only when there is something to say.
  const always = (value: string | null): ReactNode =>
    value ? (
      value
    ) : (
      <Text as="span" color="fg.subtle">
        —
      </Text>
    );
  const elementRows: [string, ReactNode][] = [
    // The initial name leads: it is what the players know the element as,
    // and what its pill in the play space shows.
    ["Initial name", element.initialName],
    ["Name", always(element.name)],
    ["Kind", isElementKind(element.kind) ? ELEMENT_KIND_LABELS[element.kind] : element.kind],
    ["Title", always(element.title)],
    [
      "Status",
      <StatusPill
        key="status"
        table="elements"
        id={element.idElement}
        status={element.status}
        options={elementOptions}
        canEdit
        onChanged={onElementStatusChange}
      />,
    ],
    ["Tags", tags(element.tags)],
    ["Description", always(element.description)],
    ["Notes", always(element.notes)],
  ];
  const linkRows: [string, ReactNode][] = [
    ["Tags", tags(link.tags)],
    ["Added", link.createdAt ? <LocalDate value={new Date(link.createdAt)} withTime /> : null],
  ];

  return (
    <Stack gap="4">
      {/* The element's own rows need no heading: the popover is about it. */}
      <DetailSection rows={elementRows} />
      <DetailSection title="In this scene" rows={linkRows} />
    </Stack>
  );
}

/** Label / value rows under an optional heading; a row with nothing to say is left out. */
function DetailSection({ title, rows }: { title?: string; rows: [string, ReactNode][] }) {
  return (
    <Stack gap="2">
      {title && (
        <Heading as="h3" size="xs" color="fg.muted">
          {title}
        </Heading>
      )}
      <DataList.Root orientation="horizontal" size="sm" gap="2">
        {rows
          .filter(([, value]) => value !== null && value !== "")
          .map(([name, value]) => (
            <DataList.Item key={name} alignItems="flex-start">
              <DataList.ItemLabel minW="24">{name}</DataList.ItemLabel>
              {/* pre-wrap, so a description's or notes' own line breaks show. */}
              <DataList.ItemValue whiteSpace="pre-wrap" alignItems="center">
                {value}
              </DataList.ItemValue>
            </DataList.Item>
          ))}
      </DataList.Root>
    </Stack>
  );
}
