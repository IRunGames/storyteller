import { z } from "zod";

/**
 * Shared by the signup form and the better-auth config in lib/auth.ts, so the
 * client-side check and the server's minPasswordLength cannot drift apart.
 */
export const MIN_PASSWORD_LENGTH = 8;

// The forms are noValidate, so these schemas are the only thing standing
// between an empty field and the server. Better Auth accepts name: "" (it
// only requires a string) and users.name NOT NULL is satisfied by "".
const name = z.string().trim().min(1, "Please enter your name.");

// pipe() only runs the email format check once the blank check has passed,
// so an empty field gets one message rather than two.
const email = z
  .string()
  .trim()
  .min(1, "Please enter your email.")
  .pipe(z.email("Please enter a valid email."));

export const signUpSchema = z.object({
  name,
  email,
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    ),
});

export type SignUpValues = z.infer<typeof signUpSchema>;

// Sign-in only asks that both fields are filled. Judging the password's
// length or the email's shape here would leak what the server checks before
// better-auth's uniform "invalid email or password" gets a chance to hide it.
export const signInSchema = z.object({
  email: z.string().trim().min(1, "Please enter your email."),
  password: z.string().min(1, "Please enter your password."),
});

export type SignInValues = z.infer<typeof signInSchema>;
