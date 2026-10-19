import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { useState } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { ElementPanelDetail, PlayItem } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import type {
  PulseSceneElementResult,
  SetElementTagsResult,
  SetSceneElementShowingResult,
  SetSceneElementShowInfoResult,
  SetSceneElementStatusResult,
} from "@/app/(app)/run/[id]/actions";

const sa_setSceneElementStatus = mock.fn(
  async (
    _story: number,
    _scene: number,
    _element: number,
    status: string,
  ): Promise<SetSceneElementStatusResult> => ({ ok: true, status }),
);

const sa_setSceneElementShowInfo = mock.fn(
  async (
    _story: number,
    _scene: number,
    _element: number,
    showInfo: boolean,
  ): Promise<SetSceneElementShowInfoResult> => ({ ok: true, showInfo }),
);

const sa_pulseSceneElement = mock.fn(
  async (
    _story: number,
    _scene: number,
    _element: number,
    _custom: { action: string },
  ): Promise<PulseSceneElementResult> => ({ ok: true }),
);

const sa_setSceneElementShowing = mock.fn(
  async (
    _story: number,
    _scene: number,
    _element: number,
    showing: string,
  ): Promise<SetSceneElementShowingResult> => ({
    ok: true,
    showing: showing as "initial_name" | "name" | "title",
  }),
);

const detail: ElementPanelDetail = {
  element: {
    idElement: 5,
    kind: "PERSON",
    name: "Dafydd",
    initialName: "A hooded figure",
    title: "Shell seller",
    description: "Sells shells.\nKnows the tides.",
    notes: null,
    imageUrl: null,
    // Pending, so its pill reads apart from the link's Ready.
    status: "PENDING",
    tags: ["harbour"],
    url: null,
    urlText: null,
  },
  link: {
    idSceneElement: 9,
    status: "READY",
    tags: ["scene"],
    showInfo: true,
    url: null,
    urlText: null,
    createdAt: new Date("2026-10-08T12:00:00Z"),
  },
};
const sa_getElementDetail = mock.fn(
  async (_story: number, _element: number, _scene: number | null) => detail,
);

const linked = (sceneStatus: string): PlayItem => ({
  key: "PERSON:5",
  kind: "PERSON",
  label: "A hooded figure",
  detail: "Shell seller",
  imageUrl: null,
  sceneTags: ["scene"],
  sceneStatus,
  showInfo: true,
  fields: { initial_name: "A hooded figure", name: "Dafydd", title: "Shell seller" },
  showing: "initial_name",
});

// Every status may move to any other, as both workflows allow.
const options = (keys: string[]): StatusOption[] =>
  keys.map((key) => ({
    key,
    label: key.charAt(0) + key.slice(1).toLowerCase(),
    description: null,
    from: null,
  }));
const sa_listStatusOptions = mock.fn(async (table: string) =>
  table === "scene_elements"
    ? options(["READY", "INVISIBLE", "TAPPED", "DISABLED"])
    : options(["PENDING", "READY", "INACTIVE"]),
);
const sa_setRowStatus = mock.fn(async (_table: string, _id: number, status: string) => ({
  ok: true as const,
  status,
}));

// Zag only selects the highlighted item, and opens with its input modality
// "virtual", so a lone synthetic hover is ignored: the nudge loop
// status-pill.test.tsx uses, moving the pointer until the highlight shows.
async function choose(user: ReturnType<typeof userEvent.setup>, item: HTMLElement) {
  let step = 0;
  await waitFor(async () => {
    step += 1;
    await user.pointer({ target: item, coords: { clientX: step, clientY: step } });
    expect(item).toHaveAttribute("data-highlighted");
  });
  await user.click(item);
}

const sa_updateSceneElement = mock.fn(
  async (_story: number, _scene: number, _element: number, values: Record<string, string>) => ({
    ok: true as const,
    item: {
      ...linked(values.sceneStatus),
      label: values.initialName || values.name,
      detail: values.title || null,
      fields: {
        initial_name: values.initialName || null,
        name: values.name,
        title: values.title || null,
      },
    },
  }),
);

const sa_moveSceneElement = mock.fn(
  async (_story: number, _scene: number, _element: number, _from: string | null, to: string) => ({
    ok: true as const,
    item: { ...linked("READY"), sceneTags: [to] },
  }),
);

const picture = (
  idAttachment: number,
  fileName: string,
  kind: "STORY" | "STORY_SCENE" | "SCENE_ELEMENT",
) => ({
  idAttachment,
  idStory: -4,
  kind,
  idExternal: kind === "STORY" ? -4 : kind === "STORY_SCENE" ? -15 : 9,
  idAttachmentUse: kind === "STORY" ? null : idAttachment,
  status: "READY",
  url: `https://x.test/${idAttachment}.png`,
  isUploaded: true,
  fileName,
  isCover: false,
  tags: [],
});
// The link's own pictures for this scene, which the panel's Cover and Other
// images read; a test that changes them puts the list as the database would
// then have it. The scene's pictures are what the + for a cover lists under
// Scene.
let linkRows = [picture(42, "Lantern.png", "SCENE_ELEMENT")];
const sa_listAttachments = mock.fn(async (kind: string, _id: number) =>
  kind === "STORY"
    ? [picture(30, "Hooded figure.png", "STORY"), picture(31, "Harbour.png", "STORY")]
    : kind === "STORY_SCENE"
      ? [picture(40, "Stall.png", "STORY_SCENE")]
      : linkRows,
);
const sa_searchAttachments = mock.fn(async (_kind: string, _id: number, _q: string) => [31]);
// A picture the link already uses is only tagged; another is added, tagged.
const sa_attachAsCover = mock.fn(async (_kind: string, _holder: number, idAttachment: number) => {
  const held = linkRows.some((row) => row.idAttachment === idAttachment);
  linkRows = [
    ...linkRows.map((row) => ({ ...row, isCover: row.idAttachment === idAttachment })),
    ...(held ? [] : [{ ...picture(idAttachment, "Cover.png", "SCENE_ELEMENT"), isCover: true }]),
  ];
  return { ok: true as const, url: `https://x.test/${idAttachment}.png` };
});
const sa_setAttachmentCover = mock.fn(
  async (_kind: string, _holder: number, idAttachment: number, isCover: boolean) => {
    linkRows = linkRows.map((row) =>
      row.idAttachment === idAttachment ? { ...row, isCover } : row,
    );
  },
);
const sa_detachFromHolder = mock.fn(async (_kind: string, _holder: number, ids: number[]) => {
  linkRows = linkRows.filter((row) => !ids.includes(row.idAttachment));
  return { ok: true as const, detached: ids };
});
const sa_attachToHolder = mock.fn(async (_kind: string, _holder: number, ids: number[]) => {
  linkRows = [...linkRows, ...ids.map((id) => picture(id, `Added ${id}.png`, "SCENE_ELEMENT"))];
  return { ok: true as const, attached: ids };
});
const sa_setSceneElementTags = mock.fn(
  async (_story: number, _scene: number, _element: number, tags: string[]) => ({
    ok: true as const,
    item: { ...linked("READY"), sceneTags: tags },
  }),
);
const sa_setElementImage = mock.fn(
  async (_story: number, _element: number, idAttachment: number | null) => ({
    ok: true as const,
    imageUrl: idAttachment === null ? null : `https://x.test/${idAttachment}.png`,
  }),
);

const sa_unlinkSceneElement = mock.fn(async (_story: number, _scene: number, _element: number) => ({
  ok: true as const,
}));

const sa_setElementTags = mock.fn(
  async (_story: number, _element: number, tags: string[]): Promise<SetElementTagsResult> => ({
    ok: true,
    tags,
  }),
);

let RunPlayPill: typeof import("./run-play-pill").RunPlayPill;

describe("RunPlayPill", () => {
  before(async () => {
    mock.module("@/app/(app)/run/[id]/actions", {
      namedExports: {
        sa_setSceneElementStatus,
        sa_setSceneElementShowInfo,
        sa_pulseSceneElement,
        sa_setSceneElementShowing,
        sa_getElementDetail,
        sa_updateStoryElement: mock.fn(),
        sa_updateSceneElement,
        sa_moveSceneElement,
        sa_setElementImage,
        sa_unlinkSceneElement,
        sa_setSceneElementTags,
        sa_setElementTags,
      },
    });
    // The + for a picture lists the story's and the scene's attachments;
    // the panel's In this scene card reads and changes the link's own.
    mock.module("@/components/uploads/actions", {
      namedExports: {
        sa_listAttachments,
        sa_searchAttachments,
        sa_attachAsCover,
        sa_detachFromHolder,
        sa_attachToHolder,
        sa_setAttachmentCover,
      },
    });
    mock.module("@/components/status/actions", {
      namedExports: { sa_listStatusOptions, sa_setRowStatus },
    });
    ({ RunPlayPill } = await import("./run-play-pill"));
  });

  beforeEach(() => {
    sa_setSceneElementStatus.mock.resetCalls();
    sa_setSceneElementShowInfo.mock.resetCalls();
    sa_pulseSceneElement.mock.resetCalls();
    sa_setSceneElementShowing.mock.resetCalls();
    sa_getElementDetail.mock.resetCalls();
    sa_setRowStatus.mock.resetCalls();
    sa_updateSceneElement.mock.resetCalls();
    sa_moveSceneElement.mock.resetCalls();
    sa_setElementImage.mock.resetCalls();
    sa_listAttachments.mock.resetCalls();
    sa_attachAsCover.mock.resetCalls();
    sa_setAttachmentCover.mock.resetCalls();
    sa_detachFromHolder.mock.resetCalls();
    sa_attachToHolder.mock.resetCalls();
    sa_setSceneElementTags.mock.resetCalls();
    sa_setElementTags.mock.resetCalls();
    linkRows = [picture(42, "Lantern.png", "SCENE_ELEMENT")];
  });

  afterEach(() => {
    toaster.remove();
  });

  // The pill as the table holds it: its status in state, so the status
  // menu's change shows.
  function Holder({
    start,
    idStoryScene,
    otherStacks,
  }: {
    start: PlayItem;
    idStoryScene: number | null;
    otherStacks: string[];
  }) {
    const [item, setItem] = useState(start);
    // Which pill has its picture up is the table's state, not the item's.
    const [pictureUp, setPictureUp] = useState(false);
    return (
      <RunPlayPill
        idStory={-4}
        idStoryScene={idStoryScene}
        item={item}
        stackTag="scene"
        otherStacks={otherStacks}
        sceneStacks={["scene", ...otherStacks]}
        onRemove={() => {}}
        onItemChange={setItem}
        onStatusChange={(_key, sceneStatus) => setItem((current) => ({ ...current, sceneStatus }))}
        pictureUp={pictureUp}
        onPictureUpChange={(_key, up) => setPictureUp(up)}
      />
    );
  }

  const render = (
    item: PlayItem,
    idStoryScene: number | null = -15,
    otherStacks: string[] = ["assets"],
  ) =>
    renderWithProviders(
      <>
        <Holder start={item} idStoryScene={idStoryScene} otherStacks={otherStacks} />
        <Toaster />
      </>,
    );

  it("moves the status from the menu, whose button names and shows the status held", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("READY"));

    const button = within(container).getByRole("button", {
      name: "Ready: change A hooded figure's status",
    });
    await u.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Ready");
    await u.click(button);
    const items = await screen.findAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      "Ready",
      "Invisible",
      "Tapped",
      "Disabled",
    ]);
    expect(items[0]).toHaveAttribute("aria-checked", "true");

    await choose(u, items[2]);
    await waitFor(() =>
      expect(container.querySelector("[data-scene-status]")).toHaveAttribute(
        "data-scene-status",
        "TAPPED",
      ),
    );
    expect(sa_setSceneElementStatus.mock.calls[0].arguments).toEqual([-4, -15, 5, "TAPPED"]);
    expect(
      within(container).getByRole("button", { name: "Tapped: change A hooded figure's status" }),
    ).toBeInTheDocument();
  });

  it("puts the status back and says so when the menu is refused", async () => {
    const u = userEvent.setup();
    sa_setSceneElementStatus.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "That element is not in this scene.",
    }));
    const { container } = render(linked("READY"));

    await u.click(
      within(container).getByRole("button", { name: "Ready: change A hooded figure's status" }),
    );
    await choose(u, await screen.findByRole("menuitemradio", { name: "Disabled" }));

    expect(await screen.findByText("That element is not in this scene.")).toBeInTheDocument();
    expect(container.querySelector("[data-scene-status]")).toHaveAttribute(
      "data-scene-status",
      "READY",
    );
  });

  it("toggles whether the players see the element's info, and puts it back when refused", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("READY"));

    const toggle = within(container).getByRole("button", { name: "Showing info to users" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle.querySelectorAll("svg")).toHaveLength(1);
    await u.click(toggle);
    const off = await within(container).findByRole("button", {
      name: "Info not showing – click to show",
    });
    expect(off).toHaveAttribute("aria-pressed", "false");
    // The struck-through info: a second icon laid over the first.
    expect(off.querySelectorAll("svg")).toHaveLength(2);
    expect(sa_setSceneElementShowInfo.mock.calls[0].arguments).toEqual([-4, -15, 5, false]);

    sa_setSceneElementShowInfo.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "That element is not in this scene.",
    }));
    await u.click(off);
    expect(await screen.findByText("That element is not in this scene.")).toBeInTheDocument();
    expect(
      within(container).getByRole("button", { name: "Info not showing – click to show" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("draws a hidden element with a border and glow, and a disabled one in grey italics", () => {
    const hidden = render(linked("INVISIBLE"));
    const hiddenPill = hidden.container.querySelector("[data-scene-status]");
    expect(hiddenPill).toHaveStyle({ borderWidth: "2px" });
    expect(getComputedStyle(hiddenPill!).boxShadow).toContain("run-hidden");
    hidden.unmount();

    const disabled = render(linked("DISABLED"));
    expect(within(disabled.container).getByText("A hooded figure").parentElement).toHaveStyle({
      fontStyle: "italic",
    });
    expect(disabled.container.querySelector("[data-scene-status]")).not.toHaveStyle({
      borderWidth: "2px",
    });
    disabled.unmount();

    // Tapped: no border, and the menu's button says so.
    const tapped = render(linked("TAPPED"));
    expect(
      within(tapped.container).getByRole("button", {
        name: "Tapped: change A hooded figure's status",
      }),
    ).toBeInTheDocument();
    expect(tapped.container.querySelector("[data-scene-status]")).not.toHaveStyle({
      borderWidth: "2px",
    });
  });

  it("opens the element and its place in the scene in place, from the chevron", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("READY"));

    const chevron = screen.getByRole("button", { name: "About A hooded figure" });
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    await u.click(chevron);

    // Under the pill, not in a dialog over it.
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });
    expect(container.contains(popover)).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    expect(within(popover).getByRole("heading", { name: "Dafydd" })).toBeInTheDocument();
    expect(await within(popover).findByText("Person")).toBeInTheDocument();
    // The scene's card first, the element's rows under it.
    const headings = within(popover).getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Dafydd",
      "In this scene",
      "Other images",
      "In the story",
    ]);
    // Whether the players see the info, as a switch here, on with the pill's toggle.
    expect(within(popover).getByRole("switch", { name: "Show info to players" })).toBeChecked();
    // The stacks the element is filed under, on the heading's line, as a menu.
    expect(within(popover).getByRole("button", { name: "Stacks for Dafydd" })).toHaveTextContent(
      "scene",
    );
    expect(within(popover).getByText("A hooded figure")).toBeInTheDocument();
    expect(within(popover).getByText(/Knows the tides/)).toBeInTheDocument();
    expect(within(popover).getByText("harbour")).toBeInTheDocument();
    expect(within(popover).getByText("scene")).toBeInTheDocument();
    // When it was added is the heading's tooltip, to the minute, not only
    // the day; there is no Added row.
    expect(within(popover).queryByText("Added")).not.toBeInTheDocument();
    await u.hover(within(popover).getByRole("heading", { name: "In this scene" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      /^Added Oct \d{1,2}, 2026, \d{1,2}:\d{2}\s[AP]M/,
    );
    // The link's own pictures for this scene: no cover yet, so a + for one,
    // and the other image it has.
    expect(await within(popover).findByRole("button", { name: "Add cover" })).toBeInTheDocument();
    expect(
      within(within(popover).getByRole("list", { name: "Other images" })).getByRole("button", {
        name: "Preview Lantern.png",
      }),
    ).toBeInTheDocument();
    expect(sa_listAttachments.mock.calls.map((call) => call.arguments)).toEqual([
      ["SCENE_ELEMENT", 9],
    ]);
    // Name, title, description and notes are always listed, a dash for none.
    expect(within(popover).getByText("Name")).toBeInTheDocument();
    expect(within(popover).getByText("Notes")).toBeInTheDocument();
    expect(within(popover).getByText("—")).toBeInTheDocument();
    expect(sa_getElementDetail.mock.calls[0].arguments).toEqual([-4, 5, -15]);

    // Both statuses are pills to move, each on its heading's line: the scene
    // element's beside In this scene, the element's beside In the story.
    const pills = within(popover)
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("data-status"));
    expect(pills.map((pill) => pill.textContent)).toEqual(["Ready", "Pending"]);
    expect(headings[1].parentElement).toContainElement(pills[0]);
    expect(headings[3].parentElement).toContainElement(pills[1]);
    // The element's tags, with the editor beside them.
    expect(within(popover).getByRole("button", { name: "Tags for Dafydd" })).toBeInTheDocument();

    // The chevron closes it again.
    await u.click(chevron);
    expect(screen.queryByRole("region", { name: "About A hooded figure" })).not.toBeInTheDocument();
  });

  it("moves the scene element's status from the popover, and the pill follows", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("READY"));

    await u.click(within(container).getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });
    await u.click(await within(popover).findByRole("button", { name: "Ready" }));
    await choose(u, await screen.findByRole("menuitem", { name: /Disabled/ }));

    await waitFor(() => expect(sa_setRowStatus.mock.callCount()).toBe(1));
    await waitFor(() =>
      expect(container.querySelector("[data-scene-status]")).toHaveAttribute(
        "data-scene-status",
        "DISABLED",
      ),
    );
    expect(sa_setRowStatus.mock.calls[0].arguments).toEqual(["scene_elements", 9, "DISABLED"]);
  });

  it("moves the element's own status from the popover", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("READY"));

    await u.click(within(container).getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });
    await u.click(await within(popover).findByRole("button", { name: "Pending" }));
    await choose(u, await screen.findByRole("menuitem", { name: /Inactive/ }));

    await waitFor(() => expect(sa_setRowStatus.mock.callCount()).toBe(1));
    expect(sa_setRowStatus.mock.calls[0].arguments).toEqual(["elements", 5, "INACTIVE"]);
    // The scene element's pill is left as it was.
    expect(container.querySelector("[data-scene-status]")).toHaveAttribute(
      "data-scene-status",
      "READY",
    );

    // The pencil's form starts from the status just chosen, so saving it
    // does not put the old one back.
    await u.click(within(popover).getByRole("button", { name: "Edit Dafydd" }));
    expect(
      await within(popover).findByRole("button", { name: "Status: Inactive" }),
    ).toBeInTheDocument();
  });

  it("moves the element to another stack from the bottom of its popover", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("READY"), -15, ["assets", "weather"]);

    await u.click(within(container).getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });
    const moveTo = await within(popover).findByRole("combobox", { name: "Move to" });
    expect(
      within(moveTo)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Choose a stack", "assets", "weather"]);
    expect(within(popover).getByRole("separator")).toBeInTheDocument();

    await u.selectOptions(moveTo, "weather");

    await waitFor(() => expect(sa_moveSceneElement.mock.callCount()).toBe(1));
    expect(sa_moveSceneElement.mock.calls[0].arguments).toEqual([-4, -15, 5, "scene", "weather"]);
  });

  it("offers no Move to when the scene has no other stack", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("READY"), -15, []);

    await u.click(within(container).getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });
    await within(popover).findByText("Person");
    expect(within(popover).queryByRole("combobox", { name: "Move to" })).not.toBeInTheDocument();
  });

  it("edits the element from the popover's pencil, and the pill follows", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("READY"));

    await u.click(within(container).getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });
    await u.click(await within(popover).findByRole("button", { name: "Edit Dafydd" }));

    // The create form, filled in with the element as it is.
    const name = await within(popover).findByRole("textbox", { name: /^Name/ });
    expect(name).toHaveValue("Dafydd");
    expect(within(popover).getByRole("textbox", { name: /^Initial name/ })).toHaveValue(
      "A hooded figure",
    );
    expect(
      within(popover).getByRole("button", { name: "In this scene: Ready" }),
    ).toBeInTheDocument();
    await u.clear(within(popover).getByRole("textbox", { name: /^Initial name/ }));
    await u.click(within(popover).getByRole("button", { name: "Save element" }));

    await waitFor(() => expect(sa_updateSceneElement.mock.callCount()).toBe(1));
    expect(sa_updateSceneElement.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      5,
      {
        kind: "PERSON",
        name: "Dafydd",
        initialName: "",
        title: "Shell seller",
        description: "Sells shells.\nKnows the tides.",
        notes: "",
        url: "",
        urlText: "",
        status: "PENDING",
        sceneStatus: "READY",
        sceneUrl: "",
        sceneUrlText: "",
      },
    ]);
    // With no initial name the pill goes by the name.
    expect(
      await within(container).findByRole("button", { name: "Dafydd, choose what the pill shows" }),
    ).toBeInTheDocument();
  });

  it("bolds a field other than the name in the second highlight", () => {
    const { container } = render(linked("READY"));

    const trigger = within(container).getByRole("button", {
      name: "A hooded figure, choose what the pill shows",
    });
    // jsdom leaves the weight and colour as Chakra's token variables.
    expect(getComputedStyle(trigger).fontWeight).toContain("bold");
    expect(getComputedStyle(trigger).color).toContain("run-initial-name");
  });

  it("shows the name plainly", () => {
    const { container } = render({ ...linked("READY"), label: "Dafydd", showing: "name" });

    const trigger = within(container).getByRole("button", {
      name: "Dafydd, choose what the pill shows",
    });
    expect(getComputedStyle(trigger).fontWeight).toContain("medium");
    expect(getComputedStyle(trigger).color).not.toContain("run-initial-name");
  });

  it("lists each field as field:value from the name, and shows the one chosen", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("READY"));

    await u.click(
      within(container).getByRole("button", {
        name: "A hooded figure, choose what the pill shows",
      }),
    );
    const items = await screen.findAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      "initial_name:A hooded figure",
      "name:Dafydd",
      "title:Shell seller",
    ]);
    expect(items[0]).toHaveAttribute("aria-checked", "true");

    await choose(u, items[1]);
    await waitFor(() =>
      expect(
        within(container).getByRole("button", { name: "Dafydd, choose what the pill shows" }),
      ).toBeInTheDocument(),
    );
    expect(sa_setSceneElementShowing.mock.calls[0].arguments).toEqual([-4, -15, 5, "name"]);
  });

  it("puts the pill back when the action refuses the field", async () => {
    sa_setSceneElementShowing.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "That element is not in this scene.",
    }));
    const u = userEvent.setup();
    const { container } = render(linked("READY"));

    await u.click(
      within(container).getByRole("button", {
        name: "A hooded figure, choose what the pill shows",
      }),
    );
    await choose(u, await screen.findByRole("menuitemradio", { name: "title:Shell seller" }));

    expect(await screen.findByText("That element is not in this scene.")).toBeInTheDocument();
    expect(
      within(container).getByRole("button", {
        name: "A hooded figure, choose what the pill shows",
      }),
    ).toBeInTheDocument();
  });

  it("lists a field the element has left empty without offering it", async () => {
    const u = userEvent.setup();
    const { container } = render({
      ...linked("READY"),
      fields: { initial_name: "A hooded figure", name: "Dafydd", title: null },
    });

    await u.click(
      within(container).getByRole("button", {
        name: "A hooded figure, choose what the pill shows",
      }),
    );
    expect(await screen.findByRole("menuitemradio", { name: "title:—" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("gives an element without a picture a + to pick one from the attachments", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("READY"));

    const plus = within(container).getByRole("button", { name: "Add an image to A hooded figure" });
    await u.hover(plus);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Add image (attachment)");
    await u.click(plus);

    const popover = await screen.findByRole("dialog", { name: "Image for A hooded figure" });
    expect(
      await within(popover).findByRole("button", { name: "Add Hooded figure.png" }),
    ).toBeInTheDocument();
    expect(sa_listAttachments.mock.calls[0].arguments).toEqual(["STORY", -4]);

    // The scene's own, then a search narrowing the story's.
    await u.click(within(popover).getByText("Scene"));
    expect(
      await within(popover).findByRole("button", { name: "Add Stall.png" }),
    ).toBeInTheDocument();
    expect(sa_listAttachments.mock.calls.at(-1)?.arguments).toEqual(["STORY_SCENE", -15]);
    await u.click(within(popover).getByText("Story"));
    await u.type(
      within(popover).getByRole("searchbox", { name: "Search the attachments" }),
      "harb",
    );
    // Only what the search matched, once it has answered.
    const harbour = await within(popover).findByRole("button", { name: "Add Harbour.png" });
    expect(within(popover).queryByRole("button", { name: "Add Hooded figure.png" })).toBeNull();

    await u.click(harbour);
    expect(sa_setElementImage.mock.calls[0].arguments).toEqual([-4, 5, 31]);
    // The picture takes the +'s place.
    await waitFor(() =>
      expect(
        within(container).queryByRole("button", { name: "Add an image to A hooded figure" }),
      ).not.toBeInTheDocument(),
    );
    expect(container.querySelector('img[src="https://x.test/31.png"]')).not.toBeNull();
  });

  it("opens an element's picture full size when it is pressed", async () => {
    const u = userEvent.setup();
    const { container } = render({ ...linked("READY"), imageUrl: "https://x.test/9.png" });

    await u.click(within(container).getByRole("button", { name: "Preview A hooded figure" }));
    const preview = await screen.findByRole("dialog", { name: "A hooded figure" });
    expect(within(preview).getByRole("img", { name: "A hooded figure" })).toHaveAttribute(
      "src",
      "https://x.test/9.png",
    );
    // The attachment's tags are not the element's, so none are shown.
    expect(within(preview).queryByText("No tags")).toBeNull();
  });

  it("puts the picture up for the players from the tack over its thumbnail, and takes it down", async () => {
    const u = userEvent.setup();
    const { container } = render({ ...linked("READY"), imageUrl: "https://x.test/9.png" });

    const tack = within(container).getByRole("button", {
      name: "Show A hooded figure's picture to the players",
    });
    expect(tack).toHaveAttribute("aria-pressed", "false");
    await u.hover(tack);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Show for players");
    // No glow while it is down.
    const frame = within(container)
      .getByRole("button", { name: "Preview A hooded figure" })
      .closest("[data-picture-up]") as HTMLElement;
    expect(frame).toHaveAttribute("data-picture-up", "false");
    expect(getComputedStyle(frame).boxShadow).not.toContain("run-picture-up");

    await u.click(tack);
    const up = await within(container).findByRole("button", {
      name: "Hide A hooded figure's picture from the players",
    });
    expect(up).toHaveAttribute("aria-pressed", "true");
    expect(sa_pulseSceneElement.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      5,
      { action: "preview.open" },
    ]);
    // The press closed the tooltip; it opens again on a fresh hover.
    await u.unhover(up);
    await u.hover(up);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Hide for players");
    // The thumbnail glows while the picture is up.
    expect(frame).toHaveAttribute("data-picture-up", "true");
    expect(getComputedStyle(frame).boxShadow).toContain("run-picture-up");

    await u.click(up);
    expect(sa_pulseSceneElement.mock.calls[1].arguments).toEqual([
      -4,
      -15,
      5,
      { action: "preview.close" },
    ]);
    expect(
      await within(container).findByRole("button", {
        name: "Show A hooded figure's picture to the players",
      }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(frame).toHaveAttribute("data-picture-up", "false");
  });

  it("takes the picture down again and says so when the tack is refused", async () => {
    const u = userEvent.setup();
    sa_pulseSceneElement.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "That element is not in this scene.",
    }));
    const { container } = render({ ...linked("READY"), imageUrl: "https://x.test/9.png" });

    await u.click(
      within(container).getByRole("button", {
        name: "Show A hooded figure's picture to the players",
      }),
    );
    expect(await screen.findByText("That element is not in this scene.")).toBeInTheDocument();
    expect(
      within(container).getByRole("button", {
        name: "Show A hooded figure's picture to the players",
      }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("gives an element without a picture, or one the page alone holds, no tack", () => {
    const { container, unmount } = render(linked("READY"));
    expect(within(container).queryByRole("button", { name: /picture to the players$/ })).toBeNull();
    unmount();

    render({
      key: "PERSON:5",
      kind: "PERSON",
      label: "Dafydd",
      detail: null,
      imageUrl: "https://x.test/9.png",
    });
    expect(screen.queryByRole("button", { name: /picture to the players$/ })).toBeNull();
  });

  it("takes an element's picture away from its info popover, and the + comes back", async () => {
    sa_getElementDetail.mock.mockImplementationOnce(async () => ({
      ...detail,
      element: { ...detail.element, imageUrl: "https://x.test/9.png" },
    }));
    const u = userEvent.setup();
    const { container } = render({ ...linked("READY"), imageUrl: "https://x.test/9.png" });

    await u.click(within(container).getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });
    await u.click(await within(popover).findByRole("button", { name: "Remove picture" }));

    expect(sa_setElementImage.mock.calls[0].arguments).toEqual([-4, 5, null]);
    expect(await within(popover).findByRole("button", { name: "Add picture" })).toBeInTheDocument();
    expect(
      within(container).getByRole("button", { name: "Add an image to A hooded figure" }),
    ).toBeInTheDocument();
  });

  it("previews an attachment from its picture in the picker, without picking it", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("READY"));

    await u.click(
      within(container).getByRole("button", { name: "Add an image to A hooded figure" }),
    );
    const popover = await screen.findByRole("dialog", { name: "Image for A hooded figure" });
    await u.click(await within(popover).findByRole("button", { name: "Preview Harbour.png" }));

    const preview = await screen.findByRole("dialog", { name: "Harbour.png" });
    expect(within(preview).getByRole("img", { name: "Harbour.png" })).toHaveAttribute(
      "src",
      "https://x.test/31.png",
    );
    expect(sa_setElementImage.mock.callCount()).toBe(0);

    // Closing the preview leaves the picker open to choose from.
    await u.click(within(preview).getByRole("button", { name: "Close preview" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Harbour.png" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: "Image for A hooded figure" })).toBeInTheDocument();
  });

  it("opens the picture full size from the panel's thumbnail", async () => {
    sa_getElementDetail.mock.mockImplementationOnce(async () => ({
      ...detail,
      element: { ...detail.element, imageUrl: "https://x.test/9.png" },
    }));
    const u = userEvent.setup();
    const { container } = render({ ...linked("READY"), imageUrl: "https://x.test/9.png" });

    await u.click(within(container).getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });
    await u.click(await within(popover).findByRole("button", { name: "Preview Dafydd" }));

    // The preview is its own dialog, with its own Close, over the panel.
    const close = await screen.findByRole("button", { name: "Close preview" });
    const preview = close.closest('[role="dialog"]') as HTMLElement;
    expect(within(preview).getByRole("img", { name: "Dafydd" })).toHaveAttribute(
      "src",
      "https://x.test/9.png",
    );
    expect(sa_setElementImage.mock.callCount()).toBe(0);
  });

  it("edits the element's tags from the Tags row's editor", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("READY"));
    await u.click(screen.getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });
    await within(popover).findByText("Person");

    await u.click(within(popover).getByRole("button", { name: "Tags for Dafydd" }));
    const editor = await screen.findByRole("dialog", { name: "Tags" });
    expect(
      within(within(editor).getByRole("list", { name: "Tags" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["harbour"]);
    await u.type(within(editor).getByRole("textbox", { name: "New tag" }), "Docks{Enter}");

    await waitFor(() => expect(sa_setElementTags.mock.callCount()).toBe(1));
    expect(sa_setElementTags.mock.calls[0].arguments).toEqual([-4, 5, ["harbour", "docks"]]);
    // The row and the editor both say so.
    expect(await within(editor).findByText("docks")).toBeInTheDocument();
    expect(within(popover).getByText("harbour, docks")).toBeInTheDocument();

    await u.click(within(editor).getByRole("button", { name: "Remove tag harbour" }));
    await waitFor(() => expect(sa_setElementTags.mock.callCount()).toBe(2));
    expect(sa_setElementTags.mock.calls[1].arguments).toEqual([-4, 5, ["docks"]]);

    // Refused: the row keeps what it had and the editor says why.
    sa_setElementTags.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "That element is not part of this story.",
    }));
    await u.type(within(editor).getByRole("textbox", { name: "New tag" }), "quay{Enter}");
    expect(
      await within(editor).findByText("That tag could not be added. Please try again."),
    ).toBeInTheDocument();
    expect(within(container).queryByText(/quay/)).toBeNull();
  });

  it("in a complete scene, opens its panel to read and offers nothing that changes the link", async () => {
    const u = userEvent.setup();
    const { container } = renderWithProviders(
      <>
        <RunPlayPill
          idStory={-4}
          idStoryScene={-15}
          item={{ ...linked("READY"), imageUrl: "https://x.test/9.png" }}
          stackTag="scene"
          otherStacks={["assets"]}
          sceneStacks={["scene", "assets"]}
          locked
          onRemove={() => {}}
          onItemChange={() => {}}
          onStatusChange={() => {}}
          pictureUp={false}
          onPictureUpChange={() => {}}
        />
        <Toaster />
      </>,
    );

    // The name is plain, the status is shown but not a menu, the info toggle
    // says which way it is without pressing, and there is no tack.
    expect(
      within(container).queryByRole("button", { name: /choose what the pill shows/ }),
    ).toBeNull();
    expect(within(container).getByText("A hooded figure")).toBeInTheDocument();
    expect(
      within(container).queryByRole("button", { name: /change A hooded figure's status/ }),
    ).toBeNull();
    expect(
      within(container).getByRole("button", { name: "Showing info to users" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(within(container).queryByRole("button", { name: /picture to the players$/ })).toBeNull();
    // The picture still opens full size.
    expect(
      within(container).getByRole("button", { name: "Preview A hooded figure" }),
    ).toBeInTheDocument();

    await u.click(within(container).getByRole("button", { name: "About A hooded figure" }));
    const panel = await screen.findByRole("region", { name: "About A hooded figure" });
    await within(panel).findByText("Person");
    expect(within(panel).queryByRole("button", { name: "Remove from scene" })).toBeNull();
    expect(within(panel).getByRole("switch", { name: "Show info to players" })).toBeDisabled();
    expect(within(panel).queryByRole("button", { name: "Stacks for Dafydd" })).toBeNull();
    expect(within(panel).getByText("scene")).toBeInTheDocument();
    expect(within(panel).queryByRole("combobox", { name: "Move to" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Edit Dafydd" })).toBeNull();
  });

  it("says nothing under Other images when the link has none", async () => {
    linkRows = [];
    const u = userEvent.setup();
    render(linked("READY"));

    await u.click(screen.getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });
    expect(await within(popover).findByRole("button", { name: "Add cover" })).toBeInTheDocument();
    expect(within(popover).getByRole("heading", { name: "Other images" })).toBeInTheDocument();
    expect(within(popover).queryByText(/No other images/)).toBeNull();
    expect(within(popover).queryByRole("list", { name: "Other images" })).toBeNull();
  });

  it("gives an element with a picture no +", () => {
    const { container } = render({ ...linked("READY"), imageUrl: "https://x.test/9.png" });

    expect(
      within(container).queryByRole("button", { name: /^Add an image to / }),
    ).not.toBeInTheDocument();
  });

  it("gives something the page alone holds no status, no info toggle, no chevron and no ✕", () => {
    render({ key: "PERSON:5", kind: "PERSON", label: "Dafydd", detail: null, imageUrl: null });

    expect(screen.queryByRole("button", { name: /status$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /info$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^About / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
  });

  it("toggles the info and files the element under other stacks from the panel", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("READY"));
    await u.click(screen.getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });
    await within(popover).findByText("Person");

    // The panel's switch presses the same way as the pill's toggle, which follows.
    const info = within(popover).getByRole("switch", { name: "Show info to players" });
    expect(info).toBeChecked();
    // Its tooltip says what pressing it does, which way it stands.
    await u.hover(info);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Hide info from the players");
    await u.click(info);
    expect(sa_setSceneElementShowInfo.mock.calls[0].arguments).toEqual([-4, -15, 5, false]);
    await waitFor(() => expect(info).not.toBeChecked());
    await u.unhover(info);
    await u.hover(info);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Show info to the players");
    expect(
      within(container).getByRole("button", { name: "Info not showing – click to show" }),
    ).toBeInTheDocument();

    // The stacks menu on the heading's line, ticked for the stacks it is in;
    // each tick saves at once and the menu stays open for the next.
    await u.click(within(popover).getByRole("button", { name: "Stacks for Dafydd" }));
    const scene = await screen.findByRole("menuitemcheckbox", { name: "scene" });
    const assets = screen.getByRole("menuitemcheckbox", { name: "assets" });
    expect(scene).toHaveAttribute("aria-checked", "true");
    expect(assets).toHaveAttribute("aria-checked", "false");
    await choose(u, assets);

    await waitFor(() => expect(sa_setSceneElementTags.mock.callCount()).toBe(1));
    expect(sa_setSceneElementTags.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      5,
      ["scene", "assets"],
    ]);
    // The trigger says so, and the pill was handed its item as it now is.
    await waitFor(() =>
      expect(within(popover).getByRole("button", { name: "Stacks for Dafydd" })).toHaveTextContent(
        "scene, assets",
      ),
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "assets" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("gives the element a picture for this scene from the panel's +, which the pill shows, and takes it away with the −", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("READY"));
    // No picture of its own, so the pill offers its + for one.
    expect(
      within(container).getByRole("button", { name: "Add an image to A hooded figure" }),
    ).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });

    // The + opens the picker below the rows, listing the story's pictures.
    await u.click(await within(popover).findByRole("button", { name: "Add cover" }));
    await u.click(await within(popover).findByRole("button", { name: "Add Hooded figure.png" }));

    expect(sa_attachAsCover.mock.calls[0].arguments).toEqual(["SCENE_ELEMENT", 9, 30]);
    // The pill shows it in place of its +, and the row shows it with its −.
    const thumbnail = await within(container).findByRole("button", {
      name: "Preview A hooded figure",
    });
    expect(thumbnail.querySelector("img")).toHaveAttribute("src", "https://x.test/30.png");
    expect(
      within(container).queryByRole("button", { name: "Add an image to A hooded figure" }),
    ).toBeNull();
    const remove = await within(popover).findByRole("button", { name: "Remove cover" });
    expect(within(popover).queryByRole("button", { name: "Add cover" })).toBeNull();
    expect(within(popover).queryByRole("button", { name: "Add Harbour.png" })).toBeNull();

    // Taken away, the pill falls back to the element's own picture: none.
    await u.click(remove);
    expect(sa_detachFromHolder.mock.calls[0].arguments).toEqual(["SCENE_ELEMENT", 9, [30]]);
    expect(await within(popover).findByRole("button", { name: "Add cover" })).toBeInTheDocument();
    expect(
      await within(container).findByRole("button", { name: "Add an image to A hooded figure" }),
    ).toBeInTheDocument();
  });

  it("swaps the cover and an other image with their stars, and the pill follows", async () => {
    const u = userEvent.setup();
    linkRows = [
      { ...picture(42, "Lantern.png", "SCENE_ELEMENT"), isCover: true },
      picture(43, "Rope.png", "SCENE_ELEMENT"),
    ];
    const { container } = render(linked("READY"));
    await u.click(screen.getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });

    // The cover's star is filled; an other image's is not.
    const coverStar = await within(popover).findByRole("button", { name: "Cover Lantern.png" });
    expect(coverStar).toHaveAttribute("aria-pressed", "true");
    const otherStar = within(popover).getByRole("button", { name: "Cover Rope.png" });
    expect(otherStar).toHaveAttribute("aria-pressed", "false");
    await u.hover(otherStar);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Make this the cover");

    // Pressed on an other image, it takes the cover's place; the pill shows it.
    await u.click(otherStar);
    expect(sa_attachAsCover.mock.calls[0].arguments).toEqual(["SCENE_ELEMENT", 9, 43]);
    await waitFor(() =>
      expect(within(popover).getByRole("button", { name: "Cover Rope.png" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(within(popover).getByRole("button", { name: "Cover Lantern.png" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      within(container)
        .getByRole("button", { name: "Preview A hooded figure" })
        .querySelector("img"),
    ).toHaveAttribute("src", "https://x.test/43.png");

    // Pressed on the cover, it moves down among the other images, which
    // leaves the link with no cover and the pill with the element's picture: none.
    await u.click(within(popover).getByRole("button", { name: "Cover Rope.png" }));
    expect(sa_setAttachmentCover.mock.calls[0].arguments).toEqual(["SCENE_ELEMENT", 9, 43, false]);
    expect(await within(popover).findByRole("button", { name: "Add cover" })).toBeInTheDocument();
    expect(
      within(within(popover).getByRole("list", { name: "Other images" })).getAllByRole("button", {
        name: /^Cover /,
      }),
    ).toHaveLength(2);
    expect(
      await within(container).findByRole("button", { name: "Add an image to A hooded figure" }),
    ).toBeInTheDocument();
  });

  it("adds the story's pictures to the element for this scene from Other images' +", async () => {
    const u = userEvent.setup();
    render(linked("READY"));
    await u.click(screen.getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });

    // The + opens the story attachment picker, already unfolded.
    await u.click(await within(popover).findByRole("button", { name: "Add images" }));
    await u.click(await within(popover).findByRole("checkbox", { name: "Harbour.png" }));
    await u.click(within(popover).getByRole("button", { name: "Add 1 to this element" }));

    expect(sa_attachToHolder.mock.calls[0].arguments).toEqual(["SCENE_ELEMENT", 9, [31]]);
    // The scene's list is read again, and now shows it.
    await waitFor(() => expect(sa_listAttachments.mock.callCount()).toBeGreaterThan(2));
    const list = await within(popover).findByRole("list", { name: "Other images" });
    expect(
      await within(list).findByRole("button", { name: "Preview Added 31.png" }),
    ).toBeInTheDocument();
  });

  it("removes an element from the scene with the − beside In this scene", async () => {
    const onRemove = mock.fn((_key: string) => {});
    const u = userEvent.setup();
    renderWithProviders(
      <>
        <RunPlayPill
          idStory={-4}
          idStoryScene={-15}
          item={linked("READY")}
          stackTag="scene"
          otherStacks={[]}
          sceneStacks={["scene"]}
          onRemove={onRemove}
          onItemChange={() => {}}
          onStatusChange={() => {}}
          pictureUp={false}
          onPictureUpChange={() => {}}
        />
        <Toaster />
      </>,
    );

    await u.click(screen.getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("region", { name: "About A hooded figure" });
    await within(popover).findByRole("heading", { name: "In this scene" });
    const minus = within(popover).getByRole("button", { name: "Remove from scene" });
    await u.hover(minus);
    expect(await screen.findByRole("tooltip", { name: "Remove from scene" })).toBeInTheDocument();
    await u.click(minus);

    expect(sa_unlinkSceneElement.mock.calls[0].arguments).toEqual([-4, -15, 5]);
    await waitFor(() => expect(onRemove.mock.calls[0]?.arguments).toEqual(["PERSON:5"]));
    expect(await screen.findByText("Removed from the scene")).toBeInTheDocument();
  });
});
