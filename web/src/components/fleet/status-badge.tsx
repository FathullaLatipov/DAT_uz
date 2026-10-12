import { label } from "@/server/domain/enums";
import { Badge } from "../ui/primitives";

const TONE: Record<string, "pos" | "info" | "warn" | "neutral" | "brand"> = {
  AVAILABLE: "pos",
  LOADING: "brand",
  IN_TRANSIT: "info",
  UNLOADING: "brand",
  MAINTENANCE: "warn",
  OFFLINE: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={TONE[status] ?? "neutral"}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label(status)}
    </Badge>
  );
}
