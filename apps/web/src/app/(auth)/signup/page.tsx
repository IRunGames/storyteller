import type { Metadata } from "next";
import { safeRedirect } from "@/lib/safe-redirect";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up · Storyteller",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  const { redirectTo } = await searchParams;

  return <SignupForm redirectTo={safeRedirect(redirectTo)} />;
}
