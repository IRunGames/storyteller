"use client";

import { useId, useState, type ReactNode } from "react";
import {
  Alert,
  Button,
  HStack,
  IconButton,
  Popover,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { Trash2 } from "lucide-react";
import { toaster } from "@/components/ui/toaster";

/** What the caller answered: a refusal stays in the popover; nothing means it went. */
export type DeleteOutcome = { ok: true } | { ok: false; error: string } | void;

type Props = {
  /** What is going, as the question and the toast name it: "The vault", "PalmDave". */
  thing: string;
  /** The trigger's accessible name and tooltip ("Delete scene"); a full button's text too. */
  label: string;
  /** An icon button by default, as on a row or a card; a full outlined button on a page. */
  trigger?: "icon" | "button";
  /** The icon in the trigger, a trashcan unless the thing is not deleted so much as removed. */
  icon?: ReactNode;
  /** The icon button's size; 2xs beside a line of text, and compact smaller still in a tight list. */
  size?: "xs" | "2xs";
  /**
   * The icon button's look: ghost on a row or a card, where the trashcan is
   * one of several; outline where it stands alone, by a page's heading, so
   * its circle shows before the pointer reaches it.
   */
  variant?: "ghost" | "outline";
  compact?: boolean;
  /** "Delete", or "Remove" where the thing lives on: heads the question and the confirm. */
  verb?: string;
  /** The confirm button's text when it should read harder than the verb ("Delete anyway"). */
  confirmText?: string;
  /** A line in medium weight above the consequences, for a case that deserves a second look. */
  warning?: ReactNode;
  /** The consequences; without one, the standard line that the thing goes and cannot come back. */
  children?: ReactNode;
  /**
   * Does it: the caller's action, or a plain callback where the form itself
   * holds the thing. The popover closes on ok and shows a refusal inline.
   */
  onDelete: () => DeleteOutcome | Promise<DeleteOutcome>;
  /** Called once it is gone, so a list can drop it. */
  onDeleted?: () => void;
  /**
   * The success toast; "{thing} has been deleted." unless said otherwise,
   * and null for none, where the removal is only in a form until it is
   * saved.
   */
  done?: string | null;
  /** The inline line when the call throws; "{thing} could not be deleted. Try again." unless said. */
  failed?: string;
};

/**
 * A delete button and the popover that asks first, for every place something
 * is taken away for good: a scene card's trashcan, an element page's, an
 * invitation row's, a session's, an attachment card's, a system row's. One
 * shape so the question, the Cancel and Delete pair, the inline refusal and
 * the success toast read the same everywhere; the caller supplies the words
 * that differ and the action that does it. A popover rather than a dialog:
 * the question stays beside the control that asked it, and the page behind
 * stays where it was. A refusal stays in the popover as an inline alert so
 * it can be read and retried; success is a toast, because by then the
 * popover has closed. Cancel at the start and the action at the end, as the
 * forms lay them out.
 */
export function DeleteButton({
  thing,
  label,
  trigger = "icon",
  icon = <Trash2 />,
  size = "xs",
  variant = "ghost",
  compact = false,
  verb = "Delete",
  confirmText = verb,
  warning,
  children,
  onDelete,
  onDeleted,
  done = `${thing} has been deleted.`,
  failed = `${thing} could not be deleted. Try again.`,
}: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await onDelete();
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onDeleted?.();
      if (done !== null) toaster.create({ title: done, type: "success" });
    } catch {
      setError(failed);
    } finally {
      setBusy(false);
    }
  }

  const button =
    trigger === "button" ? (
      <Button type="button" variant="outline" colorPalette="red">
        {icon}
        {label}
      </Button>
    ) : (
      <IconButton
        type="button"
        aria-label={label}
        variant={variant}
        size={size}
        rounded="full"
        boxSize={compact ? "5" : undefined}
        minW={compact ? "5" : undefined}
        _icon={compact ? { boxSize: "3" } : undefined}
      >
        {icon}
      </IconButton>
    );

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);
        if (!details.open) setError(null);
      }}
      ids={{ trigger: triggerId }}
      positioning={{ placement: "top-end" }}
    >
      {trigger === "button" ? (
        <Popover.Trigger asChild>{button}</Popover.Trigger>
      ) : (
        <Tooltip.Root
          openDelay={200}
          positioning={{ placement: "top" }}
          ids={{ trigger: triggerId }}
        >
          <Tooltip.Trigger asChild>
            <Popover.Trigger asChild>{button}</Popover.Trigger>
          </Tooltip.Trigger>
          <Portal>
            <Tooltip.Positioner>
              <Tooltip.Content>{label}</Tooltip.Content>
            </Tooltip.Positioner>
          </Portal>
        </Tooltip.Root>
      )}
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="sm">
            <Popover.Arrow />
            <Popover.Header fontWeight="semibold">
              <Popover.Title>
                {verb} {thing}?
              </Popover.Title>
            </Popover.Header>
            <Popover.Body>
              <Stack gap="3">
                {warning && (
                  <Text fontSize="sm" fontWeight="medium">
                    {warning}
                  </Text>
                )}
                <Text fontSize="sm">
                  {children ?? `${thing} will be deleted. This cannot be undone.`}
                </Text>
                {error && (
                  // role="alert", which Chakra's Alert does not set itself.
                  <Alert.Root role="alert" status="error" size="sm">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{error}</Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                )}
                <HStack justify="space-between" gap="2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    colorPalette="red"
                    loading={isBusy}
                    loadingText={`${verb.replace(/e$/, "")}ing`}
                    onClick={() => void confirm()}
                  >
                    {confirmText}
                  </Button>
                </HStack>
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
