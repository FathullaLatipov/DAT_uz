import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { MobileNav, Sidebar, Topbar } from "@/components/shell/nav";
import { hideDemoFreight } from "@/server/domain/demo";
import { NlSearch } from "@/components/shell/nl-search";
import { after } from "next/server";
import { getI18n } from "@/i18n/server";
import { navFlags } from "@/server/services/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const { t, locale } = await getI18n();
  // Notifications are written in the language the person last used the site in (the switcher only sets a cookie).
  after(() => db.user.updateMany({ where: { id: s.userId, OR: [{ locale: null }, { NOT: { locale } }] }, data: { locale } }).catch(() => {}));
  const [unread, nav] = await Promise.all([db.notification.count({ where: { userId: s.userId, readAt: null } }), navFlags(s.orgId)]);
  const isAdmin = s.platformRole === "ADMIN";
  const isBroker = s.role === "BROKER";
  return (
    <div className="flex min-h-dvh">
      <Sidebar isAdmin={isAdmin} isBroker={isBroker} hasTrucks={nav.hasTrucks} postsLoads={nav.postsLoads} orgName={s.org.name} plan={s.org.plan} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userName={s.user.name} unread={unread} search={<NlSearch />} />
        {s.org.isDemo && (
          <div className="border-b border-dashed border-accent/40 bg-warn-soft/60 px-4 py-1.5 text-center text-xs text-warn sm:px-6">
            {hideDemoFreight() ? (<>{t("layout.demoFleetPre")} <strong>{t("layout.demoFleetStrong")}</strong> {t("layout.demoFleetPost")}</>) : (<>{t("layout.demoAllPre")} <strong>{t("common.demoData")}</strong>{t("layout.demoAllPost")}</>)}
          </div>
        )}
        <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:pb-10">{children}</main>
      </div>
      <MobileNav isAdmin={isAdmin} isBroker={isBroker} hasTrucks={nav.hasTrucks} postsLoads={nav.postsLoads} />
    </div>
  );
}
