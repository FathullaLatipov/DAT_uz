import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return <AuthForm mode="signup" />;
}
