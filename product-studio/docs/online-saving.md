# Online saving (Supabase)

Projects live in two places:

* **This device** (browser localStorage, `persistence/projectStore.ts`) — the
  working copy: instant, works offline.
* **Online** — Supabase project "Dove Expressions App 2"
  (`jnlvvlkwskidloripvtp`), table `public.product_studio_projects`: one row per
  product (`owner_id`, `id`, `name`, `data` = the project JSON, `updated_at`,
  `deleted_at`). Row level security: a signed-in account reads and writes only
  its own rows; signed out sees nothing. No delete policy — removing a project
  sets `deleted_at` (recoverable).

Sign in on the Projects screen with a Dove Expressions account (email +
password, the same Supabase Auth as the Dove Expressions app).

**Sync** (`persistence/cloud.ts`, `app/useCloud.ts`): on sign-in, on start-up,
when the browser comes back online and when the tab comes back into view
(at most every 30 s), each product's newer version wins on both sides
(`planSync`); nothing is deleted by a sync. Every save on this device is also
sent online (`saveOnline`). If the online copy is newer than the version the
edits started from (another device saved since), nothing is overwritten: the
newer version is kept and opened, and these edits are saved as
"(changes from another device)". A failed or offline save stays on this
device and goes online at the next sync. The editor shows "Saved · Saved
online" / "On this device only" / "Offline…".

The publishable key in `cloud.ts` is meant for browsers; the table's row level
security is what protects the data.
