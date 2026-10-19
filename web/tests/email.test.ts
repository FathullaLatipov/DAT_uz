import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { emailConfigured, renderEmailHtml, sendEmail } from "../src/server/services/email";

test("email: the HTML version escapes the text and keeps one button", () => {
  const html = renderEmailHtml({ subject: "A <b>load</b>", text: "Line one & two\n\nSecond <script>x</script>", button: { text: "Open", url: "https://karvon.uz/app?a=1&b=2" }, footer: "Footer" });
  assert.ok(!html.includes("<script>") && !html.includes("<b>load"));
  assert.ok(html.includes("&lt;script&gt;") && html.includes("Line one &amp; two"));
  assert.ok(html.includes('href="https://karvon.uz/app?a=1&amp;b=2"'));
  assert.equal((html.match(/<a /g) ?? []).length, 1);
});

test("email: nothing is sent without SMTP_URL, and a file outbox records what would go out", async () => {
  const prev = process.env.SMTP_URL;
  try {
    delete process.env.SMTP_URL;
    assert.equal(emailConfigured(), false);
    assert.equal(await sendEmail({ to: "a@b.uz", subject: "s", text: "t" }), false);
    const file = join(mkdtempSync(join(tmpdir(), "karvon-mail-")), "outbox.jsonl");
    process.env.SMTP_URL = `file:${file}`;
    assert.equal(emailConfigured(), true);
    assert.equal(await sendEmail({ to: "carrier@example.uz", subject: "Taken", text: "Hello", button: { text: "Open", url: "https://karvon.uz/x" }, footer: "Bye" }), true);
    const msg = JSON.parse(readFileSync(file, "utf8").trim().split("\n")[0]);
    assert.equal(msg.subject, "Taken");
    assert.equal(msg.to[0].address, "carrier@example.uz");
    assert.ok(msg.text.includes("https://karvon.uz/x") && msg.text.includes("Bye"));
    assert.ok(msg.html.includes("Karvon"));
  } finally {
    if (prev === undefined) delete process.env.SMTP_URL;
    else process.env.SMTP_URL = prev;
  }
});
