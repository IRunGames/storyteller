import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@chakra-ui/react";
import { InvitationsAdmin } from "@/components/admin/invitations-admin";
import { requireUser } from "@/lib/authorize";
import { USER_TYPES } from "@/lib/user-types";
import { sa_listInvitations } from "./actions";

export const metadata: Metadata = {
  title: "Invitations · Storyteller",
};

// The administrators' Invitations page, behind the menu bar's wrench: every
// invitation anyone has made, to search, edit, resend and delete, and the
// form for inviting someone to the app with a paid account. Anyone short of
// an administrator gets the not-found page rather than a refusal, so the
// page does not say it exists. sa_listInvitations checks again.
export default async function InvitationsPage() {
  const user = await requireUser();
  if (user.isAnonymous || user.idUserType > USER_TYPES.administrator) notFound();

  const invitations = await sa_listInvitations();

  return (
    <Container maxW="6xl" py="8">
      <InvitationsAdmin initial={invitations} />
    </Container>
  );
}
