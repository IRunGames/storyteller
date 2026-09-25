import { useId, useState, type ReactNode } from "react";
import { Heading, HStack, Input, InputGroup, Spacer, Stack } from "@chakra-ui/react";
import { Maximize2, Minimize2, Plus, Search } from "lucide-react";
import type { PrepColumnMode } from "./prep-columns";
import { PrepIconButton } from "./prep-icon-button";

type Props = {
  title: string;
  /** What the + button makes: "session", "scene". */
  singular: string;
  /** Never "hidden": the board renders a button in the column's place instead. */
  mode: Exclude<PrepColumnMode, "hidden">;
  /** The column's width at its usual size. */
  width: string;
  /** False for a column that never expands, which then has no expand button. */
  expandable: boolean;
  /** False for a column whose rows are made elsewhere, which then has no + button. */
  creatable: boolean;
  /** False for the first visible column, which has nothing to its left. */
  bordered: boolean;
  onCreate: () => void;
  onExpand: () => void;
  /** Shrinks an expanded column, hides a normal one. */
  onContract: () => void;
  /**
   * The rows, given what the column's search box holds so they can filter
   * themselves. The column owns the query because the box is its own; what
   * the query means for a row is the board's business.
   */
  children: (query: string) => ReactNode;
};

// One column of the Prep Work board: the heading with its buttons, the
// search box under it, then whatever the board puts in it. The mode and the
// border are the board's decision, since both depend on the other columns;
// this only draws them.
export function PrepColumn({
  title,
  singular,
  mode,
  width,
  expandable,
  creatable,
  bordered,
  onCreate,
  onExpand,
  onContract,
  children,
}: Props) {
  const headingId = useId();
  const [query, setQuery] = useState("");

  return (
    <Stack
      as="section"
      aria-labelledby={headingId}
      data-column={title}
      data-mode={mode}
      data-bordered={bordered}
      gap="4"
      flex="none"
      // Two thirds of the viewport rather than of the board, as asked, and
      // with vw the width holds while the board scrolls sideways under it.
      w={mode === "expanded" ? "66.667vw" : width}
      px="4"
      // The boundary sits between columns, never before the first or after
      // the last, so it is a left border that the first visible column drops.
      borderLeftWidth={bordered ? "1px" : "0"}
      borderColor="border"
    >
      <HStack gap="1">
        <Heading id={headingId} size="lg" minW="0" truncate>
          {title}
        </Heading>
        {/* The + belongs to the title, since it adds to what the column
            holds; the layout buttons are about the column itself and keep
            to the far edge, so the two are not mistaken for each other. */}
        {creatable && (
          <PrepIconButton label={`New ${singular}`} onClick={onCreate}>
            <Plus />
          </PrepIconButton>
        )}
        <Spacer />
        {expandable && mode === "normal" && (
          <PrepIconButton label={`Expand ${title}`} onClick={onExpand}>
            <Maximize2 />
          </PrepIconButton>
        )}
        {/* One contract button does both, so a column never carries more
            buttons than it has moves: the way down from expanded is normal,
            and from normal it is out of the way entirely. */}
        <PrepIconButton
          label={mode === "expanded" ? `Shrink ${title}` : `Hide ${title}`}
          onClick={onContract}
        >
          <Minimize2 />
        </PrepIconButton>
      </HStack>
      <InputGroup startElement={<Search size={14} />}>
        <Input
          type="search"
          size="sm"
          aria-label={`Search ${title}`}
          placeholder={`Search ${title.toLowerCase()}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </InputGroup>
      {children(query)}
    </Stack>
  );
}
