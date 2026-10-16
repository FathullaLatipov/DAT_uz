import type { Metadata } from "next";
import { requireSession } from "@/server/auth/session";
import { Logo } from "@/components/logo";
import { getI18n } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { OnboardingWizard } from "./wizard";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("ob.title") };
}

export default async function OnboardingPage() {
  const s = await requireSession();
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-8">
        <Logo />
        <span className="flex items-center gap-2 text-sm text-muted"><LanguageSwitcher />{s.user.name}</span>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <OnboardingWizard />
      </main>
    </div>
  );
}
