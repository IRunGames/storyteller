"use client";

import { useEffect, useState } from "react";
import { Alert, CloseButton, Dialog, Portal, Skeleton, Stack } from "@chakra-ui/react";
import { ELEMENT_KIND_LABELS, type ElementKind } from "@/lib/elements";
import type { SceneSessionOption } from "@/lib/scenes";
import { sa_listSceneSessionOptions } from "@/app/(app)/(nav)/libraries/actions";
import { ElementForm } from "./element-form";
import { SceneForm } from "./scene-form";

/** What the board's dialog is creating: a scene, or an element of a kind. */
export type PrepCreating = { type: "scene" } | { type: "element"; kind: ElementKind };

type Props = {
  idStory: number;
  /** What to create, or null while the dialog is shut. */
  creating: PrepCreating | null;
  onClose: () => void;
  /** A scene was created. */
  onSceneCreated: () => void;
  /** An element was created, of this kind, which may not be the one it opened as. */
  onElementCreated: (kind: ElementKind) => void;
};

/**
 * The dialog the board's + buttons open, so a scene or an element is written
 * without leaving the board and its columns as they were left. The board
 * owns what it is creating; the dialog holds the form and says what it is.
 */
export function PrepCreateDialog({
  idStory,
  creating,
  onClose,
  onSceneCreated,
  onElementCreated,
}: Props) {
  const title =
    creating === null
      ? ""
      : creating.type === "scene"
        ? "New scene"
        : `New ${ELEMENT_KIND_LABELS[creating.kind].toLowerCase()}`;

  return (
    <Dialog.Root
      open={creating !== null}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      size="md"
      scrollBehavior="inside"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body pb="6">
              {creating?.type === "scene" && (
                <NewScene idStory={idStory} onCreated={onSceneCreated} onCancel={onClose} />
              )}
              {creating?.type === "element" && (
                <ElementForm
                  idStory={idStory}
                  kind={creating.kind}
                  onCreated={onElementCreated}
                  onCancel={onClose}
                />
              )}
            </Dialog.Body>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

/**
 * The New scene form, once the story's sittings are in for its select. They
 * are fetched as the dialog opens rather than with the board: the Timeline
 * only holds its first page, and the select wants every sitting.
 */
function NewScene({
  idStory,
  onCreated,
  onCancel,
}: {
  idStory: number;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [sessions, setSessions] = useState<SceneSessionOption[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let current = true;
    sa_listSceneSessionOptions(idStory).then(
      (found) => current && setSessions(found),
      () => current && setError(true),
    );
    return () => {
      current = false;
    };
  }, [idStory]);

  if (error) {
    return (
      <Alert.Root role="alert" status="error" size="sm">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>Could not load the story&apos;s sessions.</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }
  if (sessions === null) {
    return (
      <Stack gap="3">
        <Skeleton h="10" />
        <Skeleton h="24" />
        <Skeleton h="10" />
      </Stack>
    );
  }
  return (
    <SceneForm idStory={idStory} sessions={sessions} onCreated={onCreated} onCancel={onCancel} />
  );
}
