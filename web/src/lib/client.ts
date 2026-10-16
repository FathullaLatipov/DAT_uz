/** The two messages the browser itself produces (server errors arrive already translated). */
const LOCAL: Record<string, { offline: string; generic: string }> = {
  en: { offline: "You appear to be offline. Check your connection and try again.", generic: "Something went wrong. Please try again." },
  ru: { offline: "Похоже, нет подключения к интернету. Проверьте соединение и попробуйте снова.", generic: "Что-то пошло не так. Попробуйте ещё раз." },
  uz: { offline: "Internet aloqasi yo'qdek. Ulanishni tekshirib, qayta urinib ko'ring.", generic: "Nimadir xato ketdi. Qayta urinib ko'ring." },
};
const local = () => LOCAL[typeof document === "undefined" ? "en" : document.documentElement.lang] ?? LOCAL.en;

/** Small fetch wrapper for client components: JSON in/out, friendly error messages. */
export async function apiCall<T = { ok: true }>(url: string, method: "GET" | "POST" | "PATCH" | "DELETE" = "POST", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(local().offline);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? local().generic);
  return data as T;
}
