import { describe, it } from "node:test";
import { expect } from "expect";

import { GUEST_ADJECTIVES, GUEST_ANIMALS, randomGuestName } from "./guest-names";

describe("randomGuestName", () => {
  it("is an adjective then an animal from the lists", () => {
    for (let i = 0; i < 50; i++) {
      const [adjective, animal, ...rest] = randomGuestName().split(" ");
      expect(rest).toEqual([]);
      expect(GUEST_ADJECTIVES).toContain(adjective);
      expect(GUEST_ANIMALS).toContain(animal);
    }
  });

  it("reaches both ends of each list", () => {
    expect(randomGuestName(() => 0)).toBe(`${GUEST_ADJECTIVES[0]} ${GUEST_ANIMALS[0]}`);
    expect(randomGuestName(() => 0.9999)).toBe(
      `${GUEST_ADJECTIVES.at(-1)} ${GUEST_ANIMALS.at(-1)}`,
    );
  });
});
