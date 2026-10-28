import { z } from "zod";

/** The name a guest is known by at the table, from the join form. */
export const nicknameSchema = z
  .string()
  .trim()
  .min(1, "Pick a name to be known by.")
  .max(40, "Keep it to 40 characters.");

/** The join form's one field; sa_joinByLink checks the nickname again. */
export const joinSchema = z.object({ nickname: nicknameSchema });
export type JoinValues = z.infer<typeof joinSchema>;
