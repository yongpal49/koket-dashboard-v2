# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Access protection

- Require the shared administrator password before rendering dashboard data.
- Keep `DASHBOARD_PASSWORD`, `DASHBOARD_SESSION_SECRET`, and Supabase secrets server-side only.
- Protect `/api/dashboard` with the signed administrator session; the login screen alone is not sufficient protection.
- Preserve the existing dashboard UI after login and provide an explicit logout action.

## Current data and local development contract

- The production URL is https://koket-dashboard-v2.vercel.app/.
- For frontend collaboration, use `collaboration.env.example` as the local proxy configuration. Never commit real environment files.
- `server/dashboard-source.js` selects `tables`, `core-rpc`, or the legacy RPC mode. `core-rpc` replaces only the core section with `get_dashboard_core`; all new operational aggregates come from `server/table-dashboard.js`.
- New label mappings live in `shared/dashboard-labels.js`. Preserve unknown raw labels rather than dropping rows.
- Keep administrator/withdrawn-account exclusions and distinguish pending withdrawal from completed withdrawal. Product dormitory must not be inferred from a private seller profile.
- View counts are lifetime totals on current nondeleted items, not selected-period visits or unique visitors.
- A migration file in this repository is not evidence of remote application. Do not change production SQL, data, RLS, or keys merely to sync code.
- Validate a handoff with `npm run build` and `node --test tests/*.test.mjs`; use `node scripts/verify-sql.mjs` only in the isolated PGlite setup described in README.
