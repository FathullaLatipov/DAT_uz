"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Handshake, Loader2, Truck } from "lucide-react";
import { apiCall } from "@/lib/client";
import { cn } from "@/lib/format";
import { Button, Field, Input } from "@/components/ui/primitives";

const KINDS = [
  { v: "carrier", t: "I have a truck", d: "Find loads and manage your fleet", icon: Truck },
  { v: "broker", t: "I'm a broker", d: "Post loads for carriers to find", icon: Handshake },
] as const;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [kind, setKind] = useState<"carrier" | "broker">("carrier");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const body: Record<string, unknown> = Object.fromEntries(new FormData(e.currentTarget));
    if (mode === "signup" && kind === "broker") body.accountType = "BROKER";
    try {
      const r = await apiCall<{ next: string }>(`/api/auth/${mode}`, "POST", body);
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/app") && r.next === "/app" ? next : r.next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  async function demo() {
    setPending(true);
    try {
      await apiCall("/api/auth/login", "POST", { email: "demo@karvon.uz", password: "demo1234" });
      router.replace("/app");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-semibold tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-1 text-sm text-muted">
        {mode === "login" ? "Sign in to see loads ranked for your trucks." : "Takes under a minute."}
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {mode === "signup" && (
          <>
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted">Which are you?</legend>
              <div className="grid grid-cols-2 gap-2.5">
                {KINDS.map((k) => (
                  <button
                    key={k.v}
                    type="button"
                    onClick={() => setKind(k.v)}
                    className={cn("flex items-start gap-2.5 rounded-xl border p-3 text-left transition", kind === k.v ? "border-brand bg-brand-soft" : "border-border hover:border-border-strong")}
                    aria-pressed={kind === k.v}
                  >
                    <k.icon className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", kind === k.v ? "text-brand" : "text-muted")} />
                    <span>
                      <span className="block text-sm font-medium">{k.t}</span>
                      <span className="block text-xs text-muted">{k.d}</span>
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            <Field label="Your name">
              <Input name="name" required minLength={2} autoComplete="name" />
            </Field>
            <Field label="Company (optional)">
              <Input name="company" autoComplete="organization" placeholder="e.g. Samarkand Haulage" />
            </Field>
          </>
        )}
        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
          <Input name="password" type="password" required minLength={mode === "signup" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg bg-neg-soft px-3 py-2 text-sm text-neg">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-subtle">
        <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
      </div>
      <Button variant="outline" size="lg" className="w-full" onClick={demo} disabled={pending}>
        Explore the demo workspace
      </Button>
      <p className="mt-6 text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            New to Karvon?{" "}
            <Link href="/signup" className="font-medium text-brand hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
