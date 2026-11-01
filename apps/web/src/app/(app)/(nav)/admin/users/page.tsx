import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@chakra-ui/react";
import { UsersAdmin } from "@/components/admin/users-admin";
import { requireUser } from "@/lib/authorize";
import { defaultUserListQuery } from "@/lib/user-list-schemas";
import { USER_TYPES } from "@/lib/user-types";
import { sa_listUserTypes, sa_listUsers } from "./actions";

export const metadata: Metadata = {
  title: "Users · Storyteller",
};

// The administrators' Users page, behind the menu bar's wrench: every
// account, to search, sort, filter by status and type, and page through.
// Anyone short of an administrator gets the not-found page rather than a
// refusal, so the page does not say it exists; both actions check again.
// The first page is loaded here so it arrives with the page; the browser
// asks sa_listUsers for every page after it.
export default async function UsersPage() {
  const user = await requireUser();
  if (user.isAnonymous || user.idUserType > USER_TYPES.administrator) notFound();

  const types = await sa_listUserTypes();
  const initial = await sa_listUsers(defaultUserListQuery(types.map((type) => type.idUserType)));

  return (
    <Container maxW="6xl" py="8">
      <UsersAdmin types={types} initial={initial} />
    </Container>
  );
}
