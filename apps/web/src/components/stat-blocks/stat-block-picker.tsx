"use client";

import { Box, Button, Card, Heading, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { Plus } from "lucide-react";
import {
  isRepeating,
  STAT_FORMAT_LABELS,
  STAT_TYPE_LABELS,
  statLabel,
  type StatBlockDefinition,
  type StatGroupDefinition,
} from "@/lib/stat-blocks";

type Props = {
  definition: StatBlockDefinition;
  /** The names of the template's groups the holder already carries. */
  carried: string[];
  onAdd: (group: string) => void;
  onAddAll: () => void;
};

/**
 * The template's stat blocks a holder does not carry yet, each previewed as
 * a small card (its name and label, what it repeats by, and a line per stat
 * saying what the stat is), with an Add on each and an Add all above them
 * when there is more than one to add. Draws nothing once every block is
 * carried. What adding does is the caller's: the prep form puts the block's
 * starting values in its fields, the run panel's action writes them.
 */
export function StatBlockPicker({ definition, carried, onAdd, onAddAll }: Props) {
  const offered = definition.groups.filter((group) => !carried.includes(group.name));
  if (offered.length === 0) return null;
  return (
    <Stack gap="3" data-testid="stat-block-picker">
      <HStack justify="space-between" gap="3">
        <Heading as="h4" size="xs" color="fg.muted">
          Stat blocks to add
        </Heading>
        {offered.length > 1 && (
          <Button type="button" size="xs" variant="outline" onClick={onAddAll}>
            <Plus /> Add all
          </Button>
        )}
      </HStack>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="3">
        {offered.map((group) => (
          <PreviewCard key={group.name} group={group} onAdd={() => onAdd(group.name)} />
        ))}
      </SimpleGrid>
    </Stack>
  );
}

/** One stat as its preview line: the label it will show under, then what it is. */
function statLine(stat: StatGroupDefinition["stats"][number]): string {
  const parts = [STAT_TYPE_LABELS[stat.type].toLowerCase()];
  if (stat.format !== "") parts.push(STAT_FORMAT_LABELS[stat.format]);
  if (stat.roll !== "") parts.push(`rolls ${stat.roll}`);
  if (stat.static) parts.push("static");
  if (!stat.visible) parts.push("hidden");
  return parts.join(" · ");
}

function PreviewCard({ group, onAdd }: { group: StatGroupDefinition; onAdd: () => void }) {
  const title = group.label || group.name;
  const key = group.stats.find((stat) => stat.name === group.keyedBy);
  return (
    <Card.Root size="sm" data-testid={`stat-block-preview-${group.name}`}>
      <Card.Header>
        <HStack justify="space-between" gap="2" align="flex-start">
          <Box>
            <Heading as="h5" size="xs">
              {title}
            </Heading>
            {group.label && (
              <Text fontSize="xs" color="fg.muted">
                {group.name}
              </Text>
            )}
            {isRepeating(group) && (
              <Text fontSize="xs" fontStyle="italic" color="blue.fg">
                Repeats by {key ? statLabel(key) : group.keyedBy}
              </Text>
            )}
          </Box>
          <Button type="button" size="xs" variant="outline" onClick={onAdd}>
            <Plus /> Add {title}
          </Button>
        </HStack>
      </Card.Header>
      <Card.Body>
        <Stack as="ul" gap="0.5" listStyleType="none" fontSize="sm">
          {group.stats.map((stat) => (
            <Box as="li" key={stat.name}>
              <HStack gap="2">
                <Text as="span" fontWeight="medium">
                  {statLabel(stat)}
                </Text>
                <Text as="span" color="fg.muted">
                  {statLine(stat)}
                </Text>
              </HStack>
              {stat.description !== "" && (
                <Text fontSize="xs" color="fg.muted">
                  {stat.description}
                </Text>
              )}
            </Box>
          ))}
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}
