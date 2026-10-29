import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  // Types a guest's session (isAnonymous). A guest is made on the server,
  // by sa_joinAsGuest; the plugin's signIn.anonymous() is closed over HTTP.
  plugins: [anonymousClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
