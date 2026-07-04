---
name: verify
description: Build, run, and drive this app to verify a change end-to-end (dev server + seeded local D1 + headless Chrome).
---

# Verifying card_benefits changes

Surface: web GUI (React PWA) over the worker API. Local D1 is disposable.

## Launch

```bash
npx vite dev --port 8788 &   # picks the next port if 8788 is busy — read the log!
npm run db:migrate:local      # if /api/dashboard 500s with "no such table"
curl -s http://localhost:<port>/api/dashboard   # readiness + sanity
```

No auth in local dev. Dev-only `X-Debug-Today: YYYY-MM-DD` header overrides
"today" for API calls (not the browser).

## Seed

`POST /api/cards/import` with `{card, benefits[]}` — see `scripts/smoke.sh`
for a working payload. Today=2026-07-03 style windows: monthly ends month-end,
quarterly `2026-Q3` ends 09-30, `anchor:"anniversary"` keys as `A<date>`.

## Drive

No Playwright in the repo. `npm i playwright-core` in a scratch dir and drive
system Chrome (`/Applications/Google Chrome.app/.../Google Chrome`) headless.

Gotchas:
- `text=Expiring` matches the "Expiring soon" H2, not the segment button —
  use `getByRole("button", {name, exact: true})`.
- BenefitRow: the used-toggle is `input[type=checkbox]`; the only `button`
  in a row is the ⋮ ellipsis, which opens CommentSheet (its `.sheet-backdrop`
  then blocks all clicks).
- Dashboard "This cycle" is the 2nd `section.section`; rows are
  `.card-list > *`, group headings `.card-group-title`.

## Clean up

Tables are `cards`, `benefits`, `benefit_usage` (NOT usage_rows; a wrong name
aborts the whole `--command` batch silently):

```bash
npx wrangler d1 execute DB --local --command \
  "DELETE FROM benefit_usage; DELETE FROM benefits; DELETE FROM cards"
```

Kill the server: `kill $(lsof -ti:<port>)`.
