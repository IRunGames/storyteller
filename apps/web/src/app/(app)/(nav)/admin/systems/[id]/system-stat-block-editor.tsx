"use client";

import {
  sa_setSystemStatBlockDefinition,
  type AdminSystemDetail,
} from "@/app/(app)/(nav)/admin/systems/actions";
import { StatBlockDefinitionEditor } from "@/components/stat-blocks/stat-block-definition-editor";

/** The system's stat block definition in the shared editor, saved over the system. */
export function SystemStatBlockEditor({ system }: { system: AdminSystemDetail }) {
  return (
    <StatBlockDefinitionEditor
      definition={system.definition}
      intro="The stat block every element run in this system can carry: its groups, and the stats in each."
      save={(definition) => sa_setSystemStatBlockDefinition(system.idSystem, definition)}
      back={{ href: "/admin/systems", label: "Back to systems" }}
    />
  );
}
