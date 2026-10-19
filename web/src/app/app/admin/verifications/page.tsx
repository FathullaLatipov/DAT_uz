import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { getI18n } from "@/i18n/server";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { VerificationActions } from "@/components/admin/admin-row-actions";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("av.verTitle") };
}

export default async function VerificationsPage() {
  const s = await requireSession();
  if (!can(s, "platform:admin")) redirect("/app");
  const { t, ago } = await getI18n();
  const include = { org: { select: { name: true } }, user: { select: { name: true, email: true } } } as const;
  const [pending, decided] = await Promise.all([
    db.verificationRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include }),
    db.verificationRequest.findMany({ where: { NOT: { status: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 20, include }),
  ]);

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <PageHeader title={t("av.verTitle")} subtitle={t("av.verSub")} />
      <AdminTabs active="verifications" pending={pending.length} />

      <Card>
        <CardHeader title={`${t("av.pending")} (${pending.length})`} />
        {pending.length === 0 ? (
          <p className="border-t border-border px-4 py-6 text-sm text-muted sm:px-5">{t("av.noPending")}</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {pending.map((r) => (
              <li key={r.id} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="min-w-0 space-y-1 text-sm">
                  <div className="font-semibold">{r.companyName}{r.companyName !== r.org.name && <span className="ml-2 text-xs font-normal text-muted">({r.org.name})</span>}</div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-muted">
                    <span>{t("av.taxId")}: <span className="font-medium text-fg">{r.taxId}</span></span>
                    <span>{t("av.contact")}: <a href={`tel:${r.phone.replace(/[^+\d]/g, "")}`} className="font-medium text-brand hover:underline">{r.phone}</a> · {r.user.name} · {r.user.email}</span>
                    <span>{t("av.sent")}: {ago(r.createdAt)}</span>
                  </div>
                  {r.note && <p className="text-muted"><span className="font-medium text-fg">{t("av.note")}:</span> {r.note}</p>}
                </div>
                <VerificationActions id={r.id} company={r.companyName} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {decided.length > 0 && (
        <Card>
          <CardHeader title={t("av.decided")} />
          <ul className="divide-y divide-border border-t border-border text-sm">
            {decided.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                <div className="min-w-0">
                  <span className="font-medium">{r.companyName}</span> <span className="text-muted">· {t("av.taxId")} {r.taxId}</span>
                  {r.reason && <div className="text-xs text-muted">{r.reason}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.status === "APPROVED" ? "pos" : "neg"}>{r.status === "APPROVED" ? t("av.approvedBy", { when: ago(r.decidedAt ?? r.createdAt) }) : t("av.rejectedBy", { when: ago(r.decidedAt ?? r.createdAt) })}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
