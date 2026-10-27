"use client";

import { useState } from "react";
import { HStack, IconButton, Portal, Stack, Text, Tooltip, Wrap } from "@chakra-ui/react";
import { X } from "lucide-react";
import type { LikedSystem } from "@/lib/profile";
import { MAX_LIKED_SYSTEMS } from "@/lib/profile-schemas";
import { sa_removeLikedSystem } from "./actions";
import { ProfileAddSystemPopover } from "./profile-add-system-popover";

type Props = { initialSystems: LikedSystem[] };

/**
 * The Systems tab: the systems the user likes, each with a button to take it
 * off, and + Add System to search for more. Each action hands back the whole
 * list, which replaces what is shown, so the order is always the server's.
 */
export function ProfileSystemsTab({ initialSystems }: Props) {
  const [systems, setSystems] = useState(initialSystems);
  const [error, setError] = useState<string | null>(null);

  async function remove(system: LikedSystem) {
    setError(null);
    try {
      const result = await sa_removeLikedSystem(system.idSystem);
      if (result.ok) setSystems(result.systems);
    } catch {
      setError(`${system.label} could not be removed. Try again.`);
    }
  }

  return (
    <Stack gap="4" rounded="xl" bg="bg.muted" borderWidth="1px" p="5">
      <HStack justify="space-between" align="flex-start" gap="4">
        <Stack gap="0">
          <Text textStyle="lg" fontWeight="semibold">
            Systems I like
          </Text>
          <Text textStyle="sm" color="fg.muted">
            Add up to {MAX_LIKED_SYSTEMS} systems
          </Text>
        </Stack>
        <ProfileAddSystemPopover onAdded={setSystems} />
      </HStack>

      {error && (
        <Text role="alert" textStyle="sm" color="fg.error">
          {error}
        </Text>
      )}

      {systems.length === 0 ? (
        <Text color="fg.muted">No systems yet.</Text>
      ) : (
        <Wrap as="ul" aria-label="Systems I like" listStyleType="none" gap="2">
          {systems.map((system) => (
            <HStack
              as="li"
              key={system.idSystem}
              gap="1"
              pl="3"
              pr="1"
              py="1"
              rounded="full"
              bg="bg.emphasized"
              textStyle="sm"
            >
              <Text>{system.label}</Text>
              <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
                <Tooltip.Trigger asChild>
                  <IconButton
                    aria-label={`Remove ${system.label}`}
                    size="2xs"
                    variant="ghost"
                    rounded="full"
                    onClick={() => void remove(system)}
                  >
                    <X />
                  </IconButton>
                </Tooltip.Trigger>
                <Portal>
                  <Tooltip.Positioner>
                    <Tooltip.Content>Remove</Tooltip.Content>
                  </Tooltip.Positioner>
                </Portal>
              </Tooltip.Root>
            </HStack>
          ))}
        </Wrap>
      )}
    </Stack>
  );
}
