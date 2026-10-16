import assert from "node:assert/strict";
import test from "node:test";
import { esc, i18nFor, webhookSecret } from "../src/server/services/telegram";

test("telegram: webhook secret is derived from the token, stable, and header-safe", async () => {
  const prev = process.env.TELEGRAM_BOT_TOKEN;
  try {
    delete process.env.TELEGRAM_BOT_TOKEN;
    assert.equal(await webhookSecret(), null);
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    const a = await webhookSecret();
    assert.match(a!, /^[0-9a-f]{48}$/);
    assert.equal(await webhookSecret(), a);
    process.env.TELEGRAM_BOT_TOKEN = "123:other";
    assert.notEqual(await webhookSecret(), a);
  } finally {
    if (prev === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = prev;
  }
});

test("telegram: message text is HTML-escaped", () => {
  assert.equal(esc("Tashkent → Almaty <b>&</b>"), "Tashkent → Almaty &lt;b&gt;&amp;&lt;/b&gt;");
});

test("telegram: alert text follows the user's language, unknown or missing locale means English", () => {
  const ru = i18nFor("ru");
  assert.equal(ru.tn("alerts.title", 1, { name: "Ташкент" }), "1 новый груз по «Ташкент»");
  assert.equal(ru.tn("alerts.title", 2, { name: "x" }), "2 новых груза по «x»");
  assert.equal(ru.tn("alerts.title", 5, { name: "x" }), "5 новых грузов по «x»");
  assert.equal(i18nFor("uz").t("tg.linkedTitle"), "Ulandi ✅");
  assert.equal(i18nFor(null).t("tg.linkedTitle"), "Connected ✅");
  assert.equal(i18nFor("de").t("tg.linkedTitle"), "Connected ✅");
});
