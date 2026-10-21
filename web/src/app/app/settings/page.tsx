import type { Metadata } from "next";
import { requireSession } from "@/server/auth/session";
import { can, PLAN_FEATURES } from "@/server/auth/permissions";
import { db, parseJson } from "@/server/db";
import { getI18n } from "@/i18n/server";
import { notifierStatus } from "@/server/services/alerts";
import { brokerKey } from "@/server/ingestion/normalize";
import { emailConfigured } from "@/server/services/email";
import type { VerificationState } from "@/components/settings/verification-card";
import { PageHeader } from "@/components/ui/primitives";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.settings") };
}

export default async function SettingsPage() {
  const s = await requireSession();
  const { t, label, m: msgs } = await getI18n();
  const key = brokerKey(s.org.name);
  const [me, pref, routes, members, lastRequest, ownBroker, orgProfile] = await Promise.all([
    db.user.findUnique({ where: { id: s.userId }, select: { telegramChatId: true, emailAlerts: true, jobTitle: true } }),
    db.orgPreference.findUnique({ where: { orgId: s.orgId } }),
    db.preferredRoute.findMany({ where: { orgId: s.orgId, destCityId: { not: null } } }),
    db.membership.findMany({ where: { orgId: s.orgId }, include: { user: { select: { name: true, email: true } } } }),
    db.verificationRequest.findFirst({ where: { orgId: s.orgId }, orderBy: { createdAt: "desc" } }),
    key ? db.broker.findUnique({ where: { normalizedName: key }, select: { verified: true } }) : null,
    db.organization.findUnique({ where: { id: s.orgId }, select: { phone: true, website: true, address: true, taxId: true } }),
  ]);
  const verification: VerificationState = ownBroker?.verified ? "approved" : lastRequest?.status === "PENDING" ? "pending" : lastRequest?.status === "REJECTED" ? "rejected" : "none";
  const telegram = notifierStatus({ telegramLinked: true }).find((n) => n.channel === "TELEGRAM")!;
  const planFeatures = Object.fromEntries(Object.keys(PLAN_FEATURES).map((p) => [p, { name: msgs.st.planNames[p] ?? p, features: msgs.st.planFeatures[p] ?? [] }]));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={t("nav.settings")} subtitle={t("st.subtitle", { org: s.org.name, role: label(s.role) })} />
      <SettingsTabs
        canEdit={can(s, "settings:write")}
        preferences={{
          minRatePerKmUsd: pref?.minRatePerKmUsd?.toString() ?? "",
          maxDeadheadKm: pref?.maxDeadheadKm ?? 150,
          preferredCargo: parseJson(pref?.preferredCargo, []),
          preferredCountries: parseJson(pref?.preferredCountries, []),
          paymentTerms: parseJson(pref?.paymentTerms, []),
          routes: routes.map((r) => ({ originCityId: r.originCityId, destCityId: r.destCityId! })),
        }}
        verification={verification}
        companyName={s.org.name}
        pendingSince={lastRequest?.status === "PENDING" ? lastRequest.createdAt.toISOString() : null}
        rejectReason={lastRequest?.status === "REJECTED" ? lastRequest.reason : null}
        emailAlertsInitial={me?.emailAlerts ?? true}
        userEmail={s.user.email}
        emailAvailable={emailConfigured()}
        signature={{ jobTitle: me?.jobTitle ?? "", phone: orgProfile?.phone ?? "", website: orgProfile?.website ?? "", address: orgProfile?.address ?? "", taxId: orgProfile?.taxId ?? "" }}
        userName={s.user.name}
        orgName={s.org.name}
        telegramConfigured={telegram.configured}
        telegramLinked={!!me?.telegramChatId}
        members={members.map((m) => ({ id: m.id, name: m.user.name, email: m.user.email, role: m.role }))}
        plan={s.org.plan}
        planFeatures={planFeatures}
      />
    </div>
  );
}
