import assert from "node:assert/strict";
import test from "node:test";
import { isClosureText, listingExternalId } from "../src/server/ingestion/closure";
import { freshOfferFilter, PLATFORM_SOURCE_ID } from "../src/server/domain/freshness";
import { filtersFromParams } from "../src/server/services/filters";
import { parseAd } from "../src/server/ingestion/textparse";
import { PLATFORM_SOURCE } from "../src/server/ingestion/pipeline";
import { STALE_AFTER_MS } from "../src/lib/format";

test("replies that say the load is taken or closed are recognised", () => {
  for (const t of ["Взяли", "взяли, спасибо", "Груз взят", "Занято", "уже занят", "Закрыто", "не актуально", "Неактуально!", "Машина найдена", "забрали", "Груза нет", "ушёл", "снято", "olindi", "Band", "yopildi", "Топилди", "Taken", "closed already", "no longer available"])
    assert.equal(isClosureText(t), true, t);
});

test("questions, negations and ordinary chatter do not close anything", () => {
  for (const t of ["Взяли?", "занят?", "ещё не взяли", "не взят пока", "груз ещё актуален", "Сколько платите", "Позвоните +998 90 123 45 67", "Какой вес?", "hali olinmagan", "not taken yet", "ok", ""])
    assert.equal(isClosureText(t), false, t);
});

test("a long message (another ad) is never a closing note, even when it contains a closing word", () => {
  assert.equal(isClosureText("Ташкент - Алматы 20т тент загрузка завтра 1300$ после того как всё закрыто ".repeat(8)), false);
});

test("a listing from a message is stored under the id the ad parser gives it (so a closure finds it)", () => {
  const ad = parseAd("Ташкент - Алматы, 20т тент, загрузка 28.10, 1300$, +998 90 123 45 67", 0, "4711", new Date("2026-10-20T09:00:00Z"));
  assert.ok(ad.listing);
  assert.equal(ad.listing!.externalId, listingExternalId(4711));
});

test("loads posted on Karvon are never treated as stale; the source id matches the pipeline's", () => {
  assert.equal(PLATFORM_SOURCE_ID, PLATFORM_SOURCE.id);
  const f = freshOfferFilter(new Date("2026-10-22T12:00:00Z")) as { OR: Record<string, unknown>[] };
  assert.equal(f.OR.length, 3);
  const cutoff = (f.OR[0].lastSeenAt as { gte: Date }).gte;
  assert.equal(new Date("2026-10-22T12:00:00Z").getTime() - cutoff.getTime(), STALE_AFTER_MS);
  assert.deepEqual(f.OR[1], { isDemo: true });
  assert.deepEqual(f.OR[2], { listings: { some: { sourceId: "karvon" } } });
});

test("the 'show outdated too' filter round-trips through the URL", () => {
  assert.equal(filtersFromParams({ stale: "1" }).stale, true);
  assert.equal(filtersFromParams({}).stale, undefined);
});
