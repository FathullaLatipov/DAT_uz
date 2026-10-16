import { Skeleton } from "@/components/ui/primitives";
import { getI18n } from "@/i18n/server";

export default async function Loading() {
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-[1400px] space-y-5" aria-busy="true" aria-label={t("common.loadingAria")}>
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-72" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}
