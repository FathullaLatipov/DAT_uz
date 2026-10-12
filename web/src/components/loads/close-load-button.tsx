"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiCall } from "@/lib/client";
import { Button } from "../ui/primitives";

export function CloseLoadButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        if (!confirm("Mark this load as covered? It will disappear from the catalog.")) return;
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
      Mark covered
    </Button>
  );
}
