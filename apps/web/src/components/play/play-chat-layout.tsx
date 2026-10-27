"use client";

import { ButtonGroup, IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { PictureInPicture2, Rows2, Rows3 } from "lucide-react";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";

/**
 * How the table chat is drawn, on the run and play tables alike:
 * - standard: the panel, each line under its sender's picture and name;
 * - compact: the panel, no pictures, everything smaller;
 * - overlay: no panel, a small box in the lower right to type in, and each
 *   new line shown briefly over the table.
 */
export const CHAT_LAYOUTS = ["standard", "compact", "overlay"] as const;
export type ChatLayout = (typeof CHAT_LAYOUTS)[number];

const CHAT_LAYOUT = "chat.layout";

const LABELS: Record<ChatLayout, string> = {
  standard: "Standard chat",
  compact: "Compact chat",
  overlay: "Overlay chat",
};

const ICONS: Record<ChatLayout, typeof Rows2> = {
  standard: Rows2,
  compact: Rows3,
  overlay: PictureInPicture2,
};

/** The viewer's chat layout, kept as a preference; anything unknown reads as standard. */
export function useChatLayout(): [ChatLayout, (layout: ChatLayout) => void] {
  const preferences = useUserPreferences();
  const stored = preferences.get(CHAT_LAYOUT);
  const layout = CHAT_LAYOUTS.find((value) => value === stored) ?? "standard";
  return [layout, (next) => void preferences.set(CHAT_LAYOUT, next)];
}

/**
 * The three layouts as a set of toggle buttons, one pressed: in the chat
 * panel's header, and beside the overlay's box.
 */
export function PlayChatLayoutPicker() {
  const [layout, setLayout] = useChatLayout();

  return (
    <ButtonGroup role="group" aria-label="Chat layout" size="2xs" variant="ghost" gap="0.5">
      {CHAT_LAYOUTS.map((value) => {
        const Icon = ICONS[value];
        const isOn = value === layout;
        return (
          <Tooltip.Root key={value} openDelay={200} positioning={{ placement: "top" }}>
            <Tooltip.Trigger asChild>
              <IconButton
                aria-label={LABELS[value]}
                aria-pressed={isOn}
                color={isOn ? "fg" : "fg.muted"}
                bg={isOn ? "bg.emphasized" : undefined}
                onClick={() => setLayout(value)}
              >
                <Icon />
              </IconButton>
            </Tooltip.Trigger>
            <Portal>
              <Tooltip.Positioner>
                <Tooltip.Content>{LABELS[value]}</Tooltip.Content>
              </Tooltip.Positioner>
            </Portal>
          </Tooltip.Root>
        );
      })}
    </ButtonGroup>
  );
}
