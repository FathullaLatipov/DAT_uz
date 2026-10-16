"use client";

import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { Select } from "../ui/primitives";

export function TruckPicker({ trucks, value }: { trucks: { id: string; code: string }[]; value?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const path = usePathname();
  return (
    <Select aria-label={t("fleet.pickerAria")} className="w-48" value={value} onChange={(e) => router.push(`${path}?truck=${e.target.value}`)}>
      {trucks.map((x) => <option key={x.id} value={x.id}>{t("fleet.pickerOption", { code: x.code })}</option>)}
    </Select>
  );
}
