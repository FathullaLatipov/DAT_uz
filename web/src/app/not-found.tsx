import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui/primitives";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="mt-4 text-2xl font-semibold">{t("notFound.title")}</h1>
      <p className="max-w-sm text-muted">{t("notFound.body")}</p>
      <div className="flex gap-2">
        <LinkButton href="/app/loads">{t("notFound.loadBoard")}</LinkButton>
        <LinkButton href="/" variant="outline">{t("notFound.home")}</LinkButton>
      </div>
    </div>
  );
}
