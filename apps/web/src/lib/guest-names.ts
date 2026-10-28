// The name offered to someone joining a story by its link without an
// account: an adjective and an animal, "Ferocious Hamster". It is only a
// suggestion in the join form, which they can change or roll again, so it
// needs to be fun and short rather than unique; nicknames are not unique
// anywhere else either.

export const GUEST_ADJECTIVES = [
  "Adventurous",
  "Bashful",
  "Bold",
  "Brave",
  "Cheerful",
  "Clumsy",
  "Cunning",
  "Curious",
  "Daring",
  "Dashing",
  "Dramatic",
  "Fearless",
  "Ferocious",
  "Fluffy",
  "Gallant",
  "Giddy",
  "Grumpy",
  "Heroic",
  "Hungry",
  "Jolly",
  "Lucky",
  "Majestic",
  "Mischievous",
  "Mysterious",
  "Nimble",
  "Noble",
  "Peculiar",
  "Plucky",
  "Quirky",
  "Reckless",
  "Sneaky",
  "Sleepy",
  "Sparkly",
  "Stubborn",
  "Suspicious",
  "Swashbuckling",
  "Thunderous",
  "Valiant",
  "Wandering",
  "Wily",
] as const;

export const GUEST_ANIMALS = [
  "Aardvark",
  "Alpaca",
  "Armadillo",
  "Badger",
  "Capybara",
  "Chameleon",
  "Chinchilla",
  "Ferret",
  "Flamingo",
  "Gecko",
  "Goose",
  "Hamster",
  "Hedgehog",
  "Ibex",
  "Jackalope",
  "Koala",
  "Lemur",
  "Llama",
  "Lobster",
  "Marmot",
  "Meerkat",
  "Mongoose",
  "Moose",
  "Narwhal",
  "Ocelot",
  "Otter",
  "Owl",
  "Pangolin",
  "Panda",
  "Platypus",
  "Puffin",
  "Quokka",
  "Raccoon",
  "Sloth",
  "Squid",
  "Tapir",
  "Toad",
  "Walrus",
  "Wombat",
  "Yak",
] as const;

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.floor(random() * list.length)];
}

/** "Adventurous Moose". `random` is Math.random unless a test fixes it. */
export function randomGuestName(random: () => number = Math.random): string {
  return `${pick(GUEST_ADJECTIVES, random)} ${pick(GUEST_ANIMALS, random)}`;
}
