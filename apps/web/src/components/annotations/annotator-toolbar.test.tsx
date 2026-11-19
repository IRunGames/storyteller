import { beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "@/test/render";
import { AnnotatorSaveState, AnnotatorToolbar } from "./annotator-toolbar";

// A slider's thumb is hidden until the browser has measured its track, which
// jsdom never does, and a hidden element has no accessible name there; so a
// slider is found by its label, and its thumb is the slider labelled by it.
function slider(bar: HTMLElement, name: string): HTMLElement | null {
  const label = within(bar).queryByText(name, { selector: "label" });
  if (!label) return null;
  return bar.querySelector(`[role="slider"][aria-labelledby="${CSS.escape(label.id)}"]`);
}

const handlers = {
  onToolChange: mock.fn((_tool: string) => {}),
  onShapeChange: mock.fn((_shape: string) => {}),
  onModeChange: mock.fn((_mode: string) => {}),
  onBrushSizeChange: mock.fn((_value: number) => {}),
  onPenWidthChange: mock.fn((_value: number) => {}),
  onPenColorChange: mock.fn((_color: string) => {}),
  onFogShownChange: mock.fn((_shown: boolean) => {}),
  onOwnFogChange: mock.fn((_value: number) => {}),
  onPlayersFogChange: mock.fn((_value: number) => {}),
  onFogColorChange: mock.fn((_color: string) => {}),
  onCoverAll: mock.fn(() => {}),
  onClearAll: mock.fn(() => {}),
  onEraseAll: mock.fn(() => {}),
};

function toolbar(props: Partial<Parameters<typeof AnnotatorToolbar>[0]> = {}) {
  const { container } = renderWithProviders(
    <AnnotatorToolbar
      tool="brush"
      shape="circle"
      mode="reveal"
      brushSize={4}
      penWidth={4}
      penColor="#e53935"
      fogShown
      ownFog={50}
      playersFog={100}
      fogColor="#1b1d23"
      {...handlers}
      {...props}
    />,
  );
  return within(container).getByRole("toolbar", { name: "Annotation tools" });
}

describe("AnnotatorToolbar", () => {
  beforeEach(() => {
    for (const handler of Object.values(handlers)) handler.mock.resetCalls();
  });

  it("keeps the annotations' tools on one side and the fog's on the other, one tool in hand", async () => {
    const user = userEvent.setup();
    const bar = toolbar();
    const annotations = within(bar).getByRole("group", { name: "Annotations" });
    const fog = within(bar).getByRole("group", { name: "Fog" });
    expect(
      annotations.compareDocumentPosition(fog) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const marks = within(annotations).getByRole("group", { name: "Annotation tool" });
    const pen = within(marks).getByRole("button", { name: "Pen" });
    const shape = within(marks).getByRole("button", { name: "Shape: Circle" });
    const eraser = within(marks).getByRole("button", { name: "Eraser" });
    expect(pen.compareDocumentPosition(shape) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(shape.compareDocumentPosition(eraser) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const button of [pen, shape, eraser]) {
      expect(button).toHaveAttribute("aria-pressed", "false");
    }
    const fogTools = within(fog).getByRole("radiogroup", { name: "Fog tool" });
    expect(within(fogTools).getByRole("radio", { name: "Fog brush" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(eraser);
    await user.click(within(fogTools).getByRole("radio", { name: "Fog rectangle" }));
    expect(handlers.onToolChange.mock.calls.map((call) => call.arguments[0])).toEqual([
      "eraser",
      "rect",
    ]);
  });

  it("picks a shape from the shape tool's dropdown, which takes the shape tool in hand", async () => {
    const user = userEvent.setup();
    const bar = toolbar({ shape: "triangle" });
    await user.click(within(bar).getByRole("button", { name: "Shape: Triangle" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent),
    ).toEqual(["Circle", "Triangle", "Square", "Pentagon", "Hexagon"]);
    expect(within(menu).getByRole("menuitemradio", { name: "Triangle" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(within(menu).getByRole("menuitemradio", { name: "Hexagon" }));
    expect(handlers.onShapeChange.mock.calls.map((call) => call.arguments[0])).toEqual(["hexagon"]);
    expect(handlers.onToolChange.mock.calls.map((call) => call.arguments[0])).toEqual(["shape"]);
  });

  it("marks the shape tool pressed while it is in hand, with the pen's color and width", () => {
    const bar = toolbar({ tool: "shape", shape: "pentagon" });
    expect(within(bar).getByRole("button", { name: "Shape: Pentagon" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(slider(bar, "Width")).not.toBeNull();
    expect(within(bar).getByRole("button", { name: "Pen color" })).toBeInTheDocument();
  });

  it("offers the pen's color and width for the pen", async () => {
    const user = userEvent.setup();
    const bar = toolbar({ tool: "pen" });
    expect(within(bar).getByRole("button", { name: "Pen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(slider(bar, "Width")).not.toBeNull();

    await user.click(within(bar).getByRole("button", { name: "Pen color" }));
    const colors = await screen.findByRole("radiogroup", { name: "Pen color" });
    expect(within(colors).getByRole("radio", { name: "Red" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(within(colors).getByRole("radio", { name: "Blue" }));
    expect(handlers.onPenColorChange.mock.calls.map((call) => call.arguments[0])).toEqual([
      "#1e88e5",
    ]);
  });

  it("hides the pen's choices for the eraser", () => {
    const bar = toolbar({ tool: "eraser" });
    expect(slider(bar, "Width")).toBeNull();
    expect(within(bar).queryByRole("button", { name: "Pen color" })).toBeNull();
  });

  it("offers Reveal or Cover for the fog's tools, and the brush's size for the brush", async () => {
    const user = userEvent.setup();
    const bar = toolbar();
    const modes = within(bar).getByRole("radiogroup", { name: "Fog mode" });
    await user.click(within(modes).getByRole("radio", { name: "Cover" }));
    expect(handlers.onModeChange.mock.calls.map((call) => call.arguments[0])).toEqual(["cover"]);
    expect(slider(bar, "Brush size")).not.toBeNull();
  });

  it("leaves out the fog's modes and the brush's size while an annotation tool is in hand", () => {
    const bar = toolbar({ tool: "pen" });
    expect(within(bar).queryByRole("radiogroup", { name: "Fog mode" })).toBeNull();
    expect(slider(bar, "Brush size")).toBeNull();
  });

  it("erases every annotation, covers the picture in fog, and clears it", async () => {
    const user = userEvent.setup();
    const bar = toolbar();
    const annotations = within(bar).getByRole("group", { name: "Annotations" });
    const fog = within(bar).getByRole("group", { name: "Fog" });
    await user.click(within(annotations).getByRole("button", { name: "Erase all annotations" }));
    await user.click(within(fog).getByRole("button", { name: "Cover all" }));
    await user.click(within(fog).getByRole("button", { name: "Clear all" }));
    expect(handlers.onEraseAll.mock.callCount()).toBe(1);
    expect(handlers.onCoverAll.mock.callCount()).toBe(1);
    expect(handlers.onClearAll.mock.callCount()).toBe(1);
  });

  it("shows both fogs' opacities, each a slider and a percentage", () => {
    const bar = toolbar();
    expect(slider(bar, "My fog")).toHaveAttribute("aria-valuenow", "50");
    expect(slider(bar, "Players' fog")).toHaveAttribute("aria-valuenow", "100");
    expect(within(bar).getByRole("spinbutton", { name: "My fog percentage" })).toHaveValue(50);
    expect(within(bar).getByRole("spinbutton", { name: "Players' fog percentage" })).toHaveValue(
      100,
    );
  });

  it("takes a fog's percentage typed in once it is entered, and puts back one out of range", async () => {
    const user = userEvent.setup();
    const bar = toolbar();
    const players = within(bar).getByRole("spinbutton", { name: "Players' fog percentage" });
    await user.clear(players);
    await user.type(players, "65{Enter}");
    expect(handlers.onPlayersFogChange.mock.calls.map((call) => call.arguments[0])).toEqual([65]);

    const own = within(bar).getByRole("spinbutton", { name: "My fog percentage" });
    await user.clear(own);
    await user.type(own, "150");
    await user.tab();
    expect(handlers.onOwnFogChange.mock.callCount()).toBe(0);
    expect(own).toHaveValue(50);
  });

  it("hides the fog from the storyteller's own view with a switch, and shows it again", async () => {
    const user = userEvent.setup();
    const bar = toolbar();
    const fogSwitch = within(bar).getByRole("switch", { name: "Show fog" });
    expect(fogSwitch).toBeChecked();
    // Hide on one side of it and Show on the other.
    expect(fogSwitch.closest("label")).toHaveTextContent(/Hide.*Show/);
    await user.click(fogSwitch);
    expect(handlers.onFogShownChange.mock.calls.map((call) => call.arguments[0])).toEqual([false]);
  });

  it("chooses the fog's color from its swatches", async () => {
    const user = userEvent.setup();
    const bar = toolbar();
    await user.click(within(bar).getByRole("button", { name: "Fog color" }));
    const colors = await screen.findByRole("radiogroup", { name: "Fog color" });
    expect(within(colors).getByRole("radio", { name: "Slate" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(within(colors).getByRole("radio", { name: "Parchment" }));
    expect(handlers.onFogColorChange.mock.calls.map((call) => call.arguments[0])).toEqual([
      "#e9dcbf",
    ]);
  });
});

describe("AnnotatorSaveState", () => {
  it("undoes, held back when there is nothing to undo, and says whether the drawing is saved", async () => {
    const user = userEvent.setup();
    const onUndo = mock.fn(() => {});
    const { rerender } = renderWithProviders(
      <AnnotatorSaveState canUndo={false} onUndo={onUndo} status="saving" />,
    );
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toHaveAttribute("aria-disabled", "true");
    await user.click(undo);
    expect(onUndo.mock.callCount()).toBe(0);
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");

    rerender(<AnnotatorSaveState canUndo onUndo={onUndo} status="saved" />);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo.mock.callCount()).toBe(1);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });
});
