"use client";

import { useState } from "react";
import NextLink from "next/link";
import {
  Box,
  Heading,
  HStack,
  IconButton,
  Input,
  Portal,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { Pencil } from "lucide-react";
import type { AdminSystem } from "./actions";
import { DeleteSystemButton } from "./delete-system-button";
import { NewSystemDialog } from "./new-system-dialog";

/**
 * The body of the administrators' Systems page: the New system button, and
 * a search box over the table of every system, each with the size of its stat block definition
 * (blank rather than 0, so the few systems with one stand out) and a pencil
 * to its editor. The rows all came with the page, since the
 * table is a hundred-odd seeded systems and whatever storytellers add, so
 * the search is a filter here rather than a query, unlike the Users page's.
 * The rows are held in state so a new system shows, and a deleted one goes,
 * without a reload.
 */
export function SystemsAdmin({ systems: initial }: { systems: AdminSystem[] }) {
  const [systems, setSystems] = useState(initial);
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? systems.filter((system) => system.label.toLowerCase().includes(needle))
    : systems;

  // The rows came sorted by label, so a new one goes in before the first
  // label after its own rather than at the end, where it would be lost.
  function add(system: AdminSystem) {
    setSystems((current) => {
      const at = current.findIndex((row) => row.label.localeCompare(system.label) > 0);
      return at < 0 ? [...current, system] : current.toSpliced(at, 0, system);
    });
  }

  return (
    <Stack gap="6">
      <HStack justify="space-between" align="flex-start" gap="4">
        <Stack gap="1">
          <Heading size="2xl">Systems</Heading>
          <Text color="fg.muted">
            Every game system a story can be run in, and the stat block each one gives its elements.
          </Text>
        </Stack>
        <NewSystemDialog onCreated={add} />
      </HStack>

      <Box>
        <HStack gap="3" mb="4">
          <Input
            type="search"
            aria-label="Search systems"
            placeholder="Search by name, edition or setting"
            maxW="sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </HStack>

        <Table.ScrollArea borderWidth="1px" rounded="md">
          <Table.Root size="sm" aria-label="Systems">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>System</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Groups</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Stats</Table.ColumnHeader>
                <Table.ColumnHeader w="1" />
                <Table.ColumnHeader w="1" />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {visible.map((system) => (
                <Table.Row key={system.idSystem}>
                  <Table.Cell>{system.label}</Table.Cell>
                  <Table.Cell textAlign="end">{system.groupCount || null}</Table.Cell>
                  <Table.Cell textAlign="end">{system.statCount || null}</Table.Cell>
                  <Table.Cell>
                    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
                      <Tooltip.Trigger asChild>
                        <IconButton
                          asChild
                          aria-label={`Edit the stat block of ${system.label}`}
                          variant="ghost"
                          size="xs"
                        >
                          <NextLink href={`/admin/systems/${system.idSystem}`}>
                            <Pencil />
                          </NextLink>
                        </IconButton>
                      </Tooltip.Trigger>
                      <Portal>
                        <Tooltip.Positioner>
                          <Tooltip.Content>Edit stat block</Tooltip.Content>
                        </Tooltip.Positioner>
                      </Portal>
                    </Tooltip.Root>
                  </Table.Cell>
                  <Table.Cell>
                    <DeleteSystemButton
                      system={system}
                      onDeleted={() =>
                        setSystems((current) =>
                          current.filter((row) => row.idSystem !== system.idSystem),
                        )
                      }
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Table.ScrollArea>

        {visible.length === 0 && (
          <Text color="fg.muted" mt="4">
            {needle ? "No systems match." : "No systems yet."}
          </Text>
        )}
      </Box>
    </Stack>
  );
}
