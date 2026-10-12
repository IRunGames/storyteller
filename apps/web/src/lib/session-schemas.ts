import { z } from "zod";

// A session's title as the run page's header edits it. Optional, as the
// column is: an empty title clears it, and the header goes back to
// "Session 3".
export const sessionTitleSchema = z
  .string()
  .trim()
  .max(200, "Keep the title under 200 characters.")
  .transform((title) => title || null);
