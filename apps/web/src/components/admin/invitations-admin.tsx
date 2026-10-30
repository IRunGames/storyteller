"use client";

import { useCallback, useState } from "react";
import { Card, Heading, Stack, Text } from "@chakra-ui/react";
import type { AdminInvitation } from "@/app/(app)/(nav)/admin/invitations/actions";
import { InvitationsTable } from "./invitations-table";
import { NewInvitationForm } from "./new-invitation-form";

/**
 * The body of the administrators' Invitations page: the New invitation form
 * above the table of every invitation. The rows live here so a new, edited
 * or deleted invitation shows at once without reloading the list.
 */
export function InvitationsAdmin({ initial }: { initial: AdminInvitation[] }) {
  const [rows, setRows] = useState(initial);

  // Stable, since the table's columns are memoised on them.
  const onChanged = useCallback(
    (changed: AdminInvitation) =>
      setRows((current) =>
        current.map((row) => (row.idInvitation === changed.idInvitation ? changed : row)),
      ),
    [],
  );
  const onDeleted = useCallback(
    (idInvitation: number) =>
      setRows((current) => current.filter((row) => row.idInvitation !== idInvitation)),
    [],
  );

  return (
    <Stack gap="8">
      <Stack gap="1">
        <Heading size="2xl">Invitations</Heading>
        <Text color="fg.muted">
          Invite someone to Storyteller with a paid account, and look after every invitation
          storytellers and administrators have sent.
        </Text>
      </Stack>

      <Card.Root>
        <Card.Header>
          <Heading size="md">New invitation</Heading>
        </Card.Header>
        <Card.Body>
          <NewInvitationForm onInvited={(row) => setRows((current) => [row, ...current])} />
        </Card.Body>
      </Card.Root>

      <InvitationsTable rows={rows} onChanged={onChanged} onDeleted={onDeleted} />
    </Stack>
  );
}
