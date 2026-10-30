import { USER_TYPES } from "@/lib/user-types";

/**
 * The s_user_types rows whose accounts get the table's diagnostics panel:
 * the storytellers, unpaid and paid, and administrators. A player, paid or
 * not, sees nothing of it. The panel shows what comes
 * over the story's MQTT topic, which is the storyteller's own material and
 * a tool for seeing it arrive, not something a player needs.
 */
export const DIAGNOSTIC_USER_TYPES: readonly number[] = [
  USER_TYPES.unpaidStoryteller,
  USER_TYPES.paidStoryteller,
  USER_TYPES.administrator,
];

export function canSeeDiagnostics(idUserType: number): boolean {
  return DIAGNOSTIC_USER_TYPES.includes(idUserType);
}
