# Bear Call

Bear Call is a campus safety check-in prototype. It helps incident coordinators see who has responded to an alert and who still needs a follow-up.

## Run locally

1. From the repository root, run `npm install`.
2. Run `npm run dev:backend` and follow the Convex setup prompts. Leave it running.
3. Create `frontend/.env.local` and set `NEXT_PUBLIC_CONVEX_URL` to the `CONVEX_URL` value from `backend/.env.local`.
4. In a second terminal, run `npm run dev:frontend` and open [localhost:3000](http://localhost:3000).
