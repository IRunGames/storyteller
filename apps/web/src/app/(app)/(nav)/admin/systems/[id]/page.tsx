import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Heading, Stack } from "@chakra-ui/react";
import { SystemDetailsForm } from "./system-details-form";
import { SystemStatBlockEditor } from "./system-stat-block-editor";
import { requireUser } from "@/lib/authorize";
import { parseRouteId } from "@/lib/route-ids";
import { USER_TYPES } from "@/lib/user-types";
import { sa_getAdminSystem } from "../actions";

export const metadata: Metadata = {
  title: "System · Storyteller",
};

// One system: its own fields in a card, and its stat block definition in
// its editor under them. The gate is the Systems page's; a system that is
// not there lands on the not-found page as anyone short of an administrator
// does.
export default async function SystemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.isAnonymous || user.idUserType > USER_TYPES.administrator) notFound();

  const { id } = await params;
  const idSystem = parseRouteId(id);
  if (idSystem === null) notFound();
  const system = await sa_getAdminSystem(idSystem);
  if (!system) notFound();

  return (
    // Wider than the other pages: a stat's row holds up to nine fields, and
    // every one that fits on a line is one less wrap to read across.
    <Container maxW="7xl" py="8">
      <Stack gap="8">
        <Heading size="2xl">{system.label}</Heading>
        <SystemDetailsForm system={system} />
        <SystemStatBlockEditor system={system} />
      </Stack>
    </Container>
  );
}
