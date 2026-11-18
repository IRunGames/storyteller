/**
 * The Store's products. A placeholder: the store is not open, nothing is
 * sold, and these are made up to show what it will offer, so they live here
 * as a constant rather than in a table. When the store opens they move to
 * the database and a server action, and this file goes.
 */

/** What a product is: a pack of pictures for scenes and covers, or a ready-made adventure. */
export type StoreProductKind = "IMAGE_PACK" | "ADVENTURE";

/** The four moods the image packs come in; an adventure is filed under one too. */
export const STORE_GENRES = ["Fantasy", "Sci-Fi", "Horror", "Weird"] as const;
export type StoreGenre = (typeof STORE_GENRES)[number];

export type StoreProduct = {
  id: string;
  title: string;
  kind: StoreProductKind;
  genre: StoreGenre;
  /** The game system an adventure is written for; null for an image pack, which suits any. */
  system: string | null;
  /** What is in it, in a few words: "60 images", "64 pages · 3 to 4 sessions". */
  contents: string;
  description: string;
  /** In US cents, so no sum is ever a float. */
  priceCents: number;
};

/** A product kind as a reader sees it. */
export const STORE_KIND_LABELS: Record<StoreProductKind, string> = {
  IMAGE_PACK: "Image pack",
  ADVENTURE: "Adventure",
};

export const STORE_PRODUCTS: readonly StoreProduct[] = [
  {
    id: "old-road-kingdoms",
    title: "Kingdoms of the Old Road",
    kind: "IMAGE_PACK",
    genre: "Fantasy",
    system: null,
    contents: "60 images",
    description:
      "Villages, keeps, river crossings and roadside taverns, for the miles between one adventure and the next.",
    priceCents: 1499,
  },
  {
    id: "dungeon-depths",
    title: "Dungeon Depths",
    kind: "IMAGE_PACK",
    genre: "Fantasy",
    system: null,
    contents: "48 images",
    description:
      "Flooded crypts, collapsed halls and treasure rooms, lit by torchlight and the occasional glowing rune.",
    priceCents: 1299,
  },
  {
    id: "dragons-and-calamities",
    title: "Dragons and Other Calamities",
    kind: "IMAGE_PACK",
    genre: "Fantasy",
    system: null,
    contents: "24 portraits",
    description:
      "Wyrms, giants and things from the deep woods, each drawn to fill a scene's cover.",
    priceCents: 999,
  },
  {
    id: "derelict-stations",
    title: "Derelict Stations",
    kind: "IMAGE_PACK",
    genre: "Sci-Fi",
    system: null,
    contents: "50 images",
    description:
      "Airlocks, cold reactor rooms and corridors where the emergency lights still blink.",
    priceCents: 1499,
  },
  {
    id: "neon-arcology",
    title: "Neon Arcology",
    kind: "IMAGE_PACK",
    genre: "Sci-Fi",
    system: null,
    contents: "40 images",
    description: "A city stacked a mile high: night markets, sky bridges and rain on glass.",
    priceCents: 1299,
  },
  {
    id: "frontier-worlds",
    title: "Frontier Worlds",
    kind: "IMAGE_PACK",
    genre: "Sci-Fi",
    system: null,
    contents: "36 images",
    description:
      "Alien skylines, settlements under domes, and landing sites at the edge of the map.",
    priceCents: 1199,
  },
  {
    id: "hollow-manor",
    title: "Hollow Manor",
    kind: "IMAGE_PACK",
    genre: "Horror",
    system: null,
    contents: "42 images",
    description:
      "One house, room by room: the nursery, the cellar, the portrait gallery where the eyes follow.",
    priceCents: 1299,
  },
  {
    id: "fog-on-the-moor",
    title: "Fog on the Moor",
    kind: "IMAGE_PACK",
    genre: "Horror",
    system: null,
    contents: "30 images",
    description: "Standing stones, drowned lanes and lamplit inns, all half hidden by the mist.",
    priceCents: 999,
  },
  {
    id: "things-in-the-dark",
    title: "Things in the Dark",
    kind: "IMAGE_PACK",
    genre: "Horror",
    system: null,
    contents: "24 portraits",
    description:
      "Creatures seen only at the edge of the lantern's light, for the moment of reveal.",
    priceCents: 999,
  },
  {
    id: "unravelled-city",
    title: "The Unravelled City",
    kind: "IMAGE_PACK",
    genre: "Weird",
    system: null,
    contents: "40 images",
    description:
      "Streets that fold back on themselves, stairs to nowhere, and markets that sell yesterday.",
    priceCents: 1299,
  },
  {
    id: "impossible-geometries",
    title: "Impossible Geometries",
    kind: "IMAGE_PACK",
    genre: "Weird",
    system: null,
    contents: "32 images",
    description: "Machines older than the world and landscapes no map can hold.",
    priceCents: 1199,
  },
  {
    id: "dream-bazaar",
    title: "Dream Bazaar",
    kind: "IMAGE_PACK",
    genre: "Weird",
    system: null,
    contents: "28 portraits",
    description:
      "Traders, oracles and passers-by who are not quite people, for every odd encounter.",
    priceCents: 899,
  },
  {
    id: "ember-king",
    title: "Ashes of the Ember King",
    kind: "ADVENTURE",
    genre: "Fantasy",
    system: "Dungeons & Dragons 5e",
    contents: "96 pages · 6 to 8 sessions",
    description:
      "A dead king's fire wakes under the mountain, and the town that buried him is the first to burn.",
    priceCents: 1999,
  },
  {
    id: "carrow-point",
    title: "The Lighthouse at Carrow Point",
    kind: "ADVENTURE",
    genre: "Horror",
    system: "Call of Cthulhu 7e",
    contents: "40 pages · 2 sessions",
    description:
      "The keeper stopped writing in his log three weeks ago. The light has not stopped turning.",
    priceCents: 999,
  },
  {
    id: "glass-orchard",
    title: "The Glass Orchard",
    kind: "ADVENTURE",
    genre: "Weird",
    system: "Daggerheart",
    contents: "32 pages · one session",
    description:
      "Fruit that shows the future grows in an orchard nobody planted. Someone is picking it.",
    priceCents: 799,
  },
  {
    id: "starfall-salvage",
    title: "Starfall Salvage",
    kind: "ADVENTURE",
    genre: "Sci-Fi",
    system: "Starfinder 2e",
    contents: "56 pages · 3 to 4 sessions",
    description:
      "A wrecked colony ship, three rival crews, and a cargo hold that should have been empty.",
    priceCents: 1499,
  },
  {
    id: "the-quiet-heist",
    title: "The Quiet Heist",
    kind: "ADVENTURE",
    genre: "Weird",
    system: "Blades in the Dark",
    contents: "28 pages · 2 to 3 sessions",
    description: "Steal a sound from a vault where nothing has been heard for a hundred years.",
    priceCents: 899,
  },
  {
    id: "sunken-temple",
    title: "The Sunken Temple of Ys",
    kind: "ADVENTURE",
    genre: "Fantasy",
    system: "Pathfinder 2e",
    contents: "72 pages · 4 to 5 sessions",
    description:
      "The tide goes out farther each night, and with it, the bells of a drowned city ring.",
    priceCents: 1799,
  },
];

/** A price in US dollars, as the Store writes it: "$14.99". */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/**
 * Whether a product answers the Store's search: every word of the search,
 * case set aside, is somewhere in its title, description, kind, genre,
 * system or contents, so "horror adventure" finds the horror adventures.
 * An empty search matches everything.
 */
export function matchesStoreSearch(product: StoreProduct, search: string): boolean {
  const haystack = [
    product.title,
    product.description,
    STORE_KIND_LABELS[product.kind],
    product.genre,
    product.system ?? "",
    product.contents,
  ]
    .join(" ")
    .toLowerCase();
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
