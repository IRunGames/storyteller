"use client";

import { useId, useState } from "react";
import {
  Box,
  Button,
  Field,
  HStack,
  IconButton,
  Image,
  Popover,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { ImagePlus, Minus, Plus } from "lucide-react";
import type { Attachment } from "@/lib/attachments";
import type { ElementKind } from "@/lib/elements";
import { attachmentLabel, RUN_ADD_INVISIBLE, SCENE_ELEMENT_HIDDEN, type PlayItem } from "@/lib/run";
import { sa_createSceneElement } from "@/app/(app)/run/[id]/actions";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
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
  onCreated: (item: PlayItem) => void;
};

/**
 * A stack's + and an element tab's + in the library: a popover with a short
 * form for a new element, which is written into the story and linked to the
 * scene under the stack's tag (sa_createSceneElement). The form is
 * RunElementForm, the same one a pill's info popover edits with.
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
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  // The picture Add picture chose, sent with the form; cleared each opening.
  const [picture, setPicture] = useState<Attachment | null>(null);
  const label = `New element in ${title}`;
  const addInvisible = useUserPreferences().get<boolean>(RUN_ADD_INVISIBLE, false);

  return (
    // Not lazyMount: zag only links the dialog to its Popover.Title when the
    // title is in the page as the machine starts (attachment-tags-popover.tsx).
    <Popover.Root
      ids={{ trigger: triggerId }}
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);
        if (details.open) setPicture(null);
      }}
      positioning={{ placement: floating ? "top-end" : "bottom-start" }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            {floating ? (
              <IconButton aria-label={label} size="md" rounded="full" boxShadow="md">
                <Plus />
              </IconButton>
            ) : (
              <IconButton aria-label={label} size="xs" variant="ghost" rounded="full">
                <Plus />
              </IconButton>
            )}
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>{label}</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="md" maxH="80vh" overflowY="auto">
            <Popover.Arrow />
            <Popover.Header>
              <Popover.Title fontWeight="semibold">New element in {title}</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              {/* Only drawn while open, so each opening starts a blank form. */}
              {open && (
                <RunElementForm
                  initial={{
                    kind,
                    name: "",
                    initialName: "",
                    title: "",
                    description: "",
                    notes: "",
                    status: "",
                    // The library's Add as invisible switch sets where a new
                    // element starts in the scene; the pill can still change it.
                    sceneStatus: addInvisible ? SCENE_ELEMENT_HIDDEN : "",
                  }}
                  save={(values) =>
                    sa_createSceneElement(idStory, idStoryScene, tag, {
                      ...values,
                      idAttachment: picture?.idAttachment ?? null,
                    })
                  }
                  extra={
                    <NewElementPicture
                      idStory={idStory}
                      idStoryScene={idStoryScene}
                      picture={picture}
                      onChange={setPicture}
                    />
                  }
                  onSaved={({ item }) => {
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
 * The new element's picture, chosen before it exists: Add picture opens the
 * pill's picker in place, which only hands the choice back here, and the
 * form sends it with the fields. Once chosen it shows small, with a − to
 * choose again, as the info popover's Picture row does.
 */
function NewElementPicture({
  idStory,
  idStoryScene,
  picture,
  onChange,
}: {
  idStory: number;
  idStoryScene: number;
  picture: Attachment | null;
  onChange: (picture: Attachment | null) => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <Field.Root>
      <Field.Label>Picture (optional)</Field.Label>
      {picture?.url ? (
        <HStack gap="1">
          <Box boxSize="10" flexShrink="0" rounded="sm" overflow="hidden" bg="bg.muted">
            <Image src={picture.url} alt="" boxSize="10" objectFit="cover" />
          </Box>
          <Text fontSize="sm" flex="1" minW="0" truncate>
            {attachmentLabel(picture)}
          </Text>
          <PrepIconButton label="Remove picture" onClick={() => onChange(null)} outlined>
            <Minus />
          </PrepIconButton>
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
