import assert from "node:assert/strict";
import test from "node:test";
import { buildEnquiry, type Sender } from "../src/lib/enquiry";
import { composeUrl, gmailUrl, outlookUrl } from "../src/lib/mailto";
import { createI18n } from "../src/i18n/create";
import { MESSAGES } from "../src/i18n/messages";

const en = createI18n("en", MESSAGES.en);
const ru = createI18n("ru", MESSAGES.ru);
const load = { originId: "tashkent", destId: "almaty", weightKg: 20_000, bodyType: "CURTAINSIDER", loadingDate: "2026-10-20T08:00:00Z", rateUsd: 900, truck: { code: "T-1001", bodyType: "CURTAINSIDER", capacityKg: 20_000 } };
const me: Sender = { name: "Alfie Drew", jobTitle: "Dispatch department", org: "Taylor Transports LLC", taxId: "305123456", phone: "+998 71 123 45 67", website: "https://taylortransports.uz", address: "6784 Loop Road, Tashkent" };

test("enquiry: short subject, greeting by name, what we need, the truck, and a full signature with the notice", () => {
  const m = buildEnquiry(en, load, { name: "Bonnie" }, me);
  assert.equal(m.subject, "Tashkent → Almaty, 20 Oct");
  const lines = m.body.split("\n");
  assert.equal(lines[0], "Hello, Bonnie,");
  assert.ok(m.body.includes("Need details on this load: Tashkent → Almaty, 20 Oct, 20 t, curtainsider."));
  assert.ok(m.body.includes("Posted rate: $900.") && m.body.includes("I have a truck available: 20 t curtainsider."));
  const sig = m.body.slice(m.body.indexOf("Alfie Drew"));
  for (const part of ["Alfie Drew", "Dispatch department", "Taylor Transports LLC", "Tax ID: 305123456", "Office: +998 71 123 45 67", "Website: https://taylortransports.uz", "Address: 6784 Loop Road, Tashkent", "SECURITY NOTICE | Taylor Transports LLC", "Verify before you act"]) assert.ok(sig.includes(part), part);
});

test("enquiry: empty signature fields are left out, and no sender means no signature block", () => {
  const m = buildEnquiry(en, { ...load, rateUsd: 0, truck: null }, { name: null }, { name: "Aziz", org: "WolwAz" });
  assert.ok(m.body.startsWith("Hello,\n"));
  assert.ok(!m.body.includes("Tax ID") && !m.body.includes("Office:") && !m.body.includes("Website:") && !m.body.includes("Posted rate") && !m.body.includes("truck available"));
  assert.ok(m.body.includes("Aziz\nWolwAz"));
  assert.ok(!buildEnquiry(en, load, { name: null }, null).body.includes("SECURITY NOTICE"));
});

test("enquiry: written in the reader's language", () => {
  const m = buildEnquiry(ru, load, { name: "Иван" }, me);
  assert.ok(m.body.startsWith("Здравствуйте, Иван!"));
  assert.ok(m.body.includes("Нужны подробности по грузу") && m.body.includes("ИНН: 305123456") && m.body.includes("УВЕДОМЛЕНИЕ О БЕЗОПАСНОСТИ"));
});

test("compose links: Gmail and Outlook open an addressed, filled-in draft; the mail app gets a mailto", () => {
  const d = { to: "bonnie@taylorfreight.com", subject: "Tashkent → Almaty, 20 Oct", body: "Hello,\n\nNeed details & rates" };
  const g = gmailUrl(d);
  assert.ok(g.startsWith("https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=bonnie%40taylorfreight.com&su="));
  assert.equal(decodeURIComponent(g.split("&su=")[1].split("&body=")[0]), d.subject);
  assert.equal(decodeURIComponent(g.split("&body=")[1]), d.body);
  const o = outlookUrl(d);
  assert.ok(o.startsWith("https://outlook.live.com/mail/0/deeplink/compose?to=bonnie%40taylorfreight.com&subject="));
  assert.equal(decodeURIComponent(o.split("&body=")[1]), d.body);
  assert.ok(composeUrl("app", d).startsWith("mailto:bonnie@taylorfreight.com?subject="));
  assert.equal(composeUrl("gmail", d), g);
});
