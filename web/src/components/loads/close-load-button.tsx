"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiCall } from "@/lib/client";
import { useI18n } from "@/i18n/client";
import { useDialog } from "../ui/dialog";
import { Button } from "../ui/primitives";

export function CloseLoadButton({ id }: { id: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const dialog = useDialog();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        if (!(await dialog.confirm({ title: t("board.closeTitle"), message: t("board.closeBody"), confirmText: t("board.markCovered") }))) return;
        setPending(true);
        try {
          await apiCall(`/api/loads/${id}`, "DELETE");
          router.refresh();
        } catch (e) {
          await dialog.alert({ message: (e as Error).message });
          setPending(false);
        }
      }}
    >
      {t("board.markCovered")}
    </Button>
  );
}
