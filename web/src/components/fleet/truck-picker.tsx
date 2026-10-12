"use client";

import { usePathname, useRouter } from "next/navigation";
import { Select } from "../ui/primitives";

export function TruckPicker({ trucks, value }: { trucks: { id: string; code: string }[]; value?: string }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <Select aria-label="Cost profile from truck" className="w-48" value={value} onChange={(e) => router.push(`${path}?truck=${e.target.value}`)}>
      {trucks.map((t) => <option key={t.id} value={t.id}>{t.code} cost profile</option>)}
    </Select>
  );
}
