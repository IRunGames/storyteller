import type { Metadata } from "next";
import { safeRedirect } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · Storyteller",
};

// A Server Component reads redirectTo so the client form never needs
// useSearchParams (and the Suspense boundary that would come with it).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  const { redirectTo } = await searchParams;

  return <LoginForm redirectTo={safeRedirect(redirectTo)} />;
}
