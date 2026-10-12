"use client";

import { useEffect } from "react";
import { CloudOff } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui/primitives";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <Card className="mx-auto max-w-xl">
      <EmptyState
        icon={<CloudOff className="h-5 w-5" />}
        title="We couldn't load this right now"
        body="Something went wrong on our side. Try again in a moment — your data is safe."
        actions={<Button onClick={reset}>Try again</Button>}
      />
    </Card>
  );
}
