"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Box,
  Grid,
  HStack,
  Input,
  Menu,
  Popover,
  SimpleGrid,
  Slider,
  Switch,
  Text,
  chakra,
} from "@chakra-ui/react";
import {
  BrickWall,
  Check,
  CheckLine,
  ChevronDown,
  Circle,
  Cloud,
  CloudFog,
  CloudOff,
  Eraser,
  Eye,
  EyeOff,
  Hexagon,
  PaintBucket,
  Paintbrush,
  PenLine,
  Pentagon,
  Pickaxe,
  RectangleHorizontal,
  Square,
  Trash2,
  Triangle,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import type { AnnotationMode, ShapeKind } from "@/lib/annotation-schemas";
import {
  BRUSH_SIZES,
  FOG_COLORS,
  OWN_FOG_SLIDER,
  PEN_COLORS,
  PEN_WIDTHS,
  PLAYERS_FOG_SLIDER,
} from "@/lib/annotations";
import type { AnnotationTool } from "./annotator-stage";
import type { SaveStatus } from "./use-annotation-session";

type Props = {
  tool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  shape: ShapeKind;
  onShapeChange: (shape: ShapeKind) => void;
  mode: AnnotationMode;
  onModeChange: (mode: AnnotationMode) => void;
  /** The brush's size and the pen's width as their sliders hold them (lib/annotations.ts). */
  brushSize: number;
  onBrushSizeChange: (value: number) => void;
  penWidth: number;
  onPenWidthChange: (value: number) => void;
  penColor: string;
  onPenColorChange: (color: string) => void;
  /** Whether the storyteller sees the fog over the picture; the players' copy has it either way. */
  fogShown: boolean;
  onFogShownChange: (shown: boolean) => void;
  /** The storyteller's own fog and the players', whole percentages. */
  ownFog: number;
  onOwnFogChange: (value: number) => void;
  playersFog: number;
  onPlayersFogChange: (value: number) => void;
  /** The fog's color, the drawing's own. */
  fogColor: string;
  onFogColorChange: (color: string) => void;
  onCoverAll: () => void;
  onClearAll: () => void;
  onEraseAll: () => void;
  /** Whether the wall pen is partway through a wall, which Finish wall then finishes. */
  wallInProgress: boolean;
  onFinishWall: () => void;
};

/** A choice's name, and its tooltip when that says more than the name. */
type Choice<T extends string> = { value: T; label: string; tooltip?: string; Icon: LucideIcon };

const SHAPES: Choice<ShapeKind>[] = [
  { value: "circle", label: "Circle", Icon: Circle },
  { value: "triangle", label: "Triangle", Icon: Triangle },
  { value: "square", label: "Square", Icon: Square },
  { value: "pentagon", label: "Pentagon", Icon: Pentagon },
  { value: "hexagon", label: "Hexagon", Icon: Hexagon },
];

const FOG_TOOLS: Choice<AnnotationTool>[] = [
  { value: "brush", label: "Fog brush", Icon: Paintbrush },
  { value: "rect", label: "Fog rectangle", Icon: RectangleHorizontal },
  {
    value: "flood",
    label: "Flood",
    tooltip: "Flood: reveal or cover the area clicked, up to its walls",
    Icon: PaintBucket,
  },
];

const WALL_TOOLS: Choice<AnnotationTool>[] = [
  {
    value: "wall",
    label: "Wall pen",
    tooltip: "Wall pen: click corner by corner, Escape to finish",
    Icon: BrickWall,
  },
  {
    value: "wallEraser",
    label: "Wall eraser",
    tooltip: "Wall eraser: drag over walls to take them away",
    Icon: Pickaxe,
  },
];

const MODES: Choice<AnnotationMode>[] = [
  { value: "reveal", label: "Reveal", Icon: Eye },
  { value: "cover", label: "Cover", Icon: CloudFog },
];

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Not saved yet",
};

/**
 * The annotator's toolbar, over the picture, in two halves. On the left the
 * annotations, drawn under the fog: the pen, the shape tool (a dropdown of
 * the shapes, each dragged out from its centre by a corner), the eraser, which takes away whole marks it is dragged over,
 * the pen's color and width, which the shapes take too, and Erase all
 * annotations. From the middle rightwards the fog: a switch for whether the
 * storyteller sees it at all, their own fog's opacity and the players', each
 * a slider from 50 to 100 and a percentage to type from 0 to 100, the fog's
 * color, Cover all, the fog brush, the fog rectangle and the flood with
 * Reveal or Cover, the brush's size, Clear all, and the walls' tools: the
 * wall pen and the wall eraser, which have no Reveal or Cover. While the wall
 * pen is partway through a wall, Finish wall follows them and does what
 * Escape does, for a touch screen that has no Escape. One tool is in hand at
 * a time, from either half. Undo and whether the drawing is saved sit in the
 * annotator's header (AnnotatorSaveState).
 *
 * Its controls sit in the annotator's dialog, which hides everything outside
 * itself, so their tooltips and the color popovers are drawn in place rather
 * than portalled (profile-color-popover.tsx says why). A slider reports its
 * value once it is let go, and a percentage once it is entered: each report
 * is saved, the players' fog with a new players' copy, so the drag or the
 * typing between is the control's own.
 */
export function AnnotatorToolbar(props: Props) {
  const { tool, mode } = props;
  const marking = tool === "pen" || tool === "shape";
  const fogging = tool === "brush" || tool === "rect" || tool === "flood";
  return (
    <Grid
      role="toolbar"
      aria-label="Annotation tools"
      templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))" }}
      columnGap="6"
      rowGap="2"
      px="4"
      py="2"
      borderBottomWidth="1px"
    >
      <HStack role="group" aria-label="Annotations" gap="3" rowGap="2" wrap="wrap">
        <HStack role="group" aria-label="Annotation tool" gap="0.5">
          <ToolButton
            label="Pen"
            pressed={tool === "pen"}
            onClick={() => props.onToolChange("pen")}
          >
            <PenLine />
          </ToolButton>
          <ShapeMenu
            shape={props.shape}
            inHand={tool === "shape"}
            onPick={(shape) => {
              props.onShapeChange(shape);
              props.onToolChange("shape");
            }}
          />
          <ToolButton
            label="Eraser"
            pressed={tool === "eraser"}
            onClick={() => props.onToolChange("eraser")}
          >
            <Eraser />
          </ToolButton>
        </HStack>
        {marking && (
          <>
            <ColorPopover
              label="Pen color"
              colors={PEN_COLORS}
              color={props.penColor}
              onChange={props.onPenColorChange}
            />
            <ToolbarSlider
              label="Width"
              value={props.penWidth}
              {...PEN_WIDTHS}
              onCommit={props.onPenWidthChange}
            />
          </>
        )}
        <IconButtonWithTooltip
          label="Erase all annotations"
          onClick={props.onEraseAll}
          portalled={false}
        >
          <Trash2 />
        </IconButtonWithTooltip>
      </HStack>

      <HStack role="group" aria-label="Fog" gap="3" rowGap="2" wrap="wrap">
        <FogSwitch shown={props.fogShown} onChange={props.onFogShownChange} />
        <ToolbarSlider
          label="My fog"
          value={props.ownFog}
          {...OWN_FOG_SLIDER}
          percent
          onCommit={props.onOwnFogChange}
        />
        <ToolbarSlider
          label="Players' fog"
          value={props.playersFog}
          {...PLAYERS_FOG_SLIDER}
          percent
          onCommit={props.onPlayersFogChange}
        />
        <ColorPopover
          label="Fog color"
          colors={FOG_COLORS}
          color={props.fogColor}
          onChange={props.onFogColorChange}
        />
        <IconButtonWithTooltip label="Cover all" onClick={props.onCoverAll} portalled={false}>
          <Cloud />
        </IconButtonWithTooltip>
        <Choices label="Fog tool" choices={FOG_TOOLS} value={tool} onChange={props.onToolChange} />
        {fogging && (
          <Choices label="Fog mode" choices={MODES} value={mode} onChange={props.onModeChange} />
        )}
        {tool === "brush" && (
          <ToolbarSlider
            label="Brush size"
            value={props.brushSize}
            {...BRUSH_SIZES}
            onCommit={props.onBrushSizeChange}
          />
        )}
        <IconButtonWithTooltip label="Clear all" onClick={props.onClearAll} portalled={false}>
          <CloudOff />
        </IconButtonWithTooltip>
        <Choices
          label="Wall tool"
          choices={WALL_TOOLS}
          value={tool}
          onChange={props.onToolChange}
        />
        {props.wallInProgress && (
          <IconButtonWithTooltip
            label="Finish wall"
            tooltip="Finish wall (Escape)"
            onClick={props.onFinishWall}
            portalled={false}
          >
            <CheckLine />
          </IconButtonWithTooltip>
        )}
      </HStack>
    </Grid>
  );
}

/** Undo (also Ctrl+Z) and whether the drawing is saved, for the annotator's header. */
export function AnnotatorSaveState({
  canUndo,
  onUndo,
  status,
}: {
  canUndo: boolean;
  onUndo: () => void;
  status: SaveStatus;
}) {
  return (
    <HStack gap="2">
      <Text role="status" fontSize="xs" color="fg.muted">
        {STATUS_TEXT[status]}
      </Text>
      <IconButtonWithTooltip
        label="Undo"
        tooltip="Undo (Ctrl+Z)"
        aria-disabled={!canUndo}
        onClick={() => canUndo && onUndo()}
        portalled={false}
      >
        <Undo2 />
      </IconButtonWithTooltip>
    </HStack>
  );
}

// The look of a control that is on: solid in the theme's accent, as an
// open panel's button is, so the tool in hand stands out at a glance; one
// that is off is a muted ghost.
const ON = { variant: "solid" } as const;
const OFF = { variant: "ghost", color: "fg.muted" } as const;

/** An icon button pressed while its tool is in hand. */
function ToolButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <IconButtonWithTooltip
      label={label}
      aria-pressed={pressed}
      {...(pressed ? ON : OFF)}
      onClick={onClick}
      portalled={false}
    >
      {children}
    </IconButtonWithTooltip>
  );
}

/**
 * The shape tool: a dropdown of the shapes, its button showing the one
 * picked. Picking one takes the shape tool in hand with it; the button is
 * pressed while it is in hand. Not portalled: inside the annotator's dialog.
 */
function ShapeMenu({
  shape,
  inHand,
  onPick,
}: {
  shape: ShapeKind;
  inHand: boolean;
  onPick: (shape: ShapeKind) => void;
}) {
  const triggerId = useId();
  const picked = SHAPES.find((choice) => choice.value === shape) ?? SHAPES[0];
  return (
    <Menu.Root positioning={{ placement: "bottom-start" }} ids={{ trigger: triggerId }}>
      <IconButtonWithTooltip
        label={`Shape: ${picked.label}`}
        tooltip="Shape: pick one, then drag a corner out from its centre"
        aria-pressed={inHand}
        {...(inHand ? ON : OFF)}
        w="auto"
        px="1.5"
        gap="0.5"
        menuTrigger={triggerId}
        portalled={false}
      >
        <picked.Icon />
        <ChevronDown />
      </IconButtonWithTooltip>
      <Menu.Positioner>
        <Menu.Content>
          <Menu.RadioItemGroup
            value={shape}
            onValueChange={(details) => onPick(details.value as ShapeKind)}
          >
            {SHAPES.map(({ value, label, Icon }) => (
              <Menu.RadioItem key={value} value={value}>
                <Icon size={16} aria-hidden />
                <Menu.ItemText>{label}</Menu.ItemText>
                <Menu.ItemIndicator />
              </Menu.RadioItem>
            ))}
          </Menu.RadioItemGroup>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}

/**
 * Whether the storyteller sees the fog: a switch between Hide and Show,
 * each word with its eye beside it, pressing anywhere on it flipping it.
 * The players' copy has the fog either way.
 */
function FogSwitch({ shown, onChange }: { shown: boolean; onChange: (shown: boolean) => void }) {
  return (
    <Switch.Root
      size="sm"
      checked={shown}
      onCheckedChange={(details) => onChange(details.checked)}
      display="inline-flex"
      alignItems="center"
      gap="1.5"
      title={shown ? "Hide the fog from your view; the players still see it" : "Show the fog"}
    >
      {/* Chakra renders a checkbox input; role="switch" is the ARIA pattern
          for an on/off toggle and what tests query. */}
      <Switch.HiddenInput role="switch" aria-label="Show fog" />
      <HStack gap="1" color={shown ? "fg.muted" : "fg"} fontWeight={shown ? undefined : "semibold"}>
        <EyeOff size={16} aria-hidden />
        <Text fontSize="xs">Hide</Text>
      </HStack>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      <HStack gap="1" color={shown ? "fg" : "fg.muted"} fontWeight={shown ? "semibold" : undefined}>
        <Text fontSize="xs">Show</Text>
        <Eye size={16} aria-hidden />
      </HStack>
    </Switch.Root>
  );
}

/**
 * Icon-only choices as the standards ask: buttons with role="radio" in a
 * radiogroup, the chosen one checked. A group may have none checked, when
 * the tool in hand is in another group (the fog tools, the wall tools, or
 * the other half's).
 */
function Choices<T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <HStack role="radiogroup" aria-label={label} gap="0.5">
      {choices.map(({ value: option, label: name, tooltip, Icon }) => {
        const checked = option === value;
        return (
          <IconButtonWithTooltip
            key={option}
            label={name}
            tooltip={tooltip}
            role="radio"
            aria-checked={checked}
            {...(checked ? ON : OFF)}
            onClick={() => onChange(option)}
            portalled={false}
          >
            <Icon />
          </IconButtonWithTooltip>
        );
      })}
    </HStack>
  );
}

/**
 * A small labelled slider whose value is reported once it is let go. What it
 * shows follows the value it is given, unless it is being dragged. A
 * percentage (`percent`) shows its value as a number to type over as well.
 */
function ToolbarSlider({
  label,
  value,
  min,
  max,
  percent = false,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  percent?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  return (
    <Slider.Root
      size="sm"
      w={percent ? "32" : "28"}
      min={min}
      max={max}
      value={[shown]}
      onValueChange={(details) => setDraft(details.value[0])}
      onValueChangeEnd={(details) => {
        setDraft(null);
        if (details.value[0] !== value) onCommit(details.value[0]);
      }}
    >
      <HStack gap="1" justify="space-between">
        <Slider.Label fontSize="xs" color="fg.muted">
          {label}
        </Slider.Label>
        {percent ? (
          <PercentField label={label} value={shown} onCommit={onCommit} />
        ) : (
          <Text fontSize="xs" color="fg.muted">
            {shown}
          </Text>
        )}
      </HStack>
      <Slider.Control>
        <Slider.Track>
          <Slider.Range />
        </Slider.Track>
        <Slider.Thumb index={0}>
          <Slider.HiddenInput />
        </Slider.Thumb>
      </Slider.Control>
    </Slider.Root>
  );
}

/**
 * A percentage typed in: reported once it is entered (Enter, or leaving the
 * box) when it is a whole number from 0 to 100 that differs; anything else
 * is put back, as is the typing on Escape.
 */
function PercentField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  // What is typed while the box is being edited; null shows the value.
  const [text, setText] = useState<string | null>(null);

  function commit() {
    if (text === null) return;
    const typed = Number(text);
    setText(null);
    if (text.trim() !== "" && Number.isInteger(typed) && typed >= 0 && typed <= 100) {
      if (typed !== value) onCommit(typed);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") commit();
    else if (event.key === "Escape") {
      // The box's own: the dialog round it stays open.
      event.stopPropagation();
      setText(null);
    }
  }

  return (
    <HStack gap="0.5">
      <Input
        type="number"
        inputMode="numeric"
        aria-label={`${label} percentage`}
        size="2xs"
        w="12"
        px="1"
        textAlign="end"
        min={0}
        max={100}
        step={1}
        value={text ?? String(value)}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <Text fontSize="xs" color="fg.muted">
        %
      </Text>
    </HStack>
  );
}

/** Whether a color is light enough to take a dark check over it. */
function isLight(color: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

/**
 * A color picked from swatches: a swatch for a trigger, and the palette it
 * opens, as the profile banner's is. The pen's and the fog's.
 */
function ColorPopover({
  label,
  colors,
  color,
  onChange,
}: {
  label: string;
  colors: readonly { value: string; label: string }[];
  color: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerId = useId();
  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      positioning={{ placement: "bottom-start" }}
      ids={{ trigger: triggerId }}
    >
      <IconButtonWithTooltip label={label} popoverTrigger={triggerId} portalled={false}>
        <Swatch color={color} />
      </IconButtonWithTooltip>
      {/* Not portalled: inside the annotator's dialog. */}
      <Popover.Positioner>
        <Popover.Content w="auto">
          <Popover.Arrow />
          <Popover.Header fontWeight="semibold">
            <Popover.Title>{label}</Popover.Title>
          </Popover.Header>
          <Popover.Body pt="0">
            <SimpleGrid role="radiogroup" aria-label={label} columns={4} gap="2">
              {colors.map(({ value, label: name }) => {
                const checked = value === color;
                return (
                  <chakra.button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={name}
                    title={name}
                    boxSize="8"
                    rounded="full"
                    bg={value}
                    borderWidth="1px"
                    borderColor="border.emphasized"
                    // A light swatch takes a dark check, a dark one a light.
                    color={isLight(value) ? "black" : "white"}
                    display="inline-flex"
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    outline={checked ? "2px solid" : undefined}
                    outlineColor="fg"
                    outlineOffset="2px"
                    _focusVisible={{ outline: "2px solid", outlineColor: "fg" }}
                    onClick={() => {
                      onChange(value);
                      setOpen(false);
                    }}
                  >
                    {checked && <Check size={16} />}
                  </chakra.button>
                );
              })}
            </SimpleGrid>
          </Popover.Body>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  );
}

function Swatch({ color }: { color: string }): ReactNode {
  return (
    <Box boxSize="4" rounded="full" bg={color} borderWidth="1px" borderColor="border.emphasized" />
  );
}
