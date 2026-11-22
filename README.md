# Bear Call

**Every campus alert is a one-way broadcast. Bear Call takes attendance.**

![The 3D model of the UC Riverside campus that Bear Call runs on](frontend/public/campus.webp)

When something goes wrong on campus, a mass alert tells students what happened. It does not tell anyone which students are fine, which are hurt, and which never picked up.

Bear Call does. A dispatcher picks the affected residence halls on a 3D map of UC Riverside, and Bear Call phones every signed-up student in them, asks how they are, and puts each answer on the map. Anyone who needs help, or who does not answer, gets the nearest responder sent to their room.

Built at CutieHacks 2026.

## How a roll call works

1. **The dispatcher picks the zone.** They click halls on the 3D campus, choose the incident type (earthquake, outage, evacuation or air quality), and start the roll call.
2. **Bear Call phones each student.** An AI voice agent calls every signed-up student in those halls and asks up to three short questions about whether they are safe, where they are, and whether they need help.
3. **Code decides the status, not the model.** The agent only records the answers. A fixed rule turns them into safe, needs help or urgent, and anything short of a clear "I'm safe" sends someone.
4. **Silence counts.** A missed call, a voicemail or a student with no phone on file is marked no answer, and a responder is proposed to go to their registered room.
5. **The nearest free responder is proposed.** The dispatcher approves, and the responder gets a two-minute offer on their phone.
6. **The responder is guided to the door.** After accepting they see a walking route, the floor plan with the student's room marked, and their own position from GPS.
7. **Only then is the student told help is coming.** Bear Call calls them back with one fixed sentence: who is coming and roughly how long.
8. **The responder taps Done.** The student counts as accounted for, and the responder is offered to whoever has waited longest.

## The three screens

| Who | Where | What they do |
|---|---|---|
| Dispatcher | `/` on a laptop | Picks the zone, watches the map fill in, approves responders, reads the live call transcript |
| Student | `/join` on a phone | Signs up once with a name, phone number, hall and room. After that they only answer the call |
| Responder | `/r/<token>` on a phone | Accepts an offer, follows the route to the room, taps Done |

`/sim` runs the whole thing offline with made-up students, with no backend and no phone calls.

## What makes it different

- **It never promises help it has not confirmed.** The check-in agent is not allowed to say help is coming. The only sentence that says so is a template, spoken after a responder has accepted. The dashboard counts any call where the agent broke this rule.
- **Not answering is treated as a result.** A normal alert records "not delivered". Bear Call puts a named responder on a named room.
- **Students who asked for help come first.** They are queued ahead of no-answers and can take a responder who was only proposed for one.
- **Responders are sent to where the student is.** If a student says on the call that they are in the library, the responder goes to the library, with the dorm room shown as a fallback. A place that cannot be matched to a campus building is flagged instead of guessed.
- **Guidance goes indoors.** The route ends at a room on a floor plan, not at a street address.

## What is real and what is simulated

| | Real | Simulated |
|---|---|---|
| Students | Anyone who signed up at `/join`. They get an actual phone call | Made-up names with no phone numbers, tagged "Simulated". At most five per hall join a roll call |
| Check-in result | The student's own answers on the call | A made-up result 4 to 40 seconds in: mostly safe, a few needing help, a few not answering |
| Responder | A person who opens the offer link, walks there, and taps Done | Accepts by itself when approved and walks the route on the map at six times walking speed |
| Position on the map | Estimated from the ETA. No phone reports its location to the dashboard | The same estimate |

The campus is real: buildings, roads and footpaths come from OpenStreetMap, and the floor plans are the ones UCR publishes for its classrooms and residence halls.

## Tech stack

| Part | Built with |
|---|---|
| Web app | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend | Convex: database, live queries, scheduled functions and HTTP webhooks |
| Phone calls | Retell AI voice agents |
| 3D campus | three.js with React Three Fiber and drei |
| Responder route map | Leaflet, with walking routes from the OpenStreetMap foot router |
| Hosting | Vercel for the site, deployed by GitHub Actions on every push to `main` |

## Repository layout

```
backend/
  convex/
    schema.ts        Tables: buildings, students, responders, incidents, checks, assignments
    incidents.ts     Start and end a roll call
    calls.ts         The only file that talks to Retell
    http.ts          Retell's webhooks
    checks.ts        Check-in results, counters, the live feed
    assignments.ts   Proposing, offering, accepting and finishing a response
    simulator.ts     Results for simulated students
    lib/             Plain functions with no Convex imports: status rule, honesty scan, distance, place matching
  tests/             Tests for the functions in lib/
frontend/
  app/               The dashboard (/), sign-up (/join), responder page (/r/[token]) and offline demo (/sim)
  components/        Dashboard panels, the responder route map, and simulation/ for the 3D campus
  public/ucr/        Campus map data and floor plans
```

## Run locally

You need Node 22.18 or newer (the tests run TypeScript directly) and a free [Convex](https://www.convex.dev) account.

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Start the Convex backend and follow the prompts. Leave it running.

   ```bash
   npm run dev:backend
   ```

3. Copy `frontend/.env.example` to `frontend/.env.local` and set `NEXT_PUBLIC_CONVEX_URL` to the `CONVEX_URL` value that step 2 wrote to `backend/.env.local`.

4. Load the demo data: three halls, simulated students and five responders. Nobody in it has a phone number.

   ```bash
   npm run seed -w @rollcall/backend
   ```

5. In a second terminal, start the site:

   ```bash
   npm run dev:frontend
   ```

6. Open [http://localhost:3000](http://localhost:3000), click a hall, and start a roll call.

Without the phone setup below, simulated students still resolve and the whole dispatch flow works. Real sign-ups are simply marked no answer.

### Phone calls (optional)

Calls go through [Retell AI](https://www.retellai.com). You need two agents: one for the check-in and one that reads the confirmation line.

Set these on the Convex deployment, from the `backend` folder, with `npx convex env set NAME value`:

| Variable | What it is |
|---|---|
| `RETELL_API_KEY` | Your Retell API key |
| `RETELL_FROM_NUMBER` | The number calls come from |
| `RETELL_CHECKIN_AGENT_ID` | The check-in agent. It gets `student_name` as a dynamic variable |
| `RETELL_CONFIRM_AGENT_ID` | The confirmation agent. It reads out `confirmation_line` and nothing else |
| `ROLLCALL_WEBHOOK_SECRET` | Any long random string |

Then point Retell at the deployment's HTTP address, `https://<deployment-name>.convex.site`:

- **`POST /retell/tool`** is a custom function named `save_answers` on the check-in agent. Send the header `x-rollcall-secret` with the secret above. Its arguments are `safe`, `location`, `injured`, `life_threat`, `needs_help_moving` and `others_nearby`. The reply contains `closing_line`, which the agent must read back word for word.
- **`POST /retell/events`** is the agent's webhook, for `call_ended` and `transcript_updated`.

Starting a roll call with this set up places real phone calls to every signed-up student in the halls you pick.

## Tests

```bash
npm test -w @rollcall/backend
```

The tests cover the rules that must not drift: how answers become a status, that no closing line promises help, the banned-phrase scan, distance and ETA, and matching a spoken location to a campus building.

## Deploying

- **Site:** pushing to `main` runs `.github/workflows/deploy.yml`, which deploys `frontend/` to Vercel.
- **Backend:** run `npx convex deploy` from `backend/`. The site reads the production Convex deployment, so a backend change is not live until this has run.

## Known limits

This is a hackathon build, not a system to rely on in an emergency.

- **No login.** Anyone with the dashboard URL can start a roll call, and that places real calls.
- **Opt-in only.** It reaches students who signed up, by one voice call, with no retry and no text or email.
- **Responders are not notified.** The offer link appears in the dispatcher's help queue and has to be passed on.
- **No live tracking.** Students are placed at their room or where they said they are, and responder movement on the dashboard is an estimate.
- **One incident at a time,** with no report afterwards.

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Floor plans are UCR's published classroom and residence hall maps, from [classrooms.ucr.edu](https://classrooms.ucr.edu/) and [housing.ucr.edu](https://housing.ucr.edu/).
