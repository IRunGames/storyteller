import { before, describe, it } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

let PlayPicker: typeof import("./play-picker").PlayPicker;

const stories = [
  { idGame: 7, gameTitle: "Something Wicked" },
  { idGame: 9, gameTitle: "The Devil's Spine" },
];

describe("PlayPicker", () => {
  before(async () => {
    ({ PlayPicker } = await import("./play-picker"));
  });

  it("lists the stories in a labelled select with nothing chosen", () => {
    renderWithProviders(<PlayPicker stories={stories} />);

    const select = screen.getByRole("combobox", { name: "Story" });
    expect(select).toHaveValue("");
    expect(
      screen.getByRole("option", { name: "Something Wicked" }),
    ).toHaveValue("7");
    expect(
      screen.getByRole("option", { name: "The Devil's Spine" }),
    ).toHaveValue("9");
  });

  it("keeps Play disabled until a story is chosen, then links it to the table", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlayPicker stories={stories} />);

    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(
      screen.queryByRole("link", { name: "Play" }),
    ).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Story" }),
      "9",
    );

    expect(screen.getByRole("link", { name: "Play" })).toHaveAttribute(
      "href",
      "/play/9",
    );
    expect(
      screen.queryByRole("button", { name: "Play" }),
    ).not.toBeInTheDocument();
  });

  it("points at the new-story form when there is nothing to play", () => {
    renderWithProviders(<PlayPicker stories={[]} />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "start one" })).toHaveAttribute(
      "href",
      "/stories/new",
    );
  });
});
