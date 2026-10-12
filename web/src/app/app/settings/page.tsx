import type { Metadata } from "next";
import { Check, Send } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { can, PLAN_FEATURES } from "@/server/auth/permissions";
import { db, parseJson } from "@/server/db";
import { label } from "@/server/domain/enums";
import { notifierStatus } from "@/server/services/alerts";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { cn } from "@/lib/format";

export const metadata: Metadata = { title: "Settings" };

const PLAN_COPY: Record<string, string[]> = {
  FREE: ["Basic load search", "1 truck"],
  PRO: ["AI matching & explanations", "Advanced filters", "Alerts", "Profit calculator", "Up to 3 trucks"],
  FLEET: ["Everything in Pro", "Fleet analytics", "Dispatcher tools", "Team members", "Up to 100 trucks"],
  ENTERPRISE: ["API access", "Advanced analytics", "Integrations", "Dedicated support"],
};

export default async function SettingsPage() {
  const s = await requireSession();
  const [pref, routes, members] = await Promise.all([
    db.orgPreference.findUnique({ where: { orgId: s.orgId } }),
    db.preferredRoute.findMany({ where: { orgId: s.orgId, destCityId: { not: null } } }),
    db.membership.findMany({ where: { orgId: s.orgId }, include: { user: { select: { name: true, email: true } } } }),
  ]);
  const telegram = notifierStatus().find((n) => n.channel === "TELEGRAM")!;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Settings" subtitle={`${s.org.name} · your role: ${label(s.role)}`} />
      <Card>
        <CardHeader title="Matching preferences" subtitle="These power the AI ranking for every truck in your fleet." />
        <div className="px-4 pb-5 sm:px-5">
          <PreferencesForm
            readOnly={!can(s, "settings:write")}
            initial={{
              minRatePerKmUsd: pref?.minRatePerKmUsd?.toString() ?? "",
              maxDeadheadKm: pref?.maxDeadheadKm ?? 150,
              preferredCargo: parseJson(pref?.preferredCargo, []),
              preferredCountries: parseJson(pref?.preferredCountries, []),
              paymentTerms: parseJson(pref?.paymentTerms, []),
              routes: routes.map((r) => ({ originCityId: r.originCityId, destCityId: r.destCityId! })),
            }}
          />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Telegram" />
          <div className="px-4 pb-5 text-sm sm:px-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info"><Send className="h-4 w-4" /></div>
              <div>
                <p>Get new high-value loads, AI recommendations, saved-search alerts and truck status in Telegram — with quick actions.</p>
                <p className="mt-2 text-muted">
                  {telegram.configured ? "Bot is configured. Linking your account is coming next." : "The Telegram bot isn't configured on this server yet (set TELEGRAM_BOT_TOKEN). Alerts are delivered in-app meanwhile."}
                </p>
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Team" />
          <ul className="divide-y divide-border border-t border-border">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm sm:px-5">
                <div><div className="font-medium">{m.user.name}</div><div className="text-xs text-muted">{m.user.email}</div></div>
                <Badge>{label(m.role)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Plan" subtitle="Billing isn't enabled during the beta — plans show what each tier will include." />
        <div className="grid gap-3 px-4 pb-5 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
          {Object.keys(PLAN_FEATURES).map((p) => (
            <div key={p} className={cn("rounded-xl border p-4", p === s.org.plan ? "border-brand bg-brand-soft/40" : "border-border")}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{p.charAt(0) + p.slice(1).toLowerCase()}</span>
                {p === s.org.plan && <Badge tone="brand">Current</Badge>}
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-muted">
                {PLAN_COPY[p].map((f) => <li key={f} className="flex gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
