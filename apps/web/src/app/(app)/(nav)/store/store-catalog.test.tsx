import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { STORE_PRODUCTS } from "@/lib/store-products";
import type { UserPreferenceMap } from "@/lib/user-preference-schemas";

const sa_setUserPreference = mock.fn(async (_input: unknown) => ({ ok: true as const }));

type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];
let StoreCatalog: typeof import("./store-catalog").StoreCatalog;

function renderCatalog(preferences: UserPreferenceMap = {}) {
  renderWithProviders(
    <UserPreferencesProvider preferences={preferences}>
      <StoreCatalog products={STORE_PRODUCTS} />
    </UserPreferencesProvider>,
  );
}

describe("StoreCatalog", () => {
  before(async () => {
    mock.module("@/components/preferences/actions", { namedExports: { sa_setUserPreference } });
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
    ({ StoreCatalog } = await import("./store-catalog"));
  });

  beforeEach(() => sa_setUserPreference.mock.resetCalls());

  it("shows every product as a card, with its kind, genre, contents and price", () => {
    renderCatalog();
    expect(screen.getAllByRole("article")).toHaveLength(STORE_PRODUCTS.length);
    const card = screen.getByRole("article", { name: "The Lighthouse at Carrow Point" });
    expect(within(card).getByText("Adventure")).toBeInTheDocument();
    expect(within(card).getByText("Horror")).toBeInTheDocument();
    expect(
      within(card).getByText("Call of Cthulhu 7e · 40 pages · 2 sessions"),
    ).toBeInTheDocument();
    expect(within(card).getByText("$9.99")).toBeInTheDocument();
    expect(within(card).getByText("Coming soon")).toBeInTheDocument();
  });

  it("narrows the products as the search is typed, and says when nothing matches", async () => {
    const user = userEvent.setup();
    renderCatalog();
    const search = screen.getByRole("searchbox", { name: "Search the store" });

    await user.type(search, "weird image");
    const names = screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"));
    expect(names).toEqual(["The Unravelled City", "Impossible Geometries", "Dream Bazaar"]);

    await user.clear(search);
    await user.type(search, "nothing sells this");
    expect(screen.queryAllByRole("article")).toEqual([]);
    expect(screen.getByText("Nothing in the store matches that search.")).toBeInTheDocument();
  });

  it("switches to a list, kept as the user's preference", async () => {
    const user = userEvent.setup();
    renderCatalog();

    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "store.view",
      value: "list",
    });
    expect(screen.queryAllByRole("article")).toEqual([]);
    const row = screen.getByRole("row", { name: "Kingdoms of the Old Road" });
    const cells = within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells.slice(1)).toEqual(["Image pack", "Fantasy", "Any", "60 images", "$14.99"]);
  });

  it("opens in the list when that was the user's choice", () => {
    renderCatalog({ "store.view": "list" });
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Product",
      "Type",
      "Genre",
      "System",
      "Contents",
      "Price",
    ]);
  });
});
