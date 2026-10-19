"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CircleAlert, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/format";
import { Button, Input } from "./primitives";

/**
 * In-page dialogs that replace the browser's confirm / prompt / alert boxes, which look foreign and are
 * blocked in some embedded browsers. Built on the native <dialog> element, so the page behind is inert,
 * focus stays inside, and Esc cancels, with no extra library.
 *
 *   const dialog = useDialog();
 *   if (await dialog.confirm({ title, message, danger: true })) …
 *   const name = await dialog.prompt({ title, defaultValue });   // string, or null when cancelled
 *   await dialog.alert({ message });
 */

export interface ConfirmOptions { title: string; message?: string; confirmText?: string; cancelText?: string; danger?: boolean }
export interface PromptOptions { title: string; message?: string; label?: string; defaultValue?: string; placeholder?: string; confirmText?: string; cancelText?: string; maxLength?: number; allowEmpty?: boolean }
export interface AlertOptions { title?: string; message: string; okText?: string }

interface DialogApi {
  confirm(o: ConfirmOptions): Promise<boolean>;
  prompt(o: PromptOptions): Promise<string | null>;
  alert(o: AlertOptions): Promise<void>;
}

type Request =
  | { kind: "confirm"; o: ConfirmOptions; done: (v: boolean) => void }
  | { kind: "prompt"; o: PromptOptions; done: (v: string | null) => void }
  | { kind: "alert"; o: AlertOptions; done: () => void };

const Ctx = createContext<DialogApi | null>(null);

/** Without a provider (a test, a page outside the root layout) fall back to the browser's own boxes. */
const nativeApi: DialogApi = {
  async confirm(o) { return window.confirm([o.title, o.message].filter(Boolean).join("\n\n")); },
  async prompt(o) { return window.prompt([o.title, o.message].filter(Boolean).join("\n\n"), o.defaultValue ?? ""); },
  async alert(o) { window.alert([o.title, o.message].filter(Boolean).join("\n\n")); },
};

export const useDialog = (): DialogApi => useContext(Ctx) ?? nativeApi;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const enqueue = useCallback(<T,>(make: (done: (v: T) => void) => Request) => new Promise<T>((resolve) => setQueue((q) => [...q, make(resolve)])), []);
  const api = useMemo<DialogApi>(
    () => ({
      confirm: (o) => enqueue<boolean>((done) => ({ kind: "confirm", o, done })),
      prompt: (o) => enqueue<string | null>((done) => ({ kind: "prompt", o, done })),
      alert: (o) => enqueue<void>((done) => ({ kind: "alert", o, done: () => done() })),
    }),
    [enqueue],
  );
  const current = queue[0];
  const finish = () => setQueue((q) => q.slice(1));

  return (
    <Ctx.Provider value={api}>
      {children}
      {current && <DialogView key={queue.length + current.kind} req={current} onClosed={finish} />}
    </Ctx.Provider>
  );
}

function DialogView({ req, onClosed }: { req: Request; onClosed: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(req.kind === "prompt" ? (req.o.defaultValue ?? "") : "");
  const settled = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d || d.open) return;
    d.showModal();
    // showModal() would focus the first control (the close button); put the focus where the question needs it.
    d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  /** Resolve the caller's promise exactly once, then remove the dialog. */
  function settle(result: boolean | string | null) {
    if (settled.current) return;
    settled.current = true;
    if (req.kind === "confirm") req.done(result === true);
    else if (req.kind === "prompt") req.done(typeof result === "string" ? result : null);
    else req.done();
    ref.current?.close();
    onClosed();
  }
  const cancel = () => settle(req.kind === "confirm" ? false : null);

  const danger = req.kind === "confirm" && req.o.danger;
  const title = req.kind === "alert" ? (req.o.title ?? t("dialog.errorTitle")) : req.o.title;
  const message = req.o.message;
  const Icon = req.kind === "alert" ? CircleAlert : danger ? AlertTriangle : null;
  const cancelText = req.kind === "alert" ? null : (req.o.cancelText ?? t("dialog.cancel"));
  const confirmText = req.kind === "alert" ? (req.o.okText ?? t("dialog.ok")) : (req.o.confirmText ?? (danger ? t("dialog.delete") : req.kind === "prompt" ? t("dialog.save") : t("dialog.ok")));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (req.kind === "prompt") {
      const v = value.trim();
      if (v || req.o.allowEmpty) settle(v);
    } else settle(true);
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); cancel(); }}
      onClick={(e) => { if (e.target === ref.current) cancel(); }}
      aria-labelledby="dialog-title"
      aria-describedby={message ? "dialog-message" : undefined}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
    >
      <form onSubmit={submit} className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          {Icon && (
            <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", danger || req.kind === "alert" ? "bg-neg-soft text-neg" : "bg-brand-soft text-brand")}>
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="dialog-title" className="text-base font-semibold leading-snug">{title}</h2>
            {message && <p id="dialog-message" className="mt-1.5 text-sm text-muted">{message}</p>}
          </div>
          <button type="button" onClick={cancel} aria-label={t("dialog.close")} className="-mr-1 -mt-1 rounded-md p-1 text-subtle hover:bg-surface-2 hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>

        {req.kind === "prompt" && (
          <label className="mt-4 block">
            {req.o.label && <span className="mb-1.5 block text-xs font-medium text-muted">{req.o.label}</span>}
            <Input data-autofocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={req.o.placeholder} maxLength={req.o.maxLength ?? 100} onFocus={(e) => e.currentTarget.select()} />
          </label>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {cancelText && (
            // For a destructive question the safe answer holds the focus, so a stray Enter does not delete.
            <Button type="button" variant="outline" onClick={cancel} data-autofocus={danger ? "" : undefined}>{cancelText}</Button>
          )}
          <Button type="submit" variant={danger ? "danger" : "primary"} data-autofocus={req.kind === "alert" || (req.kind === "confirm" && !danger) ? "" : undefined} disabled={req.kind === "prompt" && !req.o.allowEmpty && !value.trim()}>
            {confirmText}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
