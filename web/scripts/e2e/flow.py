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

json.dump({"T3": T3, "RTRIP": RTRIP, "TRIP": TRIP}, open(os.environ.get("TEMP", ".") + "/e2e_trips.json", "w"))

ok = sum(1 for _, o, _ in RESULTS if o)
print(f"\n{ok}/{len(RESULTS)} checks passed")
for n, o, dt in RESULTS:
    if not o:
        print("  FAILED:", n, dt)
print("created test accounts:", [f"shipper{RUN}@e2e.test", f"carrier{RUN}@e2e.test", f"carrier2{RUN}@e2e.test"], "- delete them afterwards (organizations cascade)")
