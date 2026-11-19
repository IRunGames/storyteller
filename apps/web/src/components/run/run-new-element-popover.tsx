"use client";

import { useId, useState } from "react";
import { Box, Button, Field, HStack, Image, Popover, Portal, Stack, Text } from "@chakra-ui/react";
import { ImagePlus, Minus, Plus } from "lucide-react";
import type { Attachment } from "@/lib/attachments";
import type { ElementKind } from "@/lib/elements";
import { attachmentLabel } from "@/lib/run";
import { RUN_ADD_INVISIBLE, RUN_ADD_SHOW_INFO } from "@/lib/preference-keys";
import { SCENE_ELEMENT_HIDDEN, type SceneItem } from "@/lib/scene-elements";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { RunElementForm } from "./run-element-form";
import { RunElementImagePicker } from "./run-element-image-popover";

type Props = {
  idStory: number;
  idStoryScene: number;
  /**
   * The stack's tag, which the new element is filed under. Null for the
   * Default stack, and from the library, where the action files it under
   * the scene's first tag, if it has one.
   */
  tag: string | null;
  /** Where it goes, for the button's label and the popover's title: "New element in <title>". */
  title: string;
  /** The kind the form starts on: the library tab's. People when left out. */
  kind?: ElementKind;
  /**
   * The library's look: a solid round button floating at the foot of its
   * tab, with the popover opening above it. A stack's + is a small ghost one
   * beside its heading.
   */
  floating?: boolean;
  /** The new element, linked to the scene, for the play space to show. */
  onCreated: (item: SceneItem) => void;
};

/**
 * A stack's + and an element tab's + in the library: a popover with a short
 * form for a new element, which is written into the story and linked to the
 * scene under the stack's tag (sa_createSceneElement, through the form's
 * create target). The form is RunElementForm, the same one a pill's info
 * popover edits with.
 */
export function RunNewElementPopover({
  idStory,
  idStoryScene,
  tag,
  title,
  kind = "PERSON",
  floating = false,
  onCreated,
}: Props) {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  // The pictures the two Add picture buttons chose, sent with the form and
  // cleared each opening: the element's own, and the link's for this scene,
  // which the pill shows over the element's while it is in this scene.
  const [picture, setPicture] = useState<Attachment | null>(null);
  const [scenePicture, setScenePicture] = useState<Attachment | null>(null);
  const label = `New element in ${title}`;
  // The library's switches: where a new element starts in the scene, and
  // whether the players see its description.
  const preferences = useUserPreferences();
  const addInvisible = preferences.get<boolean>(RUN_ADD_INVISIBLE, false);
  const addShowInfo = preferences.get<boolean>(RUN_ADD_SHOW_INFO, false);

  return (
    // Not lazyMount: zag only links the dialog to its Popover.Title when the
    // title is in the page as the machine starts (attachment-tags-popover.tsx).
    <Popover.Root
      ids={{ trigger: triggerId }}
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);
        if (details.open) {
          setPicture(null);
          setScenePicture(null);
        }
      }}
      positioning={{ placement: floating ? "top-end" : "bottom-start" }}
    >
      {floating ? (
        <IconButtonWithTooltip
          label={label}
          size="md"
          variant="solid"
          boxShadow="md"
          popoverTrigger={triggerId}
        >
          <Plus />
        </IconButtonWithTooltip>
      ) : (
        <IconButtonWithTooltip label={label} popoverTrigger={triggerId}>
          <Plus />
        </IconButtonWithTooltip>
      )}
      <Portal>
        <Popover.Positioner>
          {/* Lightly see-through, so the play space shows through the
              form while the scene's own box inside it stays solid. */}
          <Popover.Content w="md" maxH="80vh" overflowY="auto" bg="bg.panel/90">
            <Popover.Arrow />
            <Popover.Header>
              <Popover.Title fontWeight="semibold">New element in {title}</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              {/* Only drawn while open, so each opening starts a blank form. */}
              {open && (
                <RunElementForm
                  idStory={idStory}
                  initial={{
                    kind,
                    name: "",
                    initialName: "",
                    title: "",
                    description: "",
                    notes: "",
                    url: "",
                    urlText: "",
                    status: "",
                    // The library's Add as invisible switch sets where a new
                    // element starts in the scene; the pill can still change it.
                    sceneStatus: addInvisible ? SCENE_ELEMENT_HIDDEN : "",
                    sceneUrl: "",
                    sceneUrlText: "",
                    sceneLabel: "",
                  }}
                  target={{
                    kind: "create",
                    idStoryScene,
                    tag,
                    idAttachment: picture?.idAttachment ?? null,
                    idSceneAttachment: scenePicture?.idAttachment ?? null,
                    showInfo: addShowInfo,
                  }}
                  elementPicture={
                    <NewElementPicture
                      label="Picture (optional)"
                      idStory={idStory}
                      idStoryScene={idStoryScene}
                      picture={picture}
                      onChange={setPicture}
                    />
                  }
                  scenePicture={
                    <NewElementPicture
                      label="Picture in this scene (optional)"
                      idStory={idStory}
                      idStoryScene={idStoryScene}
                      picture={scenePicture}
                      onChange={setScenePicture}
                    />
                  }
                  onSaved={({ item }: { item: SceneItem }) => {
                    onCreated(item);
                    setOpen(false);
                  }}
                  onCancel={() => setOpen(false)}
                  submitLabel="Add element"
                />
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

/**
 * A picture for the new element, chosen before it exists: Add picture opens
 * the pill's picker in place, which only hands the choice back here, and
 * the form sends it with the fields. Once chosen it shows small, with a −
 * to choose again, as the info popover's Picture row does. Twice in the
 * form: the element's own picture, and the link's for this scene.
 */
function NewElementPicture({
  label,
  idStory,
  idStoryScene,
  picture,
  onChange,
}: {
  /** The field's name: which of the two pictures this is. */
  label: string;
  idStory: number;
  idStoryScene: number;
  picture: Attachment | null;
  onChange: (picture: Attachment | null) => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      {picture?.url ? (
        <HStack gap="1">
          <Box boxSize="10" flexShrink="0" rounded="sm" overflow="hidden" bg="bg.muted">
            <Image src={picture.url} alt="" boxSize="10" objectFit="cover" />
          </Box>
          <Text fontSize="sm" flex="1" minW="0" truncate>
            {attachmentLabel(picture)}
          </Text>
          <IconButtonWithTooltip label="Remove picture" onClick={() => onChange(null)} outlined>
            <Minus />
          </IconButtonWithTooltip>
        </HStack>
      ) : (
        <Stack gap="2" w="full">
          <Button
            size="xs"
            variant="outline"
            alignSelf="flex-start"
            aria-expanded={picking}
            onClick={() => setPicking((open) => !open)}
          >
            <ImagePlus />
            Add picture
          </Button>
          {picking && (
            <Box borderWidth="1px" rounded="md" p="2">
              <RunElementImagePicker
                idStory={idStory}
                idStoryScene={idStoryScene}
                onChosen={(chosen) => {
                  onChange(chosen);
                  setPicking(false);
                }}
              />
            </Box>
          )}
        </Stack>
      )}
    </Field.Root>
  );
}
