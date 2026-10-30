import type { Metadata } from "next";
import { safeRedirect } from "@/lib/safe-redirect";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up · Storyteller",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[]; email?: string | string[] }>;
}) {
  const { redirectTo, email } = await searchParams;

  // An invitation's page (/invite/[token]) sends the invited address along
  // so the field starts filled. It is only a starting value: the account
  // may be made under any address, since the invitation's token is what
  // is redeemed.
  const prefill = (Array.isArray(email) ? email[0] : email)?.slice(0, 254) ?? "";

  return <SignupForm redirectTo={safeRedirect(redirectTo)} email={prefill} />;
}
