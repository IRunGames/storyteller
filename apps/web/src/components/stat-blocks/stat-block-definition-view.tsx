import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import { joinRack } from "@/lib/stat-block-schemas";
import {
  isRepeating,
  STAT_FORMAT_LABELS,
  STAT_TYPE_LABELS,
  statLabel,
  type StatBlockDefinition,
  type StatDefinition,
} from "@/lib/stat-blocks";

/**
 * What a stat is, in one line after its name: its type, then only what sets
 * it apart from a plain stat of that type (a format, a rack's entries, a
 * formula, a roll, its starting roll, and the flags that are not the
 * default), so a short line means an ordinary stat.
 */
export function statSummary(stat: StatDefinition): string {
  return [
    STAT_TYPE_LABELS[stat.type],
    stat.format !== "" && STAT_FORMAT_LABELS[stat.format],
    stat.type === "rack" && joinRack(stat.rack),
    stat.type === "computed" && `= ${stat.computedAs}`,
    stat.roll !== "" && `rolls ${stat.roll}`,
    stat.initialRoll !== "" && `starts at ${stat.initialRoll}`,
    !stat.visible && "hidden at the table",
    stat.static && "static",
    stat.global && "rolled for all",
  ]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" · ");
}

/**
 * A stat block definition to read rather than change: each group by its
 * label, saying what it repeats by when it does, over its stats, each a
 * line of its label and what it is (statSummary), with its description
 * under it. For the story's page, where everyone may see the stat block
 * the story's elements carry and only the storyteller changes it, on its
 * own page. No hooks, so it renders on the server as well as in a client
 * component.
 */
export function StatBlockDefinitionView({
  definition,
  mutedColor,
}: {
  definition: StatBlockDefinition;
  /** The secondary text's colour, which differs on a cover (StoryPanel). */
  mutedColor: string;
}) {
  if (definition.groups.length === 0) {
    return <Text color={mutedColor}>No stats yet.</Text>;
  }
  return (
    <Stack gap="4">
      {definition.groups.map((group) => {
        const key = group.stats.find((stat) => stat.name === group.keyedBy);
        return (
          <Stack key={group.name} gap="1">
            <HStack wrap="wrap" gap="3">
              <Text fontWeight="semibold">{group.label || group.name}</Text>
              {isRepeating(group) && (
                <Text fontSize="sm" fontStyle="italic" color={mutedColor}>
                  Repeats by {key ? statLabel(key) : group.keyedBy}
                </Text>
              )}
            </HStack>
            {group.stats.length === 0 ? (
              <Text fontSize="sm" color={mutedColor}>
                No stats yet.
              </Text>
            ) : (
              <Box as="ul" listStyleType="none" ps="0" m="0">
                {group.stats.map((stat) => (
                  <Box as="li" key={stat.name} fontSize="sm" py="0.5">
                    <HStack gap="2" wrap="wrap">
                      <Text>{statLabel(stat)}</Text>
                      <Text color={mutedColor}>{statSummary(stat)}</Text>
                    </HStack>
                    {stat.description && (
                      <Text color={mutedColor} fontStyle="italic">
                        {stat.description}
                      </Text>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
