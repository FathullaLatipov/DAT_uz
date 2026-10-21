"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Moon, Send } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/format";
import { Badge, Card, CardHeader } from "../ui/primitives";
import { Tabs, TabPanel, type TabDef } from "../ui/tabs";
import { LanguageSwitcher } from "../language-switcher";
import { ThemeToggle } from "../theme-toggle";
import { EmailAlerts } from "./email-alerts";
import { SignatureForm } from "./signature-form";
import { VerificationCard, type VerificationState } from "./verification-card";
import { TelegramConnect } from "./telegram-connect";
import { PreferencesForm, type Prefs } from "./preferences-form";

export interface SettingsTabsProps {
  canEdit: boolean;
  preferences: Prefs;
  verification: VerificationState;
  companyName: string;
  pendingSince: string | null;
  rejectReason: string | null;
  emailAlertsInitial: boolean;
  userEmail: string;
  emailAvailable: boolean;
  signature: { jobTitle: string; phone: string; website: string; address: string; taxId: string };
  userName: string;
  orgName: string;
  telegramConfigured: boolean;
  telegramLinked: boolean;
  members: { id: string; name: string; email: string; role: string }[];
  plan: string;
  planFeatures: Record<string, { name: string; features: string[] }>;
}

/**
 * Settings reorganized into tabs instead of one long stack of cards — all data is fetched once,
 * server-side, in the page component and handed down as props; this only decides which panel is
 * visible. The active tab is kept in the URL (?tab=) so a direct link lands on the right section.
 */
export function SettingsTabs(props: SettingsTabsProps) {
  const { t, label } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [active, setActive] = useState(sp.get("tab") ?? "prefs");

  const tabs: TabDef[] = [
    { key: "prefs", label: t("st.tabs.prefs") },
    { key: "company", label: t("st.tabs.company") },
    { key: "notifications", label: t("st.tabs.notifications") },
    { key: "appearance", label: t("st.tabs.appearance") },
    { key: "team", label: t("st.tabs.team") },
  ];

  function go(key: string) {
    setActive(key);
    const p = new URLSearchParams(sp.toString());
    p.set("tab", key);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-5">
      <Tabs tabs={tabs} active={active} onChange={go} />

      <TabPanel active={active === "prefs"} id="prefs">
        <Card>
          <CardHeader title={t("st.prefTitle")} subtitle={t("st.prefSub")} />
          <div className="px-4 pb-5 sm:px-5">
            <PreferencesForm readOnly={!props.canEdit} initial={props.preferences} />
          </div>
        </Card>
      </TabPanel>

      <TabPanel active={active === "company"} id="company">
        <Card>
          <CardHeader title={t("ver.title")} />
          <div className="px-4 pb-5 sm:px-5">
            <VerificationCard state={props.verification} companyName={props.companyName} pendingSince={props.pendingSince} reason={props.rejectReason} canEdit={props.canEdit} />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("prof.title")} />
          <div className="px-4 pb-5 sm:px-5">
            <SignatureForm initial={props.signature} name={props.userName} org={props.orgName} canEditCompany={props.canEdit} />
          </div>
        </Card>
      </TabPanel>

      <TabPanel active={active === "notifications"} id="notifications">
        <Card>
          <div className="px-4 py-4 sm:px-5">
            <EmailAlerts initial={props.emailAlertsInitial} email={props.userEmail} available={props.emailAvailable} />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("board.channelTelegram")} />
          <div className="px-4 pb-5 text-sm sm:px-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info"><Send className="h-4 w-4" /></div>
              <div>
                <p>{t("st.tgText")}</p>
                <TelegramConnect configured={props.telegramConfigured} linked={props.telegramLinked} />
              </div>
            </div>
          </div>
        </Card>
      </TabPanel>

      <TabPanel active={active === "appearance"} id="appearance">
        <Card>
          <CardHeader title={t("st.appearanceTitle")} subtitle={t("st.appearanceSub")} />
          <div className="flex flex-col gap-4 px-4 pb-5 sm:flex-row sm:items-center sm:gap-8 sm:px-5">
            <div className="flex items-center justify-between gap-3 sm:block">
              <span className="text-sm font-medium">{t("st.language")}</span>
              <LanguageSwitcher className="mt-0 sm:mt-1.5" />
            </div>
            <div className="flex items-center justify-between gap-3 sm:block">
              <span className="text-sm font-medium">{t("st.theme")}</span>
              <div className="mt-0 flex items-center gap-2 sm:mt-1.5">
                <ThemeToggle />
                <Moon className="h-3.5 w-3.5 text-subtle" aria-hidden />
              </div>
            </div>
          </div>
        </Card>
      </TabPanel>

      <TabPanel active={active === "team"} id="team">
        <Card>
          <CardHeader title={t("st.team")} />
          <ul className="divide-y divide-border border-t border-border">
            {props.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm sm:px-5">
                <div><div className="font-medium">{m.name}</div><div className="text-xs text-muted">{m.email}</div></div>
                <Badge>{label(m.role)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title={t("st.plan")} subtitle={t("st.planSub")} />
          <div className="grid gap-3 px-4 pb-5 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
            {Object.entries(props.planFeatures).map(([p, info]) => (
              <div key={p} className={cn("rounded-xl border p-4", p === props.plan ? "border-brand bg-brand-soft/40" : "border-border")}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{info.name}</span>
                  {p === props.plan && <Badge tone="brand">{t("st.current")}</Badge>}
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-muted">
                  {info.features.map((f) => <li key={f} className="flex gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />{f}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </TabPanel>
    </div>
  );
}
