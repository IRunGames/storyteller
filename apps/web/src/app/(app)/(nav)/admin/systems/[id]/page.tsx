import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@chakra-ui/react";
import { SystemStatBlockEditor } from "@/components/admin/system-stat-block-editor";
import { requireUser } from "@/lib/authorize";
import { USER_TYPES } from "@/lib/user-types";
import { sa_getAdminSystem } from "../actions";

export const metadata: Metadata = {
  title: "System · Storyteller",
};

// One system's stat block definition in its editor. The gate is the Systems
// page's; a system that is not there lands on the not-found page as anyone
// short of an administrator does.
export default async function SystemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.isAnonymous || user.idUserType > USER_TYPES.administrator) notFound();

  const { id } = await params;
  if (!/^-?\d+$/.test(id)) notFound();
  const system = await sa_getAdminSystem(Number(id));
  if (!system) notFound();

  return (
    <Container maxW="6xl" py="8">
      <SystemStatBlockEditor system={system} />
    </Container>
  );
}
