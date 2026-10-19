import type { I18n } from "@/i18n/create";

/** What the sender's signature is made of; every field but the name is optional. */
export interface Sender {
  name: string;
  jobTitle?: string | null;
  org: string;
  taxId?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
}

export interface Enquiry {
  originId: string;
  destId: string;
  weightKg: number;
  bodyType: string;
  /** ISO date of loading */
  loadingDate: string;
  rateUsd: number;
  truck?: { code: string; bodyType: string; capacityKg: number } | null;
}

/**
 * The enquiry e-mail for one load: a short subject (route and date), a greeting by name, what we need to know
 * about this load, the sender's truck, what to confirm, and a signature block — name, role, company, tax ID,
 * phone, website, address — closed with a fraud-awareness notice, as freight desks do.
 */
export function buildEnquiry(i: Pick<I18n, "t" | "city" | "tonnes" | "usd" | "label" | "shortDate">, e: Enquiry, to: { name: string | null }, from: Sender | null) {
  const { t, city, tonnes, usd, label, shortDate } = i;
  const route = `${city(e.originId)} → ${city(e.destId)}`;
  const date = shortDate(e.loadingDate);
  const signature = from
    ? [
        from.name,
        from.jobTitle,
        from.org,
        from.taxId && t("mail.sigTax", { taxId: from.taxId }),
        from.phone && t("mail.sigPhone", { phone: from.phone }),
        from.website && t("mail.sigWebsite", { url: from.website }),
        from.address && t("mail.sigAddress", { address: from.address }),
      ].filter((x): x is string => !!x)
    : [];
  const lines = [
    to.name ? t("mail.helloNamed", { name: to.name }) : t("mail.hello"),
    "",
    t("mail.intro", { route, weight: tonnes(e.weightKg), body: label(e.bodyType).toLowerCase(), date }),
    ...(e.rateUsd > 0 ? [t("mail.rate", { rate: usd(e.rateUsd) })] : []),
    ...(e.truck ? [t("mail.truck", { truck: `${tonnes(e.truck.capacityKg)} ${label(e.truck.bodyType).toLowerCase()}` })] : []),
    "",
    t("mail.ask"),
    `1. ${t("mail.q1")}`,
    `2. ${t("mail.q2")}`,
    `3. ${t("mail.q3")}`,
    "",
    t("mail.thanks"),
    ...(signature.length ? ["", ...signature, "", t("mail.notice", { company: from!.org })] : []),
  ];
  return { subject: t("mail.subject", { route, weight: tonnes(e.weightKg), date }), body: lines.join("\n") };
}
