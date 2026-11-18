import { describe, it } from "node:test";
import { expect } from "expect";
import { STORE_PRODUCTS, formatPrice, matchesStoreSearch } from "./store-products";

const titles = (search: string) =>
  STORE_PRODUCTS.filter((product) => matchesStoreSearch(product, search)).map((p) => p.title);

describe("store products", () => {
  it("has an image pack in every genre, adventures for several systems, and unique ids", () => {
    for (const genre of ["Fantasy", "Sci-Fi", "Horror", "Weird"]) {
      expect(STORE_PRODUCTS.some((p) => p.kind === "IMAGE_PACK" && p.genre === genre)).toBe(true);
    }
    const systems = new Set(STORE_PRODUCTS.flatMap((p) => (p.system ? [p.system] : [])));
    expect(systems.size).toBeGreaterThanOrEqual(3);
    expect(new Set(STORE_PRODUCTS.map((p) => p.id)).size).toBe(STORE_PRODUCTS.length);
  });

  it("finds a product by every word of the search, in any field, case set aside", () => {
    expect(titles("")).toHaveLength(STORE_PRODUCTS.length);
    expect(titles("horror adventure")).toEqual(["The Lighthouse at Carrow Point"]);
    expect(titles("CTHULHU")).toEqual(["The Lighthouse at Carrow Point"]);
    expect(titles("  neon  ")).toEqual(["Neon Arcology"]);
    expect(titles("nothing sells this")).toEqual([]);
  });

  it("writes a price in dollars", () => {
    expect(formatPrice(1499)).toBe("$14.99");
    expect(formatPrice(800)).toBe("$8.00");
  });
});
