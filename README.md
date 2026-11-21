# Roll Call

Every campus alert is a one-way broadcast. Roll Call takes attendance.

Cutie Hack 2026. Scaffold only: the pieces are wired together, the features are TODOs.

## Layout

| Folder | What | Owner |
| --- | --- | --- |
| `frontend/` | Next.js + Tailwind. Dashboard at `/`, responder page at `/r/[token]` | frontend |
| `backend/convex/` | Convex: schema, functions, Retell webhooks | backend |
| `backend/convex/simulator.ts` | Fills in the simulated students | simulation |
| `backend/convex/lib/` | Plain rule functions (status, honesty scan, geo), testable without a phone | backend |

`backend/convex/schema.ts` is the contract all three lanes share. Change it together.

## First run

Install once, from the repo root:

```bash
npm install
```

Start the backend. The first run asks you to log in and create a project, then writes `backend/.env.local`:

```bash
npm run dev:backend
```

Copy the `CONVEX_URL` from `backend/.env.local` into `frontend/.env.local` as `NEXT_PUBLIC_CONVEX_URL` (see `frontend/.env.example`), then in a second terminal:

```bash
npm run dev:frontend
```

Open http://localhost:3000. It should say "Connected. 0 buildings loaded."

## How the two halves talk

The frontend imports the generated API from the backend workspace:

```ts
import { api } from "@rollcall/backend/convex/_generated/api";
const buildings = useQuery(api.buildings.list);
```

`backend/convex/buildings.ts` is the one worked example. `convex dev` regenerates `_generated/` on every save; commit it.

## Rules for today

- Never commit phone numbers or secrets. Retell keys go in Convex: `npx convex env set NAME value` (run inside `backend/`).
- One owner per folder. Pull before you start.
- Plain commits and merges only. No rebase, no amend, no force-push.

## Credits

The call-everyone-in-a-zone pattern is borrowed from Standard Response (Cal Hacks 13.0).
