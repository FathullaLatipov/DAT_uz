import { PageLoader } from "@/components/ui/page-loader";
import { getI18n } from "@/i18n/server";

export default async function Loading() {
  const { t } = await getI18n();
  return <PageLoader label={t("common.loadingAria")} />;
}
