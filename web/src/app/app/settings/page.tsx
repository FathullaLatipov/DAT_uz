import type { Metadata } from "next";
import { Check, Send } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { can, PLAN_FEATURES } from "@/server/auth/permissions";
import { db, parseJson } from "@/server/db";
import { getI18n } from "@/i18n/server";
import { notifierStatus } from "@/server/services/alerts";
import { brokerKey } from "@/server/ingestion/normalize";
import { VerificationCard, type VerificationState } from "@/components/settings/verification-card";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { TelegramConnect } from "@/components/settings/telegram-connect";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { cn } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.settings") };
}

export default async function SettingsPage() {
  const s = await requireSession();
  const { t, label, m: msgs } = await getI18n();
  const key = brokerKey(s.org.name);
  const [me, pref, routes, members, lastRequest, ownBroker] = await Promise.all([
    db.user.findUnique({ where: { id: s.userId }, select: { telegramChatId: true } }),
    db.orgPreference.findUnique({ where: { orgId: s.orgId } }),
    db.preferredRoute.findMany({ where: { orgId: s.orgId, destCityId: { not: null } } }),
    db.membership.findMany({ where: { orgId: s.orgId }, include: { user: { select: { name: true, email: true } } } }),
    db.verificationRequest.findFirst({ where: { orgId: s.orgId }, orderBy: { createdAt: "desc" } }),
    key ? db.broker.findUnique({ where: { normalizedName: key }, select: { verified: true } }) : null,
  ]);
  const verification: VerificationState = ownBroker?.verified ? "approved" : lastRequest?.status === "PENDING" ? "pending" : lastRequest?.status === "REJECTED" ? "rejected" : "none";
  const telegram = notifierStatus({ telegramLinked: true }).find((n) => n.channel === "TELEGRAM")!;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={t("nav.settings")} subtitle={t("st.subtitle", { org: s.org.name, role: label(s.role) })} />
      <Card>
        <CardHeader title={t("st.prefTitle")} subtitle={t("st.prefSub")} />
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

      <Card>
        <CardHeader title={t("ver.title")} />
        <div className="px-4 pb-5 sm:px-5">
          <VerificationCard
            state={verification}
            companyName={s.org.name}
            pendingSince={lastRequest?.status === "PENDING" ? lastRequest.createdAt.toISOString() : null}
            reason={lastRequest?.status === "REJECTED" ? lastRequest.reason : null}
            canEdit={can(s, "settings:write")}
          />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("board.channelTelegram")} />
          <div className="px-4 pb-5 text-sm sm:px-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info"><Send className="h-4 w-4" /></div>
              <div>
                <p>{t("st.tgText")}</p>
                <TelegramConnect configured={telegram.configured} linked={!!me?.telegramChatId} />
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("st.team")} />
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
        <CardHeader title={t("st.plan")} subtitle={t("st.planSub")} />
        <div className="grid gap-3 px-4 pb-5 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
          {Object.keys(PLAN_FEATURES).map((p) => (
            <div key={p} className={cn("rounded-xl border p-4", p === s.org.plan ? "border-brand bg-brand-soft/40" : "border-border")}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{msgs.st.planNames[p] ?? p}</span>
                {p === s.org.plan && <Badge tone="brand">{t("st.current")}</Badge>}
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-muted">
                {(msgs.st.planFeatures[p] ?? []).map((f) => <li key={f} className="flex gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
