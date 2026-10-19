import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/format";

const TABS = [
  { href: "/app/admin", key: "overview" },
  { href: "/app/admin/verifications", key: "verifications" },
  { href: "/app/admin/brokers", key: "brokers" },
  { href: "/app/admin/loads", key: "loads" },
] as const;

/** Section switcher shared by the admin pages; `pending` is the number of verification requests waiting. */
export async function AdminTabs({ active, pending = 0 }: { active: (typeof TABS)[number]["key"]; pending?: number }) {
  const { m } = await getI18n();
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab.key === active ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {m.av.tabs[tab.key]}
          {tab.key === "verifications" && pending > 0 && <span className="rounded-full bg-brand px-1.5 py-px text-[11px] font-semibold text-brand-fg">{pending}</span>}
        </Link>
      ))}
    </nav>
  );
}
