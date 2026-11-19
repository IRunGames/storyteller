import { describe, it } from "node:test";
import { expect } from "expect";
import type { StatusOption } from "@/lib/status";
import { prepColumnQuery, readPrepBoardState, writePrepBoardState } from "./prep-board-state";

const option = (key: string): StatusOption => ({ key, label: key, description: null, from: null });
const workflows = {
  Timeline: [option("called"), option("risen")],
  Scenes: [option("drafted"), option("running"), option("spent")],
};

describe("readPrepBoardState", () => {
  it("starts every column at its usual width, with nothing typed and every status on", () => {
    const state = readPrepBoardState(undefined, workflows);
    expect(Object.values(state.modes).every((mode) => mode === "normal")).toBe(true);
    expect(state.filters.Timeline).toEqual({ query: "", statuses: ["called", "risen"] });
    expect(state.filters.People).toEqual({ query: "", statuses: [] });
  });

  it("reads back what writePrepBoardState wrote", () => {
    const state = readPrepBoardState(undefined, workflows);
    state.modes.People = "hidden";
    state.modes.Scenes = "expanded";
    state.filters.Scenes = { query: "vault", statuses: ["running"] };

    const stored = writePrepBoardState(state, workflows);
    expect(stored).toEqual({
      modes: { Scenes: "expanded", People: "hidden" },
      filters: { Scenes: { query: "vault", off: ["drafted", "spent"] } },
    });
    expect(readPrepBoardState(stored, workflows)).toEqual(state);
  });

  it("switches on a status the stored value never named, as a workflow's new status would be", () => {
    const state = readPrepBoardState(
      { modes: {}, filters: { Scenes: { query: "", off: ["spent", "dropped"] } } },
      workflows,
    );
    expect(state.filters.Scenes.statuses).toEqual(["drafted", "running"]);
  });

  it("drops what no longer fits: an unknown mode, a second expanded column, the Timeline expanded", () => {
    const state = readPrepBoardState(
      {
        modes: { Timeline: "expanded", Scenes: "expanded", People: "expanded", Places: "huge" },
        filters: { Gone: { query: "x", off: [] }, Scenes: { query: 4, off: "spent" } },
      },
      workflows,
    );
    expect(state.modes.Timeline).toBe("normal");
    expect(state.modes.Scenes).toBe("expanded");
    expect(state.modes.People).toBe("normal");
    expect(state.modes.Places).toBe("normal");
    expect(state.filters.Scenes).toEqual({ query: "", statuses: ["drafted", "running", "spent"] });
  });

  it("starts over on a stored value of the wrong shape", () => {
    expect(readPrepBoardState("hidden", workflows)).toEqual(
      readPrepBoardState(undefined, workflows),
    );
  });
});

describe("prepColumnQuery", () => {
  it("asks for no status filter while every status is on, and trims the words", () => {
    expect(
      prepColumnQuery(
        { query: "  vault ", statuses: ["drafted", "running", "spent"] },
        workflows.Scenes,
      ),
    ).toEqual({ query: "vault", statuses: undefined });
  });

  it("asks for the statuses left on once one is off, and for none when all are", () => {
    expect(prepColumnQuery({ query: "", statuses: ["running"] }, workflows.Scenes)).toEqual({
      query: "",
      statuses: ["running"],
    });
    expect(prepColumnQuery({ query: "", statuses: [] }, workflows.Scenes)).toEqual({
      query: "",
      statuses: [],
    });
  });
});
