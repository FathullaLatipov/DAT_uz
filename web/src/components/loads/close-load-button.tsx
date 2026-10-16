"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiCall } from "@/lib/client";
import { useI18n } from "@/i18n/client";
import { Button } from "../ui/primitives";

export function CloseLoadButton({ id }: { id: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        if (!confirm(t("board.closeConfirm"))) return;
        setPending(true);
        try {
          await apiCall(`/api/loads/${id}`, "DELETE");
          router.refresh();
        } catch (e) {
          alert((e as Error).message);
          setPending(false);
        }
      }}
    >
      {t("board.markCovered")}
    </Button>
  );
}
