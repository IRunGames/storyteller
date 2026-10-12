"use client";

import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  CloseButton,
  Dialog,
  Field,
  HStack,
  Input,
  List,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { stackNameSchema, stacksSchema, type StackRename } from "@/lib/stack-schemas";
import { sa_setSceneStacks } from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";

type Props = {
  idStory: number;
  idStoryScene: number;
  /** The scene's stacks as the dialog opens. */
  tags: string[];
  open: boolean;
  onClose: () => void;
  /** The scene's stacks as saved. */
  /** The scene's stacks as saved, and the ones renamed, so the play space can follow. */
  onSaved: (tags: string[], renames: StackRename[]) => void;
};

/**
 * Manage stacks, from the library footer's gear: the scene's stacks as a
 * list to add to, take from and put in order, saved together
 * (sa_setSceneStacks) rather than one change at a time, so Cancel leaves the
 * scene as it was. Saved for this scene alone unless the checkbox also makes
 * them the story's default stacks, which scenes made afterwards start with.
 */
export function RunManageStacksDialog({
  idStory,
  idStoryScene,
  tags,
  open,
  onClose,
  onSaved,
}: Props) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      size="sm"
      scrollBehavior="inside"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Manage stacks</Dialog.Title>
            </Dialog.Header>
            {/* Only drawn while open, so each opening starts from the
                scene's stacks as they are now. */}
            {open && (
              <ManageStacks
                idStory={idStory}
                idStoryScene={idStoryScene}
                tags={tags}
                onClose={onClose}
                onSaved={onSaved}
              />
            )}
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

/** One row of the list: the name it had as the dialog opened (null for one added here) and its name now. */
type Row = { id: number; was: string | null; name: string };

function ManageStacks({ idStory, idStoryScene, tags, onClose, onSaved }: Omit<Props, "open">) {
  // Rows are keyed by an id of their own, since the name is being edited.
  const nextId = useRef(tags.length);
  const [list, setList] = useState<Row[]>(() =>
    tags.map((tag, index) => ({ id: index, was: tag, name: tag })),
  );
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveForStory, setSaveForStory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Adding checks the one name at once, against the list as it stands, so a
  // clash is said beside the field rather than only when the list is saved.
  function addStack() {
    const parsed = stackNameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0].message);
      return;
    }
    const checked = stacksSchema.safeParse([...list.map((row) => row.name.trim()), parsed.data]);
    if (!checked.success) {
      setNameError(checked.error.issues[0].message);
      return;
    }
    setList([...list, { id: nextId.current++, was: null, name: parsed.data }]);
    setName("");
    setNameError(null);
  }

  function move(index: number, by: -1 | 1) {
    setList((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  }

  async function save() {
    const names = list.map((row) => row.name.trim());
    // Checked here as well as on the server, so an edited name that clashes
    // or is left empty is said before anything is sent.
    const checked = stacksSchema.safeParse(names);
    if (!checked.success) {
      setError(checked.error.issues[0].message);
      return;
    }
    const renames = list
      .filter((row) => row.was !== null && row.was !== row.name.trim())
      .map((row) => ({ from: row.was!, to: row.name.trim() }));
    setSaving(true);
    setError(null);
    try {
      const result = await sa_setSceneStacks(idStory, idStoryScene, {
        tags: names,
        renames,
        saveForStory,
      });
      if (result.ok) {
        onSaved(result.tags, renames);
        toaster.create({
          title: saveForStory ? "Stacks saved for this scene and the story" : "Stacks saved",
          type: "success",
        });
        onClose();
        return;
      }
      setError(Object.values(result.errors)[0]);
    } catch {
      setError("The stacks could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog.Body>
        <Stack gap="4">
          {error && (
            <Alert.Root status="error">
              <Alert.Indicator />
              <Alert.Title>{error}</Alert.Title>
            </Alert.Root>
          )}
          {list.length === 0 ? (
            <Text color="fg.muted">
              No stacks: the scene shows everything in one Default stack.
            </Text>
          ) : (
            <List.Root gap="1" listStyleType="none" aria-label="Stacks">
              {list.map((row, index) => {
                // Named in the buttons as it was when the dialog opened, so a
                // half-typed rename does not rename them as it goes.
                const tag = row.was ?? (row.name || "the new stack");
                return (
                  <List.Item key={row.id}>
                    <HStack gap="1">
                      {/* The name itself is the field: edit it in place, and
                        Save renames the stack and the elements filed under it. */}
                      <Input
                        size="sm"
                        flex="1"
                        minW="0"
                        maxLength={40}
                        aria-label={`Name of ${tag}`}
                        value={row.name}
                        onChange={(event) => {
                          const value = event.target.value;
                          setList((current) =>
                            current.map((each) =>
                              each.id === row.id ? { ...each, name: value } : each,
                            ),
                          );
                          setError(null);
                        }}
                      />
                      {/* At either end the button that would go past it is
                        left out rather than disabled, so the row's buttons
                        never point nowhere. */}
                      {index > 0 && (
                        <PrepIconButton label={`Move ${tag} up`} onClick={() => move(index, -1)}>
                          <ArrowUp />
                        </PrepIconButton>
                      )}
                      {index < list.length - 1 && (
                        <PrepIconButton label={`Move ${tag} down`} onClick={() => move(index, 1)}>
                          <ArrowDown />
                        </PrepIconButton>
                      )}
                      <PrepIconButton
                        label={`Remove ${tag}`}
                        onClick={() =>
                          setList((current) => current.filter((each) => each.id !== row.id))
                        }
                      >
                        <X />
                      </PrepIconButton>
                    </HStack>
                  </List.Item>
                );
              })}
            </List.Root>
          )}
          <Field.Root invalid={nameError !== null}>
            <Field.Label>New stack</Field.Label>
            <HStack gap="2" w="full">
              <Input
                size="sm"
                maxLength={40}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
                onKeyDown={(event) => {
                  // Enter adds the name rather than saving the whole list.
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addStack();
                  }
                }}
              />
              <Button size="sm" variant="outline" onClick={addStack}>
                <Plus />
                Add
              </Button>
            </HStack>
            <Field.ErrorText>{nameError}</Field.ErrorText>
          </Field.Root>
          <Checkbox.Root
            checked={saveForStory}
            onCheckedChange={(details) => setSaveForStory(details.checked === true)}
            size="sm"
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>Also save as the story&apos;s default stacks</Checkbox.Label>
          </Checkbox.Root>
        </Stack>
      </Dialog.Body>
      <Dialog.Footer>
        <HStack gap="2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </HStack>
      </Dialog.Footer>
    </>
  );
}
