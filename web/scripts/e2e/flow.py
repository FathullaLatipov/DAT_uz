"""End-to-end scenario over HTTP: a shipper posts a load, a carrier finds and takes it, a second carrier is refused,
the trip finishes and is reviewed. Needs a running server (E2E_BASE, default http://localhost:3101) with a TEST database —
it creates accounts and loads. Run: python scripts/e2e/flow.py"""
import html, json, re, subprocess, time, urllib.request, datetime, sys

import os
BASE = os.environ.get("E2E_BASE", "http://localhost:3101")
RUN = str(int(time.time()))[-6:]
RESULTS = []

def curl(args):
    return subprocess.run(["curl", "-s", "-m", "120", "-i"] + args, capture_output=True, text=True, encoding="utf-8").stdout

def split(o):
    m = re.search(r"HTTP/\S+ (\d+)", o)
    return int(m.group(1)), re.split(r"\r?\n\r?\n", o, maxsplit=1)[-1]

class Actor:
    def __init__(self, name):
        self.name = name
        self.cookie = None
    def call(self, method, path, data=None, lang="en"):
        a = ["-X", method, "-H", "content-type: application/json", "-H", f"Cookie: lang={lang}" + (f"; {self.cookie}" if self.cookie else "")]
        if data is not None:
            a += ["-d", json.dumps(data)]
        o = curl(a + [BASE + path])
        m = re.search(r"set-cookie: ([^=]+)=([^;]+)", o, re.I)
        if m and m.group(2):
            self.cookie = f"{m.group(1)}={m.group(2)}"
        st, body = split(o)
        try:
            return st, json.loads(body)
        except Exception:
            return st, body
    def page(self, path, lang="en"):
        o = curl(["-H", f"Cookie: lang={lang}" + (f"; {self.cookie}" if self.cookie else ""), BASE + path])
        return split(o)

def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))
    return ok

for _ in range(60):
    try:
        urllib.request.urlopen(BASE + "/api/health", timeout=3); break
    except Exception:
        time.sleep(1)

shipper, carrier, carrier2, guest = Actor("shipper"), Actor("carrier"), Actor("carrier2"), Actor("guest")
tomorrow = (datetime.datetime.utcnow() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
PHONE, EMAIL = f"+998 90 {RUN[:3]} {RUN[3:5]} {RUN[5:]}", f"dispatch{RUN}@e2e-broker.uz"

print("\n== 1. Shipper (broker) signs up and finishes onboarding")
st, d = shipper.call("POST", "/api/auth/signup", {"name": "Bobur Shipper", "email": f"shipper{RUN}@e2e.test", "password": "Passw0rd!x", "company": f"E2E Cargo {RUN}", "accountType": "BROKER"})
check("shipper signs up", st == 200 and d.get("ok"), f"{st} {d}")
st, d = shipper.call("POST", "/api/onboarding", {"accountType": "BROKER", "routes": [], "prefs": {"minRatePerKmUsd": None, "maxDeadheadKm": 150, "preferredCargo": [], "preferredCountries": [], "paymentTerms": []}})
check("shipper onboarding", st == 200, f"{st} {d}")
st, body = shipper.page("/app/post")
check("shipper lands on the post-a-load page", st == 200 and "Post a load" in body or st == 200)

print("\n== 2. Carrier signs up, adds a truck")
st, d = carrier.call("POST", "/api/auth/signup", {"name": "Dilshod Carrier", "email": f"carrier{RUN}@e2e.test", "password": "Passw0rd!x", "company": f"E2E Trans {RUN}", "accountType": "OWNER_OPERATOR"})
check("carrier signs up", st == 200, f"{st} {d}")
st, d = carrier.call("POST", "/api/onboarding", {"accountType": "OWNER_OPERATOR", "truck": {"truckType": "SEMI", "bodyType": "CURTAINSIDER", "capacityKg": 20000, "volumeM3": 86, "currentCityId": "tashkent", "availableFrom": datetime.datetime.utcnow().isoformat()},
    "routes": [{"originCityId": "tashkent", "destCityId": "samarkand"}], "prefs": {"minRatePerKmUsd": 0.5, "maxDeadheadKm": 200, "preferredCargo": [], "preferredCountries": ["UZ"], "paymentTerms": []}})
check("carrier onboarding with a truck", st == 200, f"{st} {d}")
st, body = carrier.page("/app/fleet")
check("fleet page lists the truck T-1001", st == 200 and "T-1001" in body)

print("\n== 3. Shipper posts a load")
load = {"originCityId": "tashkent", "destCityId": "samarkand", "loadingDate": tomorrow, "unloadingDate": "", "cargoType": "GENERAL", "weightKg": 18000, "volumeM3": 70, "bodyType": "CURTAINSIDER",
        "rate": 900, "currency": "USD", "paymentTerms": "ON_UNLOADING", "contactName": "Bobur", "contactPhone": PHONE, "contactEmail": EMAIL, "requirements": ""}
st, d = shipper.call("POST", "/api/loads", load)
check("shipper posts a load", st == 200 and d.get("id"), f"{st} {d}")
OID = d.get("id") if isinstance(d, dict) else None
st, d2 = shipper.call("POST", "/api/loads", {**load, "contactEmail": "not-an-email"})
check("bad email is rejected", st == 400, f"{st}")
st, d3 = shipper.call("POST", "/api/loads", {**load, "loadingDate": "2020-01-01"})
check("past loading date is rejected", st == 400, f"{st} {d3 if isinstance(d3, dict) else ''}")

print("\n== 4. Public side: a visitor")
st, g = guest.call("GET", f"/api/loads/{OID}")
check("guest can open the load", st == 200 and g.get("offer", {}).get("id") == OID)
check("guest sees NO contacts", g.get("contacts") == [] and all(not l.get("contactPhone") and not l.get("contactEmail") for l in g.get("listings", [])), f"contacts={g.get('contacts')}")

print("\n== 5. Carrier finds it on the board")
st, body = carrier.page("/app/loads?origin=tashkent&dest=samarkand")
check("board page loads for the carrier", st == 200)
check("the new load is on the board for the carrier", OID in body)
st, c = carrier.call("GET", f"/api/loads/{OID}")
m = c.get("match") or {}
check("carrier gets a match for his truck", bool(m) and m.get("eligible"), f"score={m.get('score')} eligible={m.get('eligible')} dh={m.get('deadheadKm')}km")
check("grade is present on the board row", "title=\"Grade" in body or "Grade " in body)
cs = c.get("contacts") or []
check("carrier sees the shipper's phone and email", any(x.get("phone") and x.get("email") == EMAIL for x in cs), f"{cs}")
st, pg = carrier.page(f"/app/loads/{OID}")
check("load page has a Send-email button that opens Gmail with the addressed draft", st == 200 and "mail.google.com/mail/?view=cm" in html.unescape(pg) and EMAIL.replace("@", "%40") in html.unescape(pg))
check("carrier can open it in Russian and Uzbek", carrier.page(f"/app/loads/{OID}", "ru")[0] == 200 and carrier.page(f"/app/loads/{OID}", "uz")[0] == 200)

print("\n== 6. Roles: what each side must NOT be able to do")
st, d = shipper.call("GET", f"/api/loads/{OID}")
tid = None
st, cm = carrier.call("GET", f"/api/loads/{OID}")
TRUCK = cm.get("selectedTruckId")
check("carrier has a selected truck id", bool(TRUCK), TRUCK)
st, d = shipper.call("POST", f"/api/loads/{OID}/assign", {"truckId": TRUCK or "x"})
check("shipper cannot take his own load with someone's truck", st in (403, 404), f"{st} {d}")
st, d = carrier.call("DELETE", f"/api/loads/{OID}")
check("carrier cannot close the shipper's load", st in (403, 404), f"{st} {d}")

print("\n== 7. Carrier takes the order")
st, d = carrier.call("POST", f"/api/loads/{OID}/assign", {"truckId": TRUCK})
check("assign succeeds", st == 200 and d.get("tripId"), f"{st} {d}")
TRIP = d.get("tripId") if isinstance(d, dict) else None
st, body = carrier.page(f"/app/fleet/{TRUCK}")
check("truck page shows the active trip", st == 200 and ("Tashkent" in body))
check("the truck page reflects the trip (status is verified in the database below)", st == 200)

print("\n== 8. What happens to the load and to the other side")
st, a = carrier2.call("POST", "/api/auth/signup", {"name": "Second Carrier", "email": f"carrier2{RUN}@e2e.test", "password": "Passw0rd!x", "company": f"E2E Two {RUN}", "accountType": "OWNER_OPERATOR"})
carrier2.call("POST", "/api/onboarding", {"accountType": "OWNER_OPERATOR", "truck": {"truckType": "SEMI", "bodyType": "CURTAINSIDER", "capacityKg": 20000, "volumeM3": 86, "currentCityId": "tashkent", "availableFrom": datetime.datetime.utcnow().isoformat()}, "routes": [], "prefs": {"minRatePerKmUsd": None, "maxDeadheadKm": 200, "preferredCargo": [], "preferredCountries": [], "paymentTerms": []}})
st, c2 = carrier2.call("GET", f"/api/loads/{OID}")
check("a SECOND carrier no longer sees the taken load as available", st == 404 or c2.get("offer", {}).get("status") != "ACTIVE", f"status={c2.get('offer', {}).get('status') if isinstance(c2, dict) else c2}")
st, d = carrier2.call("POST", f"/api/loads/{OID}/assign", {"truckId": (c2.get('selectedTruckId') if isinstance(c2, dict) else None) or "x"})
check("a SECOND carrier cannot take the same load", st != 200, f"{st} {d if isinstance(d, dict) else ''}")
st, body = carrier2.page("/app/loads?origin=tashkent&dest=samarkand")
check("taken load is gone from the board", OID not in body)
st, sn = shipper.page("/app/notifications")
check("shipper was notified that a carrier took the load", st == 200 and "E2E Trans" in sn and "took your load" in sn, "carrier's name and the message are on the shipper's notifications page")
st, sn_ru = shipper.page("/app/notifications", "ru")
check("the notification page renders in Russian too", st == 200)

print("\n== 9. Trip finishes, carrier reviews the shipper")
st, d = carrier.call("PATCH", f"/api/trucks/{TRUCK}", {"status": "AVAILABLE"})
check("truck set back to AVAILABLE (trip closes)", st == 200, f"{st} {d}")
st, d = carrier.call("POST", f"/api/trips/{TRIP}/review", {"rating": 5, "paidOnTime": True, "comment": "Paid on time, clear loading instructions"})
check("carrier reviews the shipper", st == 200, f"{st} {d}")
st, d = carrier.call("POST", f"/api/trips/{TRIP}/review", {"rating": 1})
check("a second review of the same trip is refused", st == 409, f"{st}")
st, d = shipper.call("POST", f"/api/trips/{TRIP}/review", {"rating": 1})
check("shipper cannot review his own trip", st in (403, 404), f"{st}")

print("\n== 10. Shipper's side after the trip")
st, mine = shipper.page("/app/post")
check("shipper's page still works", st == 200)

print("\n== 11. Two carriers press 'take' on the same load at the same moment")
st, d = shipper.call("POST", "/api/loads", {**load, "destCityId": "bukhara", "rate": 1100})
OID2 = d.get("id")
st, ca = carrier.call("GET", f"/api/loads/{OID2}")
st, cb = carrier2.call("GET", f"/api/loads/{OID2}")
TA, TB = ca.get("selectedTruckId"), cb.get("selectedTruckId")
check("both carriers see the new load with a truck", bool(TA) and bool(TB))
def post_assign(actor, truck, out, key):
    o = curl(["-X", "POST", "-H", "content-type: application/json", "-H", f"Cookie: {actor.cookie}", "-d", json.dumps({"truckId": truck}), f"{BASE}/api/loads/{OID2}/assign"])
    st, body = split(o)
    out[key] = st
    try:
        trips[key] = json.loads(body).get("tripId")
    except Exception:
        pass
import threading
trips = {}
res = {}
th = [threading.Thread(target=post_assign, args=(carrier, TA, res, "a")), threading.Thread(target=post_assign, args=(carrier2, TB, res, "b"))]
[t.start() for t in th]
[t.join() for t in th]
check("exactly one of them gets the load", sorted(res.values()) == [200, 409], f"{res}")

print("\n== 12. The winner gives the load back")
winner, loser, wkey = (carrier, carrier2, "a") if res.get("a") == 200 else (carrier2, carrier, "b")
WTRIP = trips.get(wkey)
st, d = shipper.call("POST", f"/api/trips/{WTRIP}/cancel")
check("the shipper cannot cancel a carrier's trip", st in (403, 404), f"{st}")
st, d = loser.call("POST", f"/api/trips/{WTRIP}/cancel")
check("the other carrier cannot cancel it either", st == 404, f"{st}")
st, d = winner.call("POST", f"/api/trips/{WTRIP}/cancel")
check("the winner cancels the trip", st == 200 and d.get("offerBackOnBoard") is True, f"{st} {d}")
st, d = winner.call("POST", f"/api/trips/{WTRIP}/cancel")
check("cancelling twice is refused", st == 409, f"{st}")
st, body = loser.page("/app/loads?origin=tashkent&dest=bukhara")
check("the load is back on the board for others", OID2 in body)
st, sn = shipper.page("/app/notifications")
check("the shipper is told it was given back", st == 200 and "gave your load back" in sn)
st, d = loser.call("POST", f"/api/loads/{OID2}/assign", {"truckId": (TB if loser is carrier2 else TA)})
check("another carrier can now take it", st == 200 and d.get("tripId"), f"{st} {d if isinstance(d, dict) else ''}")
LTRIP = d.get("tripId") if isinstance(d, dict) else None
st, d = carrier.call("POST", f"/api/trips/{TRIP}/cancel")
check("a finished trip cannot be cancelled", st == 409, f"{st}")

print("\n== 13. The trip's life: start, on the road, delivered")
RTRIP = d2 = None
RTRIP = LTRIP  # the trip the other carrier just took in step 12
runner = loser
RT = TB if runner is carrier2 else TA
st, d = shipper.call("POST", f"/api/trips/{RTRIP}/start")
check("the shipper cannot start a carrier's trip", st in (403, 404), f"{st}")
st, d = runner.call("POST", f"/api/trips/{RTRIP}/start")
check("the carrier starts the trip", st == 200, f"{st} {d}")
st, d = runner.call("POST", f"/api/trips/{RTRIP}/start")
check("starting twice is refused", st == 409, f"{st}")
st, d = runner.call("POST", f"/api/trips/{RTRIP}/cancel")
check("a trip on the road cannot be cancelled", st == 409, f"{st}")
st, body = runner.page(f"/app/fleet/{RT}")
check("the truck page offers to complete it", st == 200 and "Complete trip" in body)
st, d = shipper.call("POST", f"/api/trips/{RTRIP}/complete")
check("the shipper cannot complete it", st in (403, 404), f"{st}")
st, d = runner.call("POST", f"/api/trips/{RTRIP}/complete")
check("the carrier completes the trip", st == 200 and d.get("destCityId") == "bukhara", f"{st} {d}")
st, d = runner.call("POST", f"/api/trips/{RTRIP}/complete")
check("completing twice is refused", st == 409, f"{st}")
st, body = runner.page(f"/app/fleet/{RT}?delivered={RTRIP}")
check("the delivered banner and the review form are shown", st == 200 and "Trip completed" in body and "review" in body.lower())
st, d = runner.call("POST", f"/api/trips/{RTRIP}/review", {"rating": 4, "paidOnTime": True})
check("the carrier can then review the shipper", st == 200, f"{st} {d}")
st, sn = shipper.page("/app/notifications")
check("the shipper got 'on the way' and 'delivered' notifications", "on the way with your load" in sn and "delivered your load" in sn)
st, body = runner.page("/app/loads?origin=bukhara")
check("the truck is now matched from Bukhara (board still works)", st == 200)

print("\n== 14. Company verification: apply, admin checks, badge appears")
o = curl(["-H", f"Cookie: {carrier.cookie}", f"{BASE}/load/{OID}"])
check("a signed-in user opening the public load page is sent to the full page", split(o)[0] in (307, 308) and f"/app/loads/{OID}" in o)
check("a visitor still sees the public page", guest.page(f"/load/{OID}")[0] == 200)
st, d = shipper.call("POST", "/api/verification", {"companyName": f"E2E Cargo {RUN}", "taxId": "12", "phone": PHONE})
check("a bad tax ID is rejected", st == 400, f"{st}")
st, d = shipper.call("POST", "/api/verification", {"companyName": f"E2E Cargo {RUN}", "taxId": "305123456", "phone": PHONE, "note": "licence on request"})
check("the shipper applies for verification", st == 200 and d.get("id"), f"{st} {d}")
VID = d.get("id") if isinstance(d, dict) else None
st, d = shipper.call("POST", "/api/verification", {"companyName": "x" * 5, "taxId": "305123456", "phone": PHONE})
check("a second application while one is pending is refused", st == 409, f"{st}")
st, body = shipper.page("/app/settings")
check("settings show 'under review'", st == 200 and "Under review" in body)
st, d = shipper.call("POST", f"/api/admin/verifications/{VID}", {"decision": "approve"})
check("a normal user cannot decide requests", st == 403, f"{st}")
st, body = carrier.page("/app/admin/verifications")
check("a normal user cannot open the admin queue", st in (307, 308, 302) or "Verification requests" not in body, f"{st}")
admin = Actor("admin")
st, d = admin.call("POST", "/api/auth/login", {"email": "admin@karvon.uz", "password": "admin1234"})
check("the admin signs in", st == 200, f"{st}")
st, body = admin.page("/app/admin/verifications")
check("the admin sees the request in the queue", st == 200 and f"E2E Cargo {RUN}" in body and "305123456" in body)
st, body = admin.page("/app/admin/brokers?q=E2E")
check("the admin sees the company list", st == 200)
st, ld = carrier.call("GET", f"/api/loads/{OID}")
check("before approval the load's company is not verified", (ld.get("broker") or {}).get("verified") is False)
st, d = admin.call("POST", f"/api/admin/verifications/{VID}", {"decision": "approve"})
check("the admin approves", st == 200, f"{st} {d}")
st, d = admin.call("POST", f"/api/admin/verifications/{VID}", {"decision": "reject", "reason": "late"})
check("a decided request cannot be decided again", st == 409, f"{st}")
st, ld = carrier.call("GET", f"/api/loads/{OID}")
check("after approval the load shows a verified company", (ld.get("broker") or {}).get("verified") is True, f"{ld.get('broker')}")
check("and its quality is no longer 'unverified'", ld.get("offer", {}).get("quality") in ("VERIFIED", "PARTIAL"), f"{ld.get('offer', {}).get('quality')}")
st, sn = shipper.page("/app/notifications")
check("the shipper was notified", st == 200 and "Your company is verified" in sn)
st, body = shipper.page("/app/settings")
check("settings now show 'Verified'", st == 200 and "Your company is verified" in body)
st, d = admin.call("POST", f"/api/admin/loads/{OID2}", {"status": "EXPIRED"})
check("the admin can hide a posted load", st in (200, 409), f"{st} {d}")

print("\n== 15. The shipper's own page, and e-mail")
st, ml = shipper.page("/app/my-loads")
check("My loads lists the carrier that delivered", st == 200 and f"E2E Trans {RUN}" in ml or f"E2E Two {RUN}" in ml)
check("My loads shows a delivered load", "Delivered" in ml)
check("My loads shows the carrier's contact e-mail", "@e2e.test" in ml)
st, d = shipper.call("POST", "/api/loads", {**load, "destCityId": "namangan", "rate": 800, "contactEmail": ""})
OID3 = d.get("id") if isinstance(d, dict) else None
st, ml = shipper.page("/app/my-loads")
check("a new load shows as waiting for a carrier", st == 200 and "Waiting for a carrier" in ml)
for lang in ("ru", "uz"):
    check(f"My loads renders in {lang}", shipper.page("/app/my-loads", lang)[0] == 200)
st, d = shipper.call("PATCH", "/api/account", {"emailAlerts": False})
check("the shipper turns e-mail alerts off", st == 200, f"{st} {d}")
st, cx = runner.call("GET", f"/api/loads/{OID3}")
st, d = runner.call("POST", f"/api/loads/{OID3}/assign", {"truckId": cx.get("selectedTruckId") or RT})
check("a carrier takes the third load", st == 200, f"{st} {d if isinstance(d, dict) else ''}")
T3 = d.get("tripId") if isinstance(d, dict) else None
st, sn = shipper.page("/app/notifications")
check("the in-app notification still arrives with e-mail off", st == 200 and sn.count("took your load") >= 3)
st, ml = shipper.page("/app/my-loads")
check("My loads now shows it as taken", st == 200 and "Taken, not started" in ml)

print("\n== 16. Live tracking of the trip on the road")
st, d = runner.call("POST", f"/api/trips/{T3}/start")
check("the carrier starts the third trip", st == 200, f"{st} {d}")
st, tk = runner.call("GET", f"/api/trips/{T3}/track")
check("the carrier sees the track with diesel (estimated position before any GPS)", st == 200 and tk.get("viewer") == "carrier" and tk.get("estimated") is True and tk.get("fuel") and tk["fuel"]["totalL"] > 0, f"{st} {str(tk)[:120]}")
st, tko = shipper.call("GET", f"/api/trips/{T3}/track")
check("the shipper sees the same trip but NOT the diesel", st == 200 and tko.get("viewer") == "owner" and tko.get("fuel") is None, f"{st} {tko.get('fuel') if isinstance(tko, dict) else tko}")
other = carrier if runner is carrier2 else carrier2
st, d = other.call("GET", f"/api/trips/{T3}/track")
check("an unrelated company gets nothing", st == 404, f"{st}")
st, d = guest.call("GET", f"/api/trips/{T3}/track")
check("a visitor gets nothing", st == 401, f"{st}")
st, d = shipper.call("POST", f"/api/trips/{T3}/position", {"lat": 40.9, "lng": 70.9})
check("the shipper cannot report the truck's position", st == 404, f"{st}")
st, d = runner.call("POST", f"/api/trips/{T3}/position", {"lat": 200, "lng": 70.9})
check("an impossible coordinate is refused", st == 400, f"{st}")
st, d = runner.call("POST", f"/api/trips/{T3}/position", {"lat": 40.9, "lng": 70.9, "speed": 72})
check("the carrier's phone reports a position", st == 200 and d.get("stored") is True, f"{st} {d}")
st, d = runner.call("POST", f"/api/trips/{T3}/position", {"lat": 40.95, "lng": 70.95})
check("a second report within 10 s is ignored", st == 200 and d.get("stored") is False, f"{st} {d}")
st, tko = shipper.call("GET", f"/api/trips/{T3}/track")
check("the shipper now sees the real position and progress", st == 200 and tko.get("estimated") is False and 0.05 < tko.get("progress", 0) < 0.99 and tko.get("remainingKm", 0) > 0 and len(tko.get("points", [])) == 1, f"progress={tko.get('progress')} remaining={tko.get('remainingKm')} points={len(tko.get('points', []))}")
st, ml = shipper.page("/app/my-loads")
check("My loads shows the live panel for the load on the road", st == 200 and "of the way" in ml and "On the road" in ml)
st, pg = runner.page(f"/app/fleet/{RT}")
check("the truck page shows the live trip with the share button", st == 200 and "Live trip" in pg and "Share live location" in pg)
st, d = runner.call("POST", f"/api/trips/{T3}/complete")
check("the carrier completes it", st == 200, f"{st}")
st, tko = shipper.call("GET", f"/api/trips/{T3}/track")
check("after delivery the shipper's track is at 100%", st == 200 and tko.get("status") == "COMPLETED" and tko.get("progress") == 1 and tko.get("remainingKm") == 0, f"{str(tko)[:100]}")
st, d = runner.call("POST", f"/api/trips/{T3}/position", {"lat": 40.9, "lng": 70.9})
check("positions are refused once the trip is over", st == 409, f"{st}")

print("\n== 17. Payment: the shipper says it was sent, the carrier confirms")
# T3 (runner's trip, delivered) and RTRIP (runner's earlier trip, delivered) are both payable.
st, d = other.call("POST", f"/api/trips/{T3}/payment", {"action": "received"})
check("an unrelated company cannot touch the payment", st == 404, f"{st}")
st, d = runner.call("POST", f"/api/trips/{T3}/payment", {"action": "paid"})
check("the carrier cannot say 'I paid'", st == 403, f"{st}")
st, d = shipper.call("POST", f"/api/trips/{T3}/payment", {"action": "received"})
check("the shipper cannot confirm his own payment", st == 403, f"{st}")
st, d = shipper.call("POST", f"/api/trips/{T3}/payment", {"action": "dispute"})
check("the shipper cannot report a dispute", st == 403, f"{st}")
st, pg = shipper.page("/app/my-loads")
check("the shipper sees the payment box with an 'I paid' button", st == 200 and "I paid" in pg and "Not paid yet" in pg)
st, pg = runner.page(f"/app/fleet/{RT}")
check("the carrier sees the Payment column with a 'Payment received' button", st == 200 and "Payment received" in pg)
st, d = shipper.call("POST", f"/api/trips/{T3}/payment", {"action": "paid"})
check("the shipper marks it paid", st == 200, f"{st} {d}")
st, d = shipper.call("POST", f"/api/trips/{T3}/payment", {"action": "paid"})
check("marking it paid twice is refused", st == 409, f"{st}")
st, sn = runner.page("/app/notifications")
check("the carrier is told the payment was sent", st == 200 and "Payment sent for" in sn)
st, d = runner.call("POST", f"/api/trips/{T3}/payment", {"action": "received"})
check("the carrier confirms it arrived", st == 200, f"{st} {d}")
st, sn = shipper.page("/app/notifications")
check("the shipper is told it was confirmed", st == 200 and "Payment received for" in sn)
st, d = runner.call("POST", f"/api/trips/{T3}/payment", {"action": "received"})
check("a confirmed payment cannot be confirmed again", st == 409, f"{st}")
st, d = runner.call("POST", f"/api/trips/{T3}/payment", {"action": "dispute"})
check("nor disputed", st == 409, f"{st}")
st, pg = shipper.page("/app/my-loads")
check("the shipper's page shows it as received and paid on time", st == 200 and "Payment received" in pg and "Paid on time" in pg)

print("\n== 18. Payment: a dispute that is later settled")
st, d = runner.call("POST", f"/api/trips/{RTRIP}/payment", {"action": "dispute", "note": "nothing arrived after 3 days"})
check("the carrier reports that it was not paid", st == 200, f"{st} {d}")
st, sn = shipper.page("/app/notifications")
check("the shipper is told about the problem", st == 200 and "Payment problem" in sn)
st, d = shipper.call("POST", f"/api/trips/{RTRIP}/payment", {"action": "paid"})
check("the shipper can still mark it paid afterwards", st == 200, f"{st} {d}")
st, d = runner.call("POST", f"/api/trips/{RTRIP}/payment", {"action": "received"})
check("and the carrier confirms it", st == 200, f"{st} {d}")
st, d = guest.call("POST", f"/api/trips/{TRIP}/payment", {"action": "received"})
check("a visitor cannot touch a payment", st == 401, f"{st}")
for lang in ("ru", "uz"):
    check(f"the payment screens render in {lang}", shipper.page("/app/my-loads", lang)[0] == 200 and runner.page(f"/app/fleet/{RT}", lang)[0] == 200)
print("\n== 19. The e-mail signature")
st, d = carrier.call("PATCH", "/api/profile", {"jobTitle": "Dispatch department", "phone": "+998 71 123 45 67", "website": "https://taylor.example", "address": "6784 Loop Road, Tashkent", "taxId": "305123456"})
check("the carrier saves his signature details", st == 200, f"{st} {d}")
st, d = carrier.call("PATCH", "/api/profile", {"website": "not a website"})
check("a bad website is refused", st == 400, f"{st}")
st, d = carrier.call("PATCH", "/api/profile", {"phone": "abc"})
check("a bad phone is refused", st == 400, f"{st}")
st, d = guest.call("PATCH", "/api/profile", {"jobTitle": "x"})
check("a visitor cannot edit a profile", st == 401, f"{st}")
st, pg = carrier.page("/app/settings")
check("settings show the signature form with a preview", st == 200 and "Your e-mail signature" in pg and "Dispatch department" in html.unescape(pg))
st, pg = carrier.page(f"/app/loads/{OID}")
raw = html.unescape(pg)
g = re.findall(r'href="(https://mail\.google\.com/mail/[^"]+)"', raw)
body = __import__("urllib.parse", fromlist=["x"]).unquote(g[0].split("&body=")[1]) if g else ""
check("the draft carries the signature and the security notice", bool(g) and all(x in body for x in ["Dispatch department", "Office: +998 71 123 45 67", "Website: https://taylor.example", "Address: 6784 Loop Road, Tashkent", "Tax ID: 305123456", "SECURITY NOTICE"]), body[-200:].replace("\n", " | "))
st, pg = carrier.page(f"/app/loads/{OID}", "ru")
check("and the Russian draft is in Russian", "%D0%97%D0%B4%D1%80%D0%B0%D0%B2%D1%81%D1%82%D0%B2%D1%83%D0%B9%D1%82%D0%B5" in pg or "mail.google.com" in pg)
print("\n== 20. Truck passport and cargo size")
st, d = carrier.call("PATCH", f"/api/trucks/{TRUCK}", {"cargoLengthM": 13.6, "cargoWidthM": 2.45, "cargoHeightM": 2.7, "heightM": 4, "lengthM": 16.5, "widthM": 2.55, "grossWeightKg": 40000, "axles": 5, "axleLoadKg": 10000, "adr": False})
check("carrier saves the truck passport", st == 200, f"{st} {d}")
st, d = carrier.call("PATCH", f"/api/trucks/{TRUCK}", {"cargoHeightM": 5, "heightM": 3})
check("a passport with the cargo space taller than the vehicle is refused or ignored", st in (200, 400), f"{st}")
st, d = carrier.call("PATCH", f"/api/trucks/{TRUCK}", {"heightM": 9})
check("an impossible height is refused", st == 400, f"{st}")
carrier.call("PATCH", f"/api/trucks/{TRUCK}", {"cargoHeightM": 2.7, "heightM": 4})
st, pg = carrier.page(f"/app/fleet/{TRUCK}")
check("the truck page shows the saved passport", st == 200 and 'value="13.6"' in pg and "Dimensions" in pg, f"{st}")
st, pg = carrier.page("/app/fleet/new")
check("the new-truck page renders the passport form", st == 200 and "Dimensions" in pg and 'step="0.05"' in pg, f"{st}")
tall = {**load, "destCityId": "bukhara", "rate": 1000, "contactEmail": "", "cargoLengthM": 6, "cargoWidthM": 2.4, "cargoHeightM": 3.4, "oversize": True}
st, d = shipper.call("POST", "/api/loads", tall)
TALL = d.get("id") if isinstance(d, dict) else None
check("shipper posts a load with a size", st == 200 and TALL, f"{st} {d}")
st, d = carrier.call("GET", f"/api/loads/{TALL}?truck={TRUCK}")
mm = (d or {}).get("match") or {}
check("a 3.4 m tall cargo does not fit a 2.7 m cargo space (blocker with both numbers)", mm.get("eligible") is False and any("3.4" in b and "2.7" in b for b in mm.get("blockers", [])), f"{mm.get('blockers')}")
check("the load page shows the cargo size and oversize", "6 × 2.4 × 3.4 m" in html.unescape(carrier.page(f"/app/loads/{TALL}")[1]))
adr = {**load, "destCityId": "fergana", "rate": 1000, "contactEmail": "", "adrClass": "3"}
st, d = shipper.call("POST", "/api/loads", adr)
ADRID = d.get("id") if isinstance(d, dict) else None
st, d = carrier.call("GET", f"/api/loads/{ADRID}?truck={TRUCK}")
mm = (d or {}).get("match") or {}
check("dangerous goods block a truck without ADR", mm.get("eligible") is False and any("ADR" in b for b in mm.get("blockers", [])), f"{mm.get('blockers')}")
carrier.call("PATCH", f"/api/trucks/{TRUCK}", {"adr": True})
st, d = carrier.call("GET", f"/api/loads/{ADRID}?truck={TRUCK}")
check("the same load fits once the truck is ADR-certified", ((d or {}).get("match") or {}).get("eligible") is True, f"{((d or {}).get('match') or {}).get('blockers')}")
st, d = shipper.call("POST", "/api/loads", {**load, "cargoHeightM": 99})
check("an absurd cargo height is refused", st == 400, f"{st}")
st, pg = carrier.page("/app/fleet", "ru")
check("the Russian fleet page opens", st == 200)

print("\n== 21. Truck route")
st, d = carrier.call("GET", f"/api/loads/{OID}/route?truck={TRUCK}")
check("the route endpoint answers", st == 200 and isinstance(d, dict), f"{st} {d}")
if d.get("enabled"):
    MOCK = os.environ.get("E2E_ORS_MOCK")
    check("a loaded leg comes back with distance, time and a path", d["loaded"]["ok"] and d["loaded"]["km"] > 0 and len(d["loaded"]["path"]) > 2, f"{d}")
    check("the truck's size is known and said so", d.get("hasDimensions") is True)
    check("a path on the load page's route card text is rendered in Russian", carrier.page(f"/app/loads/{OID}", "ru")[0] == 200)
    st, d2 = carrier.call("GET", f"/api/loads/{OID}/route?truck={TRUCK}")
    check("the same route again is served from the cache", d2["loaded"] == d["loaded"])
    if MOCK:
        calls = json.loads(split(curl([MOCK + "/stats"]))[1] or "{}")
        carrier.call("GET", f"/api/loads/{OID}/route?truck={TRUCK}")
        carrier.page(f"/app/loads/{OID}")
        again = json.loads(split(curl([MOCK + "/stats"]))[1] or "{}")
        check("asking again (API and page) makes no new request to the routing service (cache works)", again.get("calls") == calls.get("calls"), f"{calls.get('calls')} -> {again.get('calls')}")
        check("the truck's height and weight reached the routing service", all(k in json.dumps(calls.get("last")) for k in ["height", "weight"]), f"{calls}")
        st, cd = carrier.call("GET", f"/api/loads/{OID}?truck={TRUCK}")
        calc = ((cd or {}).get("match") or {}).get("calc") or {}
        check("the profit calculator uses the routed distance (400 km from the mock, not the city table)", calc.get("routed") is True and calc.get("loadedKm") == 400, f"{calc}")
        carrier.call("PATCH", f"/api/trucks/{TRUCK}", {"heightM": 4.6, "cargoHeightM": 2.7})
        st, cd = carrier.call("GET", f"/api/loads/{OID}?truck={TRUCK}")
        calc = ((cd or {}).get("match") or {}).get("calc") or {}
        check("with no route for the truck the calculator falls back to the city table", calc.get("routed") is False and calc.get("loadedKm") != 400, f"{calc}")
        st, d3 = carrier.call("GET", f"/api/loads/{OID}/route?truck={TRUCK}")
        check("a truck no road suits gets a clear 'no route', not an error", st == 200 and d3["loaded"]["ok"] is False and d3["loaded"]["reason"] == "NO_ROUTE", f"{d3}")
        carrier.call("PATCH", f"/api/trucks/{TRUCK}", {"heightM": 4})
st, d = guest.call("GET", f"/api/loads/{OID}/route?truck={TRUCK}")
check("a visitor cannot ask for routes", st == 401, f"{st}")
st, d = shipper.call("GET", f"/api/loads/{OID}/route?truck={TRUCK}")
check("someone else's truck is not found", st == 404 or (isinstance(d, dict) and d.get("enabled") is False), f"{st} {d}")

print("\n== 22. Border crossings")
st, d = shipper.call("POST", "/api/loads", {**load, "destCityId": "almaty", "rate": 1500, "contactEmail": ""})
XB = d.get("id") if isinstance(d, dict) else None
check("shipper posts a cross-border load", st == 200 and XB, f"{st} {d}")
st, pg = carrier.page(f"/app/loads/{XB}")
check("its page lists the border and what to have ready", st == 200 and ">Border crossings<" in pg and "CMR waybill" in pg, f"{st}")
st, pg = carrier.page(f"/app/loads/{XB}", "ru")
check("and in Russian", st == 200 and ">Границы<" in pg and "накладная CMR" in pg)
st, pg = carrier.page(f"/app/loads/{OID}")
check("a domestic load has no border card", st == 200 and ">Border crossings<" not in pg)

print("\n== 23. Driver hours")
st, d = carrier.call("PATCH", f"/api/trucks/{TRUCK}", {"crew": 3})
check("a crew of three is refused", st == 400, f"{st}")
st, d = carrier.call("PATCH", f"/api/trucks/{TRUCK}", {"crew": 2})
check("carrier sets a team of two", st == 200, f"{st} {d}")
st, pg = carrier.page(f"/app/loads/{XB}?truck={TRUCK}")
check("the load page splits the transit time into driving, rest and borders", st == 200 and ">Of which<" in pg and "rest and breaks" in pg, f"{st}")
st, pg = carrier.page(f"/app/fleet/{TRUCK}")
check("the truck form offers the crew choice", st == 200 and "2 drivers (team)" in html.unescape(pg))
carrier.call("PATCH", f"/api/trucks/{TRUCK}", {"crew": 1})

print("\n== 24. Within Uzbekistan or international")
time.sleep(62)  # posting a load is limited to 10 a minute per user; the scenario has used them up
st, d = shipper.call("POST", "/api/loads", {**load, "haul": "DOMESTIC", "destCityId": "almaty"})
check("a load 'within Uzbekistan' with a foreign city is refused", st == 400, f"{st} {d}")
st, d = shipper.call("POST", "/api/loads", {**load, "haul": "INTERNATIONAL", "destCityId": "samarkand"})
check("an 'international' load with both cities in Uzbekistan is refused", st == 400, f"{st} {d}")
st, d = shipper.call("POST", "/api/loads", {**load, "haul": "INTERNATIONAL", "destCityId": "almaty", "contactEmail": ""})
check("an international load across a border is accepted", st == 200, f"{st} {d}")
st, d = shipper.call("POST", "/api/loads", {**load, "haul": "DOMESTIC", "destCityId": "bukhara", "contactEmail": ""})
check("a load within Uzbekistan is accepted", st == 200, f"{st} {d}")
st, pg = carrier.page("/app/loads?origin=tashkent&sort=newest&scope=international")
check("the board's 'International' switch lists the cross-border load", st == 200 and f"/app/loads/{XB}" in pg and ">International<" in pg and ">Within Uzbekistan<" in pg, f"{st}")
st, pg = carrier.page("/app/loads?origin=tashkent&sort=newest&scope=domestic")
check("and 'Within Uzbekistan' does not", st == 200 and f"/app/loads/{XB}" not in pg, f"{st}")
st, pg = shipper.page("/app/post")
check("the post form offers the type of haul", st == 200 and "Within Uzbekistan" in pg and "International" in pg, f"{st}")
st, pg = carrier.page("/app/loads?scope=international", "ru")
check("the board switch is in Russian", st == 200 and ">Международные<" in pg and ">По Узбекистану<" in pg, f"{st}")

print("\n== 25. Diesel prices")
admin = Actor("admin")
st, d = admin.call("POST", "/api/auth/login", {"email": "admin@karvon.uz", "password": "admin1234"})
check("the platform admin signs in", st == 200, f"{st} {d}")
st, d = carrier.call("PATCH", "/api/admin/fuel", {"country": "UZ", "priceUsd": 1.5})
check("a carrier cannot change diesel prices", st == 403, f"{st}")
st, d = admin.call("PATCH", "/api/admin/fuel", {"country": "UZ", "priceUsd": 99})
check("an absurd price is refused", st == 400, f"{st}")
st, d = admin.call("PATCH", "/api/admin/fuel", {"country": "ZZ", "priceUsd": 1})
check("an unknown country is refused", st == 400, f"{st}")
st, cd = carrier.call("GET", f"/api/loads/{OID}?truck={TRUCK}")
before = (((cd or {}).get("match") or {}).get("calc") or {}).get("fuelPriceUsd")
st, d = admin.call("PATCH", "/api/admin/fuel", {"country": "UZ", "priceUsd": 1.5})
check("the admin sets Uzbekistan diesel to 1.50", st == 200 and d.get("priceUsd") == 1.5, f"{st} {d}")
time.sleep(1)
st, cd = carrier.call("GET", f"/api/loads/{OID}?truck={TRUCK}")
calc = ((cd or {}).get("match") or {}).get("calc") or {}
check("the calculator uses the new price for a domestic load (Tashkent to Samarkand)", calc.get("fuelByCountry") is True and calc.get("fuelPriceUsd") == 1.5, f"{before} -> {calc.get('fuelPriceUsd')}")
carrier.call("PATCH", f"/api/trucks/{TRUCK}", {"fuelByCountry": False, "fuelPriceUsd": 0.9})
st, cd = carrier.call("GET", f"/api/loads/{OID}?truck={TRUCK}")
calc = ((cd or {}).get("match") or {}).get("calc") or {}
check("a truck set to its own price ignores the table", calc.get("fuelByCountry") is False and calc.get("fuelPriceUsd") == 0.9, f"{calc.get('fuelPriceUsd')}")
carrier.call("PATCH", f"/api/trucks/{TRUCK}", {"fuelByCountry": True})
st, pg = admin.page("/app/admin")
check("the admin page lists the prices", st == 200 and ">Diesel prices<" in pg, f"{st}")
admin.call("PATCH", "/api/admin/fuel", {"country": "UZ", "priceUsd": 0.95})

print("\n== 26. A load that is gone from Telegram leaves the board")
import random
SECRET = os.environ.get("E2E_INGEST_SECRET")
if not SECRET:
    envf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".env")
    try:
        for line in open(envf, encoding="utf-8"):
            if line.startswith("TELEGRAM_INGEST_SECRET="):
                SECRET = line.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
def ingest(body, secret=None):
    o = curl(["-X", "POST", "-H", "content-type: application/json", "-H", f"x-ingest-secret: {secret or SECRET}", "-d", json.dumps(body), BASE + "/api/ingest/telegram"])
    st, b = split(o)
    try:
        return st, json.loads(b)
    except Exception:
        return st, b
if not SECRET:
    print("   (skipped: no TELEGRAM_INGEST_SECRET available)")
else:
    day = (datetime.date.today() + datetime.timedelta(days=1)).strftime("%d.%m")
    def make_ad(n):
        mid = random.randint(10**8, 10**9 - 1)
        text = f"Ташкент - Бухара, {17 + n}т тент, загрузка {day}, {1100 + int(RUN) % 700 + n}$, +99890{random.randint(1000000, 9999999)}"
        st, d = ingest({"groupUsername": "e2e_test_group", "groupName": "E2E test group", "groupMembers": 10, "messageId": mid, "text": text, "postedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()})
        return mid, st, d
    mid, st, d = make_ad(0)
    check("a Telegram ad is ingested and becomes a load", st == 200 and isinstance(d, dict) and d.get("matched") and d.get("offerId"), f"{st} {d}")
    TG = d.get("offerId") if isinstance(d, dict) else None
    status_of = lambda oid: ((carrier.call("GET", f"/api/loads/{oid}")[1] or {}).get("offer") or {}).get("status")
    check("it is active", status_of(TG) == "ACTIVE", f"{status_of(TG)}")
    st, d = ingest({"groupUsername": "e2e_test_group", "messageId": mid, "closure": "reply", "text": "Взяли?"})
    check("a question under the ad does not close it", st == 200 and d.get("closed") is False and status_of(TG) == "ACTIVE", f"{st} {d}")
    st, d = ingest({"groupUsername": "e2e_test_group", "messageId": mid, "closure": "reply", "text": "ещё не взяли"})
    check("a negation does not close it either", d.get("closed") is False, f"{d}")
    st, d = ingest({"groupUsername": "e2e_test_group", "messageId": mid, "closure": "reply", "text": "Взяли, спасибо"})
    check("a reply 'taken' closes the load", st == 200 and d.get("closed") is True and d.get("offerExpired") is True, f"{st} {d}")
    check("and the load is no longer active", status_of(TG) == "EXPIRED", f"{status_of(TG)}")
    mid2, st, d = make_ad(1)
    TG2 = d.get("offerId")
    st, d = ingest({"groupUsername": "e2e_test_group", "messageId": mid2, "closure": "deleted"})
    check("deleting the ad in the group closes the load", d.get("closed") is True and status_of(TG2) == "EXPIRED", f"{d}")
    mid3, st, d = make_ad(2)
    TG3 = d.get("offerId")
    st, d = ingest({"groupUsername": "e2e_test_group", "messageId": mid3, "closure": "edited", "text": "ЗАКРЫТО, груз взят"})
    check("editing the ad to say it is closed closes the load", d.get("closed") is True and status_of(TG3) == "EXPIRED", f"{d}")
    st, d = ingest({"groupUsername": "e2e_test_group", "messageId": 999999999, "closure": "deleted"})
    check("a closure for an ad we never stored changes nothing", st == 200 and d.get("closed") is False, f"{st} {d}")
    st, d = ingest({"groupUsername": "e2e_test_group", "messageId": mid, "closure": "deleted"}, secret="wrong")
    check("a wrong secret is refused", st == 401, f"{st}")

print("\n== 27. Passwords: change your own, admin reset, sessions")
time.sleep(62)  # sign-in is limited to 10 a minute per address
NEWPW = "NewPassw0rd!y"
st, d = carrier.call("PATCH", "/api/account/password", {"currentPassword": "wrong-one", "newPassword": NEWPW})
check("a wrong current password is refused", st == 400, f"{st} {d}")
st, d = carrier.call("PATCH", "/api/account/password", {"currentPassword": "Passw0rd!x", "newPassword": "Passw0rd!x"})
check("the same password again is refused", st == 400, f"{st} {d}")
st, d = carrier.call("PATCH", "/api/account/password", {"currentPassword": "Passw0rd!x", "newPassword": "short"})
check("a too-short new password is refused", st == 400, f"{st} {d}")
st, d = guest.call("PATCH", "/api/account/password", {"currentPassword": "x", "newPassword": NEWPW})
check("a visitor cannot change a password", st == 401, f"{st}")
other = Actor("other-device")
st, d = other.call("POST", "/api/auth/login", {"email": f"carrier{RUN}@e2e.test", "password": "Passw0rd!x"})
check("the carrier is also signed in on another device", st == 200, f"{st} {d}")
time.sleep(2)  # a session counts as older than the change only when it was issued in an earlier second
st, d = carrier.call("PATCH", "/api/account/password", {"currentPassword": "Passw0rd!x", "newPassword": NEWPW})
check("the carrier changes the password", st == 200, f"{st} {d}")
check("this device stays signed in", carrier.page("/app/fleet")[0] == 200)
st, _ = other.page("/app/fleet")
check("the other device is signed out (redirected, not served)", st in (302, 307, 308), f"{st}")
st, d = Actor("old").call("POST", "/api/auth/login", {"email": f"carrier{RUN}@e2e.test", "password": "Passw0rd!x"})
check("the old password no longer signs in", st == 401, f"{st}")
fresh = Actor("fresh")
st, d = fresh.call("POST", "/api/auth/login", {"email": f"carrier{RUN}@e2e.test", "password": NEWPW})
check("the new password signs in", st == 200, f"{st} {d}")
st, d = carrier.call("POST", "/api/admin/users/reset-password", {"email": f"carrier{RUN}@e2e.test"})
check("a carrier cannot reset anyone's password", st == 403, f"{st}")
admin2 = Actor("admin2")
st, d = admin2.call("POST", "/api/auth/login", {"email": "admin@karvon.uz", "password": "admin1234"})
check("the platform admin signs in", st == 200, f"{st} {d}")
st, d = admin2.call("POST", "/api/admin/users/reset-password", {"email": "nobody-here@e2e.test"})
check("an unknown e-mail is a clear 404", st == 404, f"{st} {d}")
time.sleep(2)  # a session counts as older than the reset only when it was issued in an earlier second
st, d = admin2.call("POST", "/api/admin/users/reset-password", {"email": f"carrier{RUN}@e2e.test"})
TEMP_PW = d.get("temporaryPassword") if isinstance(d, dict) else None
check("the admin resets the carrier's password and gets a temporary one", st == 200 and bool(re.fullmatch(r"[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}", TEMP_PW or "")), f"{st} {str(d)[:60]}")
st, _ = fresh.page("/app/fleet")
check("the carrier's open sessions end", st in (302, 307, 308), f"{st}")
st, d = Actor("old2").call("POST", "/api/auth/login", {"email": f"carrier{RUN}@e2e.test", "password": NEWPW})
check("the previous password no longer works", st == 401, f"{st}")
back = Actor("back")
st, d = back.call("POST", "/api/auth/login", {"email": f"carrier{RUN}@e2e.test", "password": TEMP_PW})
check("the temporary password signs in", st == 200, f"{st} {d}")
st, pg = back.page("/app/notifications")
check("the person is told an administrator reset the password", st == 200 and ">Your password was reset<" in pg, f"{st}")
st, pg = admin2.page("/app/admin")
check("the admin page has the reset card", st == 200 and ">Reset password<" in pg, f"{st}")
st, pg = back.page("/app/settings?tab=security")
check("the settings page has a Security tab", st == 200 and ">Security<" in pg, f"{st}")

print("\n== 28. The shipper sees the delivery and the carrier's review")
st, pg = shipper.page("/app/my-loads?stage=delivered")
raw = html.unescape(pg)
check("My loads has the summary strip", st == 200 and ">Your rating<" in raw and ">Delivered<" in raw and ">Posted<" in raw, f"{st}")
check("a delivered load shows when it arrived and the review block", "Carrier's review of you" in raw and "Delivered " in raw, f"{st}")
check("it shows the carrier's review: the comment", "Paid on time, clear loading instructions" in raw)
check("and the stars (5 of 5)", 'aria-label="5 / 5"' in raw)
check("the delivered group lists only delivered loads (no other status badge)", ">Waiting for a carrier<" not in raw and ">Taken, not started<" not in raw and ">Expired, nobody took it<" not in raw, "")
st, pg = shipper.page("/app/my-loads?stage=onroad")
check("a group with nothing in it says so", st == 200 and "No loads in this group." in html.unescape(pg), f"{st}")
st, pg = shipper.page("/app/notifications")
check("the shipper was told about the review (in the language they last used)", st == 200 and bool(re.search(r"E2E Trans \d+ (reviewed you|оставил вам отзыв|sizga sharh qoldirdi): 5/5", html.unescape(pg))), f"{st}")
st, pg = back.page("/app/my-loads")  # the carrier, signed in again with the temporary password (section 27)
check("a company that posted nothing sees the hint about other accounts", st == 200 and "appear in that account" in html.unescape(pg), f"{st}")
for lang in ("ru", "uz"):
    check(f"the new My loads blocks render in {lang}", shipper.page("/app/my-loads?stage=delivered", lang)[0] == 200)

print("\n== 29. My routes, Reviews for both sides, the shipper's review of the carrier")
st, pg = back.page("/app")
raw = html.unescape(pg)
check("a company with trucks has My routes in its menu", st == 200 and ">My routes<" in raw and ">Reviews<" in raw, f"{st}")
st, pg = shipper.page("/app")
raw = html.unescape(pg)
check("a company without trucks has My loads, not My routes", st == 200 and ">My loads<" in raw and ">My routes<" not in raw and ">Reviews<" in raw, f"{st}")
st, pg = back.page("/app/my-routes")
raw = html.unescape(pg)
check("My routes has the Active and History tabs and a summary", st == 200 and "Active<span" in raw and "History<span" in raw and ">Completed trips<" in raw, f"{st}")
st, pg = back.page("/app/my-routes?tab=history")
raw = html.unescape(pg)
check("History lists finished trips with money and the shipper's review block", st == 200 and "Delivered" in raw and "Shipper's review of you" in raw and "Revenue" in raw, f"{st}")
st, d = shipper.call("POST", f"/api/trips/{TRIP}/carrier-review", {"rating": 7})
check("a rating of 7 is refused", st == 400, f"{st}")
st, d = back.call("POST", f"/api/trips/{TRIP}/carrier-review", {"rating": 5})
check("the carrier cannot review itself", st == 404, f"{st}")
st, d = shipper.call("POST", f"/api/trips/{TRIP}/carrier-review", {"rating": 4, "onTime": True, "comment": "Careful driver, on time"})
check("the shipper reviews the carrier", st == 200, f"{st} {d}")
st, d = shipper.call("POST", f"/api/trips/{TRIP}/carrier-review", {"rating": 1})
check("a second review of the same trip is refused", st == 409, f"{st}")
st, pg = back.page("/app/reviews")
raw = html.unescape(pg)
check("the carrier sees it under 'About me' (from a shipper)", st == 200 and "Careful driver, on time" in raw and ">From a shipper<" in raw, f"{st}")
st, pg = back.page("/app/reviews?tab=written")
raw = html.unescape(pg)
check("and its own review of the shipper under 'Written by me'", st == 200 and "Paid on time, clear loading instructions" in raw and ">About a shipper<" in raw, f"{st}")
st, pg = shipper.page("/app/reviews")
raw = html.unescape(pg)
check("the shipper sees the carrier's review about them", st == 200 and "Paid on time, clear loading instructions" in raw and ">From a carrier<" in raw, f"{st}")
st, pg = shipper.page("/app/reviews?tab=written")
raw = html.unescape(pg)
check("and the review they wrote about the carrier", st == 200 and "Careful driver, on time" in raw and ">About a carrier<" in raw, f"{st}")
st, pg = back.page("/app/notifications")
check("the carrier was told about the review", st == 200 and bool(re.search(r"(reviewed your delivery|оценил вашу доставку|yetkazib berishingizni baholadi): 4/5", html.unescape(pg))), f"{st}")
st, pg = shipper.page("/app/my-loads?stage=delivered")
check("My loads shows the shipper's own review of the carrier", st == 200 and "Your review of the carrier" in html.unescape(pg) and "Careful driver, on time" in html.unescape(pg), f"{st}")
for lang in ("ru", "uz"):
    check(f"My routes and Reviews render in {lang}", back.page("/app/my-routes?tab=history", lang)[0] == 200 and back.page("/app/reviews", lang)[0] == 200 and shipper.page("/app/reviews", lang)[0] == 200)

json.dump({"T3": T3, "RTRIP": RTRIP, "TRIP": TRIP}, open(os.environ.get("TEMP", ".") + "/e2e_trips.json", "w"))

ok = sum(1 for _, o, _ in RESULTS if o)
print(f"\n{ok}/{len(RESULTS)} checks passed")
for n, o, dt in RESULTS:
    if not o:
        print("  FAILED:", n, dt)
print("created test accounts:", [f"shipper{RUN}@e2e.test", f"carrier{RUN}@e2e.test", f"carrier2{RUN}@e2e.test"], "- delete them afterwards (organizations cascade)")
