/**
 * The s_user_types rows whose accounts get the table's diagnostics panel:
 * -2 Unpaid Storyteller, -3 Paid Storyteller and -100 Administrator, the
 * seed's negative ids (db/migrations/20260911161847_add_users_id_user_type_fk.sql).
 * A player (-1, the default) sees nothing of it. The panel shows what comes
 * over the story's MQTT topic, which is the storyteller's own material and
 * a tool for seeing it arrive, not something a player needs.
 */
export const DIAGNOSTIC_USER_TYPES: readonly number[] = [-2, -3, -100];

export function canSeeDiagnostics(idUserType: number): boolean {
  return DIAGNOSTIC_USER_TYPES.includes(idUserType);
}
