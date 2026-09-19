import { describe, it } from "node:test";
import { expect } from "expect";

import {
  MIN_PASSWORD_LENGTH,
  signInSchema,
  signUpSchema,
} from "./auth-schemas";

function messagesFor(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  if (result.success || !result.error) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

const good = {
  name: "Gandalf",
  email: "gandalf@irun.games",
  password: "speak-friend",
};

describe("signUpSchema", () => {
  it("accepts complete details and trims the name", () => {
    const result = signUpSchema.safeParse({ ...good, name: "  Gandalf  " });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(good);
  });

  it("trims surrounding whitespace off the email", () => {
    const result = signUpSchema.safeParse({
      ...good,
      email: "  gandalf@irun.games ",
    });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("gandalf@irun.games");
  });

  it("refuses a blank name", () => {
    const result = signUpSchema.safeParse({ ...good, name: "" });

    expect(messagesFor(result)).toEqual({ name: "Please enter your name." });
  });

  it("treats a whitespace-only name as blank", () => {
    const result = signUpSchema.safeParse({ ...good, name: "   " });

    expect(messagesFor(result)).toEqual({ name: "Please enter your name." });
  });

  it("refuses a blank email", () => {
    const result = signUpSchema.safeParse({ ...good, email: "" });

    expect(messagesFor(result)).toEqual({ email: "Please enter your email." });
  });

  it("refuses an email that is not an address", () => {
    const result = signUpSchema.safeParse({ ...good, email: "gandalf" });

    expect(messagesFor(result)).toEqual({
      email: "Please enter a valid email.",
    });
  });

  it("refuses a password shorter than the server minimum", () => {
    const result = signUpSchema.safeParse({ ...good, password: "short" });

    expect(messagesFor(result)).toEqual({
      password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  });

  it("reports every failing field at once", () => {
    const result = signUpSchema.safeParse({ name: "", email: "", password: "" });

    expect(Object.keys(messagesFor(result)).sort()).toEqual([
      "email",
      "name",
      "password",
    ]);
  });
});

describe("signInSchema", () => {
  it("accepts an email and a password", () => {
    const result = signInSchema.safeParse({
      email: "gandalf@irun.games",
      password: "speak-friend",
    });

    expect(result.success).toBe(true);
  });

  it("refuses a blank email", () => {
    const result = signInSchema.safeParse({ email: "", password: "x" });

    expect(messagesFor(result)).toEqual({ email: "Please enter your email." });
  });

  it("refuses a blank password", () => {
    const result = signInSchema.safeParse({
      email: "gandalf@irun.games",
      password: "",
    });

    expect(messagesFor(result)).toEqual({
      password: "Please enter your password.",
    });
  });

  it("does not judge the length of a sign-in password", () => {
    // Length is the server's business at sign-in. Refusing a short password
    // here would only tell an attacker what the minimum is before they hit
    // better-auth's uniform "invalid email or password".
    const result = signInSchema.safeParse({
      email: "gandalf@irun.games",
      password: "x",
    });

    expect(result.success).toBe(true);
  });
});
