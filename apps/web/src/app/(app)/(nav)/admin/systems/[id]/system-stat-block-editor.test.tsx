import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { AdminSystemDetail } from "@/app/(app)/(nav)/admin/systems/actions";
import type { StatBlockDefinition } from "@/lib/stat-blocks";

const sa_setSystemStatBlockDefinition = mock.fn<
  (idSystem: number, definition: StatBlockDefinition) => Promise<{ ok: true }>
>(async () => ({ ok: true }));

let SystemStatBlockEditor: typeof import("./system-stat-block-editor").SystemStatBlockEditor;

// The editor itself is tested beside it (stat-block-definition-editor.test.tsx);
// this is only that the Systems page's saves over its system.
const system: AdminSystemDetail = {
  idSystem: -90,
  label: "Palladium Fantasy Role-Playing Game (2e)",
  systemName: "Palladium Fantasy Role-Playing Game",
  systemVersion: "2e",
  variant: null,
  definition: { groups: [] },
};

describe("SystemStatBlockEditor", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/admin/systems/actions", {
      namedExports: { sa_setSystemStatBlockDefinition },
    });
    ({ SystemStatBlockEditor } = await import("./system-stat-block-editor"));
  });

  it("says the stat block is the system's, saves over the system, and links back to the systems", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);

    expect(screen.getByText(/every element run in this system can carry/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to systems" })).toHaveAttribute(
      "href",
      "/admin/systems",
    );
    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(1));
    expect(sa_setSystemStatBlockDefinition.mock.calls[0].arguments).toEqual([-90, { groups: [] }]);
  });
});
