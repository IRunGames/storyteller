import { z } from "zod";

// Shared by the popover form (through zodResolver) and the submitFeedback
// action, so the client and the server refuse the same things.
export const feedbackSchema = z.object({
  // The form preselects thumbs up, so this only ever fails for a request the
  // form did not build; the message still reads sensibly if it does.
  isPositive: z.boolean({ error: "Pick thumbs up or thumbs down." }),
  feedback: z.string().trim().max(2000, "Keep it under 2000 characters."),
  // A pathname, never a full URL: the header reads it from usePathname(), so
  // anything else means the client sent something it should not have.
  pagePath: z.string().trim().min(1).max(500).startsWith("/"),
});

export type FeedbackValues = z.infer<typeof feedbackSchema>;
