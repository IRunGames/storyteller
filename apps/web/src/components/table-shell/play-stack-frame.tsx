"use client";

import { useId, type ReactNode } from "react";
import { Heading, HStack, List, Stack } from "@chakra-ui/react";
import type { SceneItem } from "@/lib/scene-elements";
import { HALO, HALO_FILTER } from "./halo";

type Props = {
  /** The stack's title, its tag or Default, which names the section. */
  title: string;
  /**
   * How large the stack is drawn: at a table, 22rem wide (between Chakra's
   * xs and sm: a pill's eye, +, name, info and ✕ need a little more than xs
   * gave them) with a small heading; on the display table, read at a
   * distance, 30rem wide with a large one and more room between the pills.
   */
  size: "table" | "display";
  /** The stack is widened to the whole play space, its pills in columns. */
  wide: boolean;
  /**
   * The stack takes the width it is given rather than its own: a column of
   * the scene's edit page, where the stacks are one under another.
   */
  fullWidth?: boolean;
  /** After the heading on its line: the expand button, the + for a new element. */
  controls?: ReactNode;
  /** What an empty stack says; nothing when left out, as on the display table. */
  empty?: ReactNode;
  items: SceneItem[];
  /** One pill, drawn as the table draws it. */
  renderItem: (item: SceneItem) => ReactNode;
};

/**
 * The frame of one stack of a play space, the same on every table: a
 * section named by its heading, the heading in upper case with a halo over
 * the scene's cover (halo.ts) and whatever controls sit after it on its
 * line, then the pills as a list. The stack has no background of its own,
 * so the cover shows through around it. Widened, the pills fill the width
 * in columns of about twice the stack's size, so each pill widens; only a
 * very wide play space has two side by side.
 */
export function PlayStackFrame({
  title,
  size,
  wide,
  fullWidth = false,
  controls,
  empty,
  items,
  renderItem,
}: Props) {
  const headingId = useId();
  const atTable = size === "table";
  // Padded, since truncate's overflow clip would cut the halo off at the
  // heading's own edges. Upper case by CSS only, so the tag keeps its own
  // spelling for a screen reader and the tests.
  const heading = (
    <Heading
      id={headingId}
      as={atTable ? undefined : "h2"}
      size={atTable ? "xs" : undefined}
      textStyle={atTable ? undefined : "xl"}
      truncate
      textShadow={HALO}
      textTransform="uppercase"
      letterSpacing="wider"
      px="2"
      py={atTable ? "1" : undefined}
    >
      {title}
    </Heading>
  );

  return (
    <Stack
      as="section"
      aria-labelledby={headingId}
      gap={atTable ? "2" : "3"}
      w={fullWidth || wide ? "full" : { base: "full", md: atTable ? "22rem" : "30rem" }}
      flexShrink="0"
      data-wide={wide ? "true" : undefined}
    >
      {atTable ? (
        // The controls' icons get the halo too, as a filter.
        <HStack justify="space-between" gap="2" css={{ "& svg": { filter: HALO_FILTER } }}>
          {heading}
          {controls}
        </HStack>
      ) : (
        heading
      )}
      {items.length === 0 ? (
        empty
      ) : (
        <List.Root
          listStyleType="none"
          gap={atTable ? "2" : "3"}
          display={wide ? "grid" : undefined}
          gridTemplateColumns={wide ? "repeat(auto-fill, minmax(40rem, 1fr))" : undefined}
        >
          {items.map((item) => (
            <List.Item key={item.key}>{renderItem(item)}</List.Item>
          ))}
        </List.Root>
      )}
    </Stack>
  );
}
