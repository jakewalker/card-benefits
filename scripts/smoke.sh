#!/bin/bash
# E2E smoke test against the local dev server.
set -euo pipefail
BASE=http://localhost:8788/api
fail() { echo "FAIL: $1"; exit 1; }

echo "== 1. import card with 3 benefits (atomic)"
IMPORT=$(curl -s -X POST $BASE/cards/import -H 'content-type: application/json' -d '{
  "card": {"name":"Amex Platinum","issuer":"American Express","annualFeeCents":69500,"anniversaryDate":"2023-02-15"},
  "benefits": [
    {"name":"Uber Cash","valueCents":1500,"frequency":"monthly","anchor":"calendar","automatic":false},
    {"name":"Airline Fee Credit","valueCents":20000,"frequency":"annual","anchor":"calendar","automatic":false},
    {"name":"CLEAR Credit","valueCents":19900,"frequency":"annual","anchor":"anniversary","automatic":true}
  ]}')
CARD_ID=$(echo "$IMPORT" | node -pe 'JSON.parse(require("fs").readFileSync(0)).card.id')
UBER_ID=$(echo "$IMPORT" | node -pe 'const j=JSON.parse(require("fs").readFileSync(0)); j.benefits.find(b=>b.name==="Uber Cash").id')
CLEAR_ID=$(echo "$IMPORT" | node -pe 'const j=JSON.parse(require("fs").readFileSync(0)); j.benefits.find(b=>b.name==="CLEAR Credit").id')
echo "card=$CARD_ID"

echo "== 2. dashboard: expect 3 current items, CLEAR effectiveUsed=true (automatic), fee renewal window A*-02-15"
DASH=$(curl -s $BASE/dashboard)
echo "$DASH" | node -e '
const j=JSON.parse(require("fs").readFileSync(0));
const assert=(c,m)=>{if(!c){console.error("FAIL:",m);process.exit(1)}};
assert(j.current.length===3, "current length "+j.current.length);
const clear=j.current.find(i=>i.name==="CLEAR Credit");
assert(clear.effectiveUsed===true && clear.automatic===true, "CLEAR should be auto-checked");
const uber=j.current.find(i=>i.name==="Uber Cash");
assert(uber.window.key==="2026-07" && uber.window.start==="2026-07-01" && uber.window.end==="2026-07-31", "uber window "+JSON.stringify(uber.window));
assert(j.feeRenewals.length===1, "feeRenewals");
const fee=j.feeRenewals[0];
assert(fee.window.start==="2026-02-15" && fee.window.end==="2027-02-14", "fee window "+JSON.stringify(fee.window));
const clearItem=j.current.find(i=>i.name==="CLEAR Credit");
assert(clearItem.window.key==="A2026-02-15", "CLEAR key "+clearItem.window.key);
console.log("OK: dashboard shape, windows, auto-check");
'

echo "== 3. check off Uber Cash with a comment"
USAGE=$(curl -s -X PUT $BASE/benefits/$UBER_ID/usage/2026-07 -H 'content-type: application/json' -d '{"used":true,"comment":"Uber Eats lunch 7/3"}')
echo "$USAGE" | node -e '
const j=JSON.parse(require("fs").readFileSync(0));
if(j.used!==true||j.comment!=="Uber Eats lunch 7/3"){console.error("FAIL: usage row",JSON.stringify(j));process.exit(1)}
console.log("OK: usage upsert");
'

echo "== 4. uncheck automatic CLEAR (credit did not post)"
curl -s -X PUT $BASE/benefits/$CLEAR_ID/usage/A2026-02-15 -H 'content-type: application/json' -d '{"used":false}' > /dev/null
curl -s $BASE/dashboard | node -e '
const j=JSON.parse(require("fs").readFileSync(0));
const clear=j.current.find(i=>i.name==="CLEAR Credit");
if(clear.effectiveUsed!==false||clear.explicit!==true){console.error("FAIL: CLEAR uncheck",JSON.stringify(clear));process.exit(1)}
console.log("OK: automatic benefit explicitly unchecked");
'

echo "== 5. invalid cycle key rejected"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT $BASE/benefits/$UBER_ID/usage/2026-Q3 -H 'content-type: application/json' -d '{"used":true}')
[ "$CODE" = "400" ] || fail "expected 400 for wrong-frequency key, got $CODE"
echo "OK: invalid_cycle_key -> 400"

echo "== 6. X-Debug-Today: jump to July 28 -> Uber Cash (unused? no, used) ... uncheck first, then expect expiringSoon"
curl -s -X PUT $BASE/benefits/$UBER_ID/usage/2026-07 -H 'content-type: application/json' -d '{"used":null}' > /dev/null
curl -s -H 'X-Debug-Today: 2026-07-28' $BASE/dashboard | node -e '
const j=JSON.parse(require("fs").readFileSync(0));
const assert=(c,m)=>{if(!c){console.error("FAIL:",m);process.exit(1)}};
assert(j.today==="2026-07-28","debug today honored: "+j.today);
const uber=j.expiringSoon.find(i=>i.name==="Uber Cash");
assert(uber && uber.daysRemaining===3, "uber expiring 3d: "+JSON.stringify(j.expiringSoon.map(i=>[i.name,i.daysRemaining])));
console.log("OK: X-Debug-Today + expiringSoon threshold");
'

echo "== 7. history after month rollover (debug today Aug 5): July shows unused + kept comment"
curl -s -H 'X-Debug-Today: 2026-08-05' $BASE/benefits/$UBER_ID/history | node -e '
const j=JSON.parse(require("fs").readFileSync(0));
const assert=(c,m)=>{if(!c){console.error("FAIL:",m);process.exit(1)}};
assert(j.cycles.length===1, "one past cycle (startDate clamp): "+j.cycles.length);
const july=j.cycles[0];
assert(july.window.key==="2026-07" && july.effectiveUsed===false && july.comment==="Uber Eats lunch 7/3", "july history "+JSON.stringify(july));
console.log("OK: history + startDate clamping + comment retention");
'

echo "== 8. fee renewal warning near anniversary (debug today 2027-01-20, 25 days out)"
curl -s -H 'X-Debug-Today: 2027-01-20' $BASE/dashboard | node -e '
const j=JSON.parse(require("fs").readFileSync(0));
const fee=j.expiringSoon.find(i=>i.kind==="annual_fee");
if(!fee||fee.daysRemaining!==25){console.error("FAIL: fee warning",JSON.stringify(j.expiringSoon));process.exit(1)}
console.log("OK: annual-fee renewal warning");
'

echo "== 9. cards list counts"
curl -s $BASE/cards | node -e '
const j=JSON.parse(require("fs").readFileSync(0));
const c=j[0];
if(c.benefitCount!==3||c.unusedCount!==3){console.error("FAIL: counts",JSON.stringify(c));process.exit(1)}
console.log("OK: card list counts (3 benefits, 3 unused after resets)");
'

echo "== 10. close card -> dashboard empties"
curl -s -X POST $BASE/cards/$CARD_ID/close > /dev/null
curl -s $BASE/dashboard | node -e '
const j=JSON.parse(require("fs").readFileSync(0));
if(j.current.length!==0||j.feeRenewals.length!==0){console.error("FAIL: closed card leaked");process.exit(1)}
console.log("OK: soft close");
'
curl -s -X POST $BASE/cards/$CARD_ID/reopen > /dev/null

echo ""
echo "ALL SMOKE TESTS PASSED"
