import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { AuthForm } from "../auth-form";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.meta.signIn };
}

export default function Page() {
  return <AuthForm mode="login" />;
}
