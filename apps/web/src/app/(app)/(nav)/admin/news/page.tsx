import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@chakra-ui/react";
import { NewsAdmin } from "./news-admin";
import { requireUser } from "@/lib/authorize";
import { USER_TYPES } from "@/lib/user-types";
import { sa_listAdminNews } from "./actions";

export const metadata: Metadata = {
  title: "News · Storyteller",
};

// The administrators' News page, behind the menu bar's wrench: every
// announcement the home page has shown or will, to post, edit, archive and
// delete. Anyone short of an administrator gets the not-found page rather
// than a refusal, so the page does not say it exists, whether they came by
// the menu or typed the address; sa_listAdminNews checks again.
export default async function NewsPage() {
  const user = await requireUser();
  if (user.isAnonymous || user.idUserType > USER_TYPES.administrator) notFound();

  const news = await sa_listAdminNews();

  return (
    <Container maxW="6xl" py="8">
      <NewsAdmin initial={news} />
    </Container>
  );
}
