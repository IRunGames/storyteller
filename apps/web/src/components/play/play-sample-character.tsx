"use client";

import type { ReactNode } from "react";
import { Accordion, Avatar, Badge, HStack, Stack, Text } from "@chakra-ui/react";
import { Eye, Music, Store } from "lucide-react";

// What the character space will hold once characters exist: the player's
// character with a portrait or initials, a name and a descriptor, and one
// fold per ability that opens on what it does. Everything here is made up,
// and the badge says so, so nobody mistakes it for their own character.
const SAMPLE = {
  name: "David Williams",
  descriptor: "Curios Shop Owner",
  abilities: [
    {
      value: "shopkeeper",
      icon: <Store />,
      name: "Shopkeeper",
      text: "Knows what a thing is worth and who would want it, and has a back room full of oddities to prove it.",
    },
    {
      value: "seer",
      icon: <Eye />,
      name: "Seer +",
      text: "Catches glimpses of what is about to happen, and sees what others have hidden in plain sight.",
    },
    {
      value: "dj",
      icon: <Music />,
      name: "DJ",
      text: "Can read a room and change its mood with the right track at the right moment.",
    },
  ] satisfies { value: string; icon: ReactNode; name: string; text: string }[],
};

export function PlaySampleCharacter() {
  return (
    <Stack as="article" aria-label="Sample character" gap="3">
      <HStack gap="3" align="center">
        {/* The orange palette is the image the layout was drawn from: a warm
            tint behind dark initials. */}
        <Avatar.Root size="xl" colorPalette="orange" variant="subtle">
          <Avatar.Fallback name={SAMPLE.name} />
        </Avatar.Root>
        <Stack gap="0" minW="0">
          <Text textStyle="lg" fontWeight="bold" truncate>
            {SAMPLE.name}
          </Text>
          <Text color="fg.muted" truncate>
            {SAMPLE.descriptor}
          </Text>
        </Stack>
        <Badge size="sm" variant="outline" ms="auto" alignSelf="start">
          Sample character
        </Badge>
      </HStack>

      {/* Each ability its own bordered fold with space between, rather than
          one enclosed block, as the image draws them. */}
      <Accordion.Root collapsible multiple variant="plain">
        <Stack gap="2">
          {SAMPLE.abilities.map((ability) => (
            <Accordion.Item
              key={ability.value}
              value={ability.value}
              borderWidth="1px"
              rounded="lg"
              px="3"
            >
              <Accordion.ItemTrigger>
                <HStack gap="3" flex="1" color="fg.muted">
                  {ability.icon}
                  <Text color="fg" fontWeight="medium">
                    {ability.name}
                  </Text>
                </HStack>
                <Accordion.ItemIndicator />
              </Accordion.ItemTrigger>
              <Accordion.ItemContent>
                <Accordion.ItemBody textStyle="sm" color="fg.muted">
                  {ability.text}
                </Accordion.ItemBody>
              </Accordion.ItemContent>
            </Accordion.Item>
          ))}
        </Stack>
      </Accordion.Root>
    </Stack>
  );
}
