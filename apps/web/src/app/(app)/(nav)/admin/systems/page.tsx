import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@chakra-ui/react";
import { SystemsAdmin } from "./systems-admin";
import { requireUser } from "@/lib/authorize";
import { USER_TYPES } from "@/lib/user-types";
import { sa_listAdminSystems } from "./actions";

export const metadata: Metadata = {
  title: "Systems · Storyteller",
};

// The administrators' Systems page, behind the menu bar's wrench: every game
// system, with how much of a stat block definition each has, and a pencil to
// its editor. Anyone short of an administrator gets the not-found page
// rather than a refusal, so the page does not say it exists; the action
// checks again.
export default async function SystemsPage() {
  const user = await requireUser();
  if (user.isAnonymous || user.idUserType > USER_TYPES.administrator) notFound();

  const systems = await sa_listAdminSystems();

  return (
    <Container maxW="6xl" py="8">
      <SystemsAdmin systems={systems} />
    </Container>
  );
}
