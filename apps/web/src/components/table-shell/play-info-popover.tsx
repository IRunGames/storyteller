"use client";

import { Stack, Text } from "@chakra-ui/react";
import { ElementHistory } from "@/components/elements/element-history";
import { InfoPopoverShell } from "@/components/popovers/info-popover-shell";
import { PlayElementNotesField } from "@/components/play/play-element-notes-field";

/**
 * The players' pill's info button (PlayPill): a popover (InfoPopoverShell)
 * with what the storyteller lets the players know of the element, under the
 * name the pill shows. The display table's pill (PassivePill) offers it too,
 * to someone with an account, which is why it sits here with the other
 * pieces the tables share rather than in either pill's file. The title and
 * the description, each only when the
 * element has one, and then the players' notes field. The shell draws the
 * body afresh each opening, so the field starts from the notes as the table
 * holds them now. Read only, the notes are shown as they are, when there
 * are any.
 */
export function PlayInfoPopover({
  label,
  title,
  info,
  idStory,
  idElement,
  notes,
  onNotesChange,
  readOnly,
  history,
}: {
  label: string;
  title: string | null;
  info: string | null | undefined;
  idStory: number;
  idElement: number;
  notes: string | null;
  onNotesChange: (idElement: number, notes: string | null) => void;
  readOnly: boolean;
  /** Given, the popover ends with the element's History, less the scene named. */
  history: { idStoryScene: number } | null;
}) {
  return (
    <InfoPopoverShell
      label={`About ${label}`}
      heading={label}
      subheading={
        title && (
          <Text fontSize="sm" color="fg.muted">
            {title}
          </Text>
        )
      }
    >
      {() => (
        <Stack gap="3">
          {info ? (
            <Text whiteSpace="pre-wrap">{info}</Text>
          ) : (
            <Text color="fg.muted">Nothing more is known yet.</Text>
          )}
          {readOnly ? (
            notes && (
              <Stack gap="1">
                <Text fontSize="sm" fontWeight="medium">
                  Notes
                </Text>
                <Text whiteSpace="pre-wrap">{notes}</Text>
              </Stack>
            )
          ) : (
            <PlayElementNotesField
              idStory={idStory}
              idElement={idElement}
              notes={notes}
              onSaved={(saved) => onNotesChange(idElement, saved)}
            />
          )}
          {history && (
            <ElementHistory
              idStory={idStory}
              idElement={idElement}
              idStoryScene={history.idStoryScene}
            />
          )}
        </Stack>
      )}
    </InfoPopoverShell>
  );
}
