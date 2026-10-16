"use client";

import { useEffect } from "react";
import { CloudOff } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui/primitives";
import { useI18n } from "@/i18n/client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => console.error(error), [error]);
  return (
    <Card className="mx-auto max-w-xl">
      <EmptyState
        icon={<CloudOff className="h-5 w-5" />}
        title={t("appError.title")}
        body={t("appError.body")}
        actions={<Button onClick={reset}>{t("appError.retry")}</Button>}
      />
    </Card>
  );
}
