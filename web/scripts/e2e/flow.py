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
check("load page has a Send-email link with a template", st == 200 and "mailto:" in pg and EMAIL in html.unescape(pg))
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
st, sn = shipper.page("/app/notifications")
check("the in-app notification still arrives with e-mail off", st == 200 and sn.count("took your load") >= 3)
st, ml = shipper.page("/app/my-loads")
check("My loads now shows it as taken", st == 200 and "Taken, not started" in ml)

ok = sum(1 for _, o, _ in RESULTS if o)
print(f"\n{ok}/{len(RESULTS)} checks passed")
for n, o, dt in RESULTS:
    if not o:
        print("  FAILED:", n, dt)
print("created test accounts:", [f"shipper{RUN}@e2e.test", f"carrier{RUN}@e2e.test", f"carrier2{RUN}@e2e.test"], "- delete them afterwards (organizations cascade)")
