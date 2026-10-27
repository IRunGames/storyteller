import { z } from "zod";

// Shared by the chat panel and the actions that save a line, so the client
// and the server refuse the same things.
export const chatTextSchema = z
  .string()
  .trim()
  .min(1, "Say something first.")
  .max(2000, "Keep it under 2000 characters.");
