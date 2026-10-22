import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";

// Twelve sittings, oldest first, as sessionOptions numbers them.
const sessions = Array.from({ length: 12 }, (_, index) => ({
  idStorySession: -(index + 1),
  label: `Session ${index + 1}`,
}));

let LiveSessionSelect: typeof import("./live-session-select").LiveSessionSelect;

describe("LiveSessionSelect", () => {
  before(async () => {
    mock.module("@/app/(app)/scenes/[id]/live/actions", {
      namedExports: { sa_setLiveSceneSession: mock.fn() },
    });
    ({ LiveSessionSelect } = await import("./live-session-select"));
  });

  const optionsOf = () =>
    within(screen.getByRole("combobox", { name: "Session" }))
      .getAllByRole("option")
      .map((option) => option.textContent);

  it("offers the ten most recent sittings, newest first, after Not played yet", () => {
    renderWithProviders(
      <LiveSessionSelect
        idStory={-4}
        idStoryScene={-15}
        sessions={sessions}
        initial={null}
        locked={false}
      />,
    );

    expect(optionsOf()).toEqual([
      "Not played yet",
      ...[12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map((n) => `Session ${n}`),
    ]);
  });

  it("keeps an older sitting the scene was played in, at the foot of the list", () => {
    renderWithProviders(
      <LiveSessionSelect
        idStory={-4}
        idStoryScene={-15}
        sessions={sessions}
        initial={-1}
        locked={false}
      />,
    );

    const offered = optionsOf();
    expect(offered).toHaveLength(12);
    expect(offered.at(-1)).toBe("Session 1");
    expect(screen.getByRole("combobox", { name: "Session" })).toHaveValue("-1");
  });
});
