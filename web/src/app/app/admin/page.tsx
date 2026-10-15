import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { db, parseJson } from "@/server/db";
import { getProvider } from "@/server/ai/provider";
import { notifierStatus } from "@/server/services/alerts";
import { JOBS } from "@/server/jobs/definitions";
import { jobsEnabled } from "@/server/jobs/config";
import { Badge, Card, CardHeader, DemoBadge, PageHeader, Stat } from "@/components/ui/primitives";
import { CsvImport, SyncButton } from "@/components/admin/admin-actions";
import { ago, dateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Admin" };

const STATUS_TONE: Record<string, "pos" | "neutral" | "neg" | "warn"> = { ACTIVE: "pos", NOT_CONFIGURED: "neutral", ERROR: "neg", DISABLED: "warn" };

export default async function AdminPage() {
  const s = await requireSession();
  if (!can(s, "platform:admin")) redirect("/app");

  const [sources, runs, offerStats, listingCounts, flagged, users, orgs, audits, brokers] = await Promise.all([
    db.freightSource.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] }),
    db.ingestionRun.findMany({ orderBy: { startedAt: "desc" }, take: 15, include: { source: { select: { name: true } } } }),
    db.freightOffer.groupBy({ by: ["status"], _count: true }),
    db.freightListing.groupBy({ by: ["sourceId"], _count: true }),
    db.freightOffer.findMany({ where: { status: "ACTIVE", NOT: { qualityFlags: "[]" } }, select: { qualityFlags: true } }),
    db.user.count(),
    db.organization.findMany({ include: { _count: { select: { memberships: true, trucks: true } } }, orderBy: { createdAt: "asc" } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    db.broker.count(),
  ]);
  const dupOffers = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) as n FROM (SELECT "offerId" FROM "FreightListing" GROUP BY "offerId" HAVING COUNT(DISTINCT "sourceId") > 1) multi`;
  const jobRows = await Promise.all(
    (Object.entries(JOBS) as [string, { everyMin: number }][]).map(async ([name, def]) => ({
      name,
      everyMin: def.everyMin,
      last: await db.jobRun.findFirst({ where: { job: name }, orderBy: { startedAt: "desc" }, select: { status: true, startedAt: true, result: true, error: true } }),
    })),
  );
  const totalListings = listingCounts.reduce((a, l) => a + l._count, 0);
  const totalOffers = offerStats.reduce((a, o) => a + o._count, 0);
  const flagCounts = new Map<string, number>();
  for (const f of flagged) for (const code of parseJson<string[]>(f.qualityFlags, [])) if (code !== "EXPIRED") flagCounts.set(code, (flagCounts.get(code) ?? 0) + 1);
  const failed = runs.filter((r) => r.errors > 0 || r.rejected > 0 || r.status === "FAILED");
  const ai = getProvider();

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader title="Platform admin" subtitle="Sources, ingestion health, data quality and access." actions={<SyncButton />} />

      <Card className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-6">
        <Stat label="Opportunities" value={totalOffers.toLocaleString("en-US")} sub={`${offerStats.find((o) => o.status === "ACTIVE")?._count ?? 0} active`} />
        <Stat label="Source listings" value={totalListings.toLocaleString("en-US")} />
        <Stat label="Merged duplicates" value={(totalListings - totalOffers).toLocaleString("en-US")} sub={`${Number(dupOffers[0]?.n ?? 0)} multi-source loads`} />
        <Stat label="Brokers" value={brokers} />
        <Stat label="Users" value={users} />
        <Stat label="Organizations" value={orgs.length} />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Freight sources" subtitle="Only official APIs, licensed feeds, partner agreements or operator uploads. No scraping." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-y border-border bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Last sync</th>
                <th className="px-3 py-2.5 text-right font-medium">Records</th>
                <th className="px-3 py-2.5 font-medium">Access notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sources.map((src) => (
                <tr key={src.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{src.name}</div>
                    <div className="text-xs text-muted">{src.kind.toLowerCase()}{src.isDemo && <> · <DemoBadge /></>}</div>
                  </td>
                  <td className="px-3 py-3"><Badge tone={STATUS_TONE[src.status] ?? "neutral"}>{src.status === "NOT_CONFIGURED" ? "Integration not configured" : src.status}</Badge></td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">{src.lastSyncAt ? ago(src.lastSyncAt) : "—"}</td>
                  <td className="num px-3 py-3 text-right">{(listingCounts.find((l) => l.sourceId === src.id)?._count ?? 0).toLocaleString("en-US")}</td>
                  <td className="max-w-md px-3 py-3 text-xs text-muted">{src.accessNotes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Ingestion runs" />
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-y border-border bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-2 py-2 text-right font-medium">Fetched</th>
                  <th className="px-2 py-2 text-right font-medium">New</th>
                  <th className="px-2 py-2 text-right font-medium">Upd</th>
                  <th className="px-2 py-2 text-right font-medium">Dup</th>
                  <th className="px-2 py-2 text-right font-medium">Rej</th>
                  <th className="px-2 py-2 text-right font-medium">Err</th>
                  <th className="px-2 py-2 text-right font-medium">ms</th>
                  <th className="px-4 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">{r.source.name} <Badge tone={r.status === "SUCCESS" ? "pos" : r.status === "PARTIAL" ? "warn" : r.status === "FAILED" ? "neg" : "neutral"}>{r.status.toLowerCase()}</Badge></td>
                    <td className="px-2 py-2 text-right">{r.fetched}</td>
                    <td className="px-2 py-2 text-right">{r.created}</td>
                    <td className="px-2 py-2 text-right">{r.updated}</td>
                    <td className="px-2 py-2 text-right">{r.duplicates}</td>
                    <td className="px-2 py-2 text-right">{r.rejected}</td>
                    <td className="px-2 py-2 text-right">{r.errors}</td>
                    <td className="px-2 py-2 text-right text-muted">{r.durationMs ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{ago(r.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Failed / rejected records" />
          <div className="max-h-80 space-y-3 overflow-y-auto px-4 pb-5 sm:px-5">
            {failed.length === 0 && <p className="text-sm text-muted">No failures in recent runs.</p>}
            {failed.map((r) =>
              parseJson<{ externalId: string; message: string }[]>(r.errorLog, []).map((e, i) => (
                <div key={`${r.id}${i}`} className="rounded-lg bg-surface-2 px-3 py-2 text-xs">
                  <span className="font-medium">{r.source.name}</span> · <span className="font-mono">{e.externalId}</span>
                  <div className="text-muted">{e.message}</div>
                </div>
              )),
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Data quality (active)" />
          <ul className="space-y-1.5 px-4 pb-5 text-sm sm:px-5">
            {[...flagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <li key={k} className="flex justify-between"><span className="font-mono text-xs">{k}</span><span className="num">{n}</span></li>
            ))}
            {flagCounts.size === 0 && <li className="text-muted">No flags on active loads.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Manual CSV import" />
          <div className="px-4 pb-5 sm:px-5"><CsvImport /></div>
        </Card>
        <Card>
          <CardHeader title="System health" />
          <ul className="space-y-2 px-4 pb-5 text-sm sm:px-5">
            <li className="flex justify-between"><span>Database</span><Badge tone="pos">OK</Badge></li>
            <li className="flex justify-between"><span>AI provider</span><Badge tone={ai.name === "anthropic" ? "pos" : "neutral"}>{ai.name === "anthropic" ? "LLM configured" : "Rules fallback"}</Badge></li>
            {notifierStatus().map((n) => (
              <li key={n.channel} className="flex justify-between"><span>{n.channel.toLowerCase()} alerts</span><Badge tone={n.configured ? "pos" : "neutral"}>{n.configured ? "configured" : "not configured"}</Badge></li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Background jobs"
          subtitle={jobsEnabled() ? "Scheduler is on. Alerts go to admins (and Telegram if ALERT_TELEGRAM_CHAT_ID is set) when something breaks." : "Scheduler is off (JOBS_ENABLED is not 1) — sources sync only when the home page is visited."}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-y border-border bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-3 py-2 font-medium">Every</th>
                <th className="px-3 py-2 font-medium">Last run</th>
                <th className="px-3 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobRows.map((j) => (
                <tr key={j.name} className="align-top">
                  <td className="px-4 py-2.5 font-mono text-xs">{j.name}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted">{j.everyMin >= 60 ? `${j.everyMin / 60} h` : `${j.everyMin} min`}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                    {j.last ? <>{ago(j.last.startedAt)} <Badge tone={j.last.status === "SUCCESS" ? "pos" : j.last.status === "FAILED" ? "neg" : "neutral"}>{j.last.status.toLowerCase()}</Badge></> : "never"}
                  </td>
                  <td className="max-w-md truncate px-3 py-2.5 text-xs text-muted" title={j.last?.error ?? j.last?.result}>{j.last?.error ?? j.last?.result ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Organizations" />
          <ul className="divide-y divide-border border-t border-border text-sm">
            {orgs.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-4 py-2.5 sm:px-5">
                <span>{o.name} {o.isDemo && <DemoBadge />}</span>
                <span className="text-xs text-muted">{o.plan} · {o._count.memberships} users · {o._count.trucks} trucks</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Audit log" />
          <ul className="divide-y divide-border border-t border-border text-sm">
            {audits.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2 sm:px-5">
                <span className="font-mono text-xs">{a.action}</span>
                <span className="text-xs text-muted">{dateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
