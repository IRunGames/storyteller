import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  // signIn.anonymous(), for a guest joining by link (app/(public)/join).
  plugins: [anonymousClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
