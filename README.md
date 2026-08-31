# ShipNova — Cloudflare Worker + D1

## Structure
- `src/index.js` — Hono Worker API
- `frontend/` — static frontend served by the same Worker
- `migrations/0001_initial.sql` — D1 migration
- `schema.sql` — complete schema + demo admin
- `wrangler.toml` — Worker + static assets + D1 binding

## Cloudflare deployment
1. Create a D1 database named **shipnova**.
2. Copy its **Database ID**.
3. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `wrangler.toml` with that ID.
4. Push the repository to GitHub.
5. Cloudflare root directory: **repository root** (leave blank/default).
6. Build command: `bun install`
7. Deploy command: `npx wrangler deploy`

Do NOT set root directory to `backend`. This version intentionally has `src/index.js` at the repository root.

## Initialize D1
Run from the repository root:
`npx wrangler d1 execute shipnova --remote --file=./schema.sql`

Or:
`npx wrangler d1 migrations apply shipnova --remote`

## Demo admin
Email: `admin@shipnova.local`
Password: `admin123`

Frontend uses the deployed Worker origin for API calls by default, so there is no localhost API URL after deployment.

> Demo note: passwords are stored as plain text in this sample. Use proper password hashing/authentication before production use.
