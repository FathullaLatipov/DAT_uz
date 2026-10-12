import type { Metadata } from "next";
import { requireSession } from "@/server/auth/session";
import { Logo } from "@/components/logo";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Set up your fleet" };

export default async function OnboardingPage() {
  const s = await requireSession();
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-8">
        <Logo />
        <span className="text-sm text-muted">{s.user.name}</span>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <OnboardingWizard />
      </main>
    </div>
  );
}
