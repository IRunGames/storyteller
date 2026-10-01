import { useId, useState, type ReactNode } from "react";
import { Heading, HStack, Spacer, Stack, Text } from "@chakra-ui/react";
import { Maximize2, Minimize, Plus } from "lucide-react";
import type { StatusOption } from "@/lib/status";
import {
  allSelected,
  StatusSearch,
  type StatusSearchValue,
} from "@/components/status/status-search";
import type { PrepColumnMode } from "./prep-columns";
import { PrepIconButton } from "./prep-icon-button";

type Props = {
  title: string;
  /** What the + button makes: "session", "scene". */
  singular: string;
  /**
   * How many rows the column holds in all, shown beside the title. Null for a
   * column whose rows are still stand-ins, which has no count to give.
   */
  count?: number | null;
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
  /**
   * The workflow of the rows in this column, for the status pills above the
   * search box. A column whose rows have no statuses passes none and gets
   * only the box.
   */
  statusOptions?: StatusOption[];
  /** What the pills are called when they are not statuses; see StatusSearch. */
  filterLabel?: string;
  /**
   * For a column whose + opens a form in place rather than acting at once:
   * whether that form is showing. See PrepIconButton's expanded.
   */
  creating?: boolean;
  /**
   * Drawn between the heading and the filters: where a + that opens a form
   * in place puts it, so the form sits under the button that opened it
   * rather than below the search box.
   */
  aboveFilters?: ReactNode;
  onCreate: () => void;
  onExpand: () => void;
  /** Shrinks an expanded column, hides a normal one. */
  onContract: () => void;
  /**
   * The rows, given what the column is narrowed to — the words typed and the
   * statuses still switched on — so they can narrow themselves. The column
   * owns it because the box and the pills are its own; what it means for a
   * row is the board's business.
   */
  children: (filter: StatusSearchValue) => ReactNode;
};

// One column of the Prep Work board: the heading with its buttons, the
// search box under it, then whatever the board puts in it. The mode and the
// border are the board's decision, since both depend on the other columns;
// this only draws them.
export function PrepColumn({
  title,
  singular,
  count = null,
  mode,
  width,
  expandable,
  creatable,
  bordered,
  statusOptions,
  filterLabel,
  creating,
  aboveFilters,
  onCreate,
  onExpand,
  onContract,
  children,
}: Props) {
  const headingId = useId();
  const options = statusOptions ?? [];
  // Every status on to begin with, so the column opens showing everything.
  const [filter, setFilter] = useState<StatusSearchValue>(() => allSelected(options));

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
        {/* The count sits beside the heading rather than inside it, so the
            column's accessible name stays the plain title while the number
            changes underneath. */}
        {count !== null && (
          <Text color="fg.muted" fontSize="sm" flex="none" data-count={count}>
            ({count})
          </Text>
        )}
        {/* The + belongs to the title, since it adds to what the column
            holds; the layout buttons are about the column itself and keep
            to the far edge, so the two are not mistaken for each other. */}
        {creatable && (
          <PrepIconButton label={`New ${singular}`} onClick={onCreate} expanded={creating}>
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
          <Minimize />
        </PrepIconButton>
      </HStack>
      {aboveFilters}
      <StatusSearch
        label={title}
        options={options}
        value={filter}
        onChange={setFilter}
        groupLabel={filterLabel}
      />
      {children(filter)}
    </Stack>
  );
}
