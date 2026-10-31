import { z } from "zod";

/**
 * The feedback workflow's statuses, in the order the popover shows their
 * buttons (the seed holds the same three). Each is the kind of feedback, set
 * by the button picked.
 */
export const FEEDBACK_STATUSES = ["THUMBS_UP", "THUMBS_DOWN", "IDEA"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

// Shared by the popover form (through zodResolver) and the submitFeedback
// action, so the client and the server refuse the same things.
export const feedbackSchema = z.object({
  // The form preselects thumbs up, so this only ever fails for a request the
  // form did not build; the message still reads sensibly if it does.
  status: z.enum(FEEDBACK_STATUSES, { error: "Pick thumbs up, thumbs down or an idea." }),
  feedback: z.string().trim().max(2000, "Keep it under 2000 characters."),
  // A pathname, never a full URL: the header reads it from usePathname(), so
  // anything else means the client sent something it should not have.
  pagePath: z.string().trim().min(1).max(500).startsWith("/"),
});

export type FeedbackValues = z.infer<typeof feedbackSchema>;
