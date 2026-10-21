import { Ruler, Scale, ShieldAlert, Users } from "lucide-react";
import type { I18n } from "@/i18n/create";
import { Badge, Card, CardHeader } from "../ui/primitives";

export interface PassportFields {
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  grossWeightKg: number | null;
  axles: number | null;
  axleLoadKg: number | null;
  adr: boolean;
  crew: number;
}

const dims3 = (l: number | null, w: number | null, h: number | null) => (l && w && h ? `${l} × ${w} × ${h} m` : null);

/**
 * Read-only passport/ADR/crew summary — the data only ever lived inside the edit form before,
 * so seeing whether a truck even HAS dimensions on file meant opening it. Shown above the form,
 * same Card/CardHeader language as the rest of the page; empty when nothing is set yet, with a
 * pointer to the form below instead of a wall of dashes.
 */
export function PassportSummary({ t, p }: { t: I18n["t"]; p: PassportFields }) {
  const cargo = dims3(p.cargoLengthM, p.cargoWidthM, p.cargoHeightM);
  const vehicle = dims3(p.lengthM, p.widthM, p.heightM);
  const hasAny = cargo || vehicle || p.grossWeightKg || p.axles || p.adr || p.crew === 2;

  if (!hasAny) {
    return (
      <Card>
        <CardHeader title={t("pass.title")} />
        <p className="px-4 pb-5 text-sm text-muted sm:px-5">{t("pass.hint")}</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={t("pass.title")} action={p.adr && <Badge tone="warn"><ShieldAlert className="h-3 w-3" /> {t("pass.adr")}</Badge>} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-5 text-sm sm:grid-cols-4 sm:px-5">
        <Field icon={<Ruler className="h-3.5 w-3.5" />} label={t("pass.cargoSpace")} value={cargo ?? "—"} />
        <Field icon={<Ruler className="h-3.5 w-3.5" />} label={t("pass.vehicle")} value={vehicle ?? "—"} />
        <Field icon={<Scale className="h-3.5 w-3.5" />} label={t("pass.gross")} value={p.grossWeightKg ? `${p.grossWeightKg.toLocaleString()} kg` : "—"} />
        <Field icon={<Scale className="h-3.5 w-3.5" />} label={t("pass.axles")} value={p.axles ? `${p.axles}${p.axleLoadKg ? ` · ${p.axleLoadKg.toLocaleString()} kg/axle` : ""}` : "—"} />
        <Field icon={<Users className="h-3.5 w-3.5" />} label={t("hos.crew")} value={p.crew === 2 ? t("hos.crewTwo") : t("hos.crewOne")} />
      </div>
    </Card>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-subtle">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-muted">{label}</div>
        <div className="truncate font-medium">{value}</div>
      </div>
    </div>
  );
}
