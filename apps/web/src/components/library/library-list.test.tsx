import { describe, it } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";
import { LibraryList } from "./library-list";

describe("LibraryList", () => {
  it("gives each story a book that opens its library, and marks the retired ones", () => {
    renderWithProviders(
      <LibraryList
        stories={[
          {
            idStory: -1,
            title: "An Eastern King",
            system: "City of Mist (1e)",
            isActive: true,
            isArchived: false,
          },
          { idStory: -2, title: "Old Tales", system: null, isActive: false, isArchived: false },
          { idStory: -3, title: "Long Gone", system: null, isActive: false, isArchived: true },
        ]}
      />,
    );

    const rows = within(screen.getByRole("list", { name: "Your stories" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(3);
    expect(
      screen.getByRole("link", { name: "Open the library for An Eastern King" }),
    ).toHaveAttribute("href", "/libraries/-1");
    expect(rows[0]).toHaveTextContent("City of Mist (1e)");
    expect(rows[0]).not.toHaveTextContent(/inactive|archived/i);
    expect(within(rows[1]).getByText("Inactive")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Archived")).toBeInTheDocument();
    expect(within(rows[2]).queryByText("Inactive")).not.toBeInTheDocument();
  });

  it("points someone with no stories at starting one", () => {
    renderWithProviders(<LibraryList stories={[]} />);

    expect(screen.getByRole("link", { name: "Start a story" })).toHaveAttribute(
      "href",
      "/stories/new",
    );
  });
});
