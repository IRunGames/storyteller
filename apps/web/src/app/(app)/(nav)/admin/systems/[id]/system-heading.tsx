import NextLink from "next/link";
import { Button, Heading, HStack } from "@chakra-ui/react";
import { ArrowLeft } from "lucide-react";

/**
 * The system page's top line: the system's name, and at the far end of the
 * line the way back to the Systems page, a go-back arrow before its words.
 * It sits here rather than beside the stat block's Save, where the story's
 * copy of the editor keeps its Back to story.
 */
export function SystemHeading({ label }: { label: string }) {
  return (
    <HStack justify="space-between" align="center" wrap="wrap" gap="4">
      <Heading size="2xl">{label}</Heading>
      <Button asChild variant="ghost" size="sm">
        <NextLink href="/admin/systems">
          <ArrowLeft /> Back to systems
        </NextLink>
      </Button>
    </HStack>
  );
}
