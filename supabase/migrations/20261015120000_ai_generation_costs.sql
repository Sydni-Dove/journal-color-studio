-- Phase 8.1 — real AI usage and cost per generation, for judging pricing later.
-- Written only by the generate-document Edge Function with the service role. Row level security is on with no
-- policies, so signed-in users can neither read nor change it (the owner reads it in the dashboard / SQL editor).
-- Separate from edge_usage_logs (the daily allowance, shared with other functions), which is unchanged.
-- NOT APPLIED: apply only with Sydni's approval, together with generate-document v9.
create table if not exists public.ai_generation_costs (
  id uuid primary key default gen_random_uuid(),
  -- Kept (as null) if the account is deleted, so cost history stays complete without personal data.
  user_id uuid references auth.users (id) on delete set null,
  function_name text not null,
  mode text not null check (mode in ('structure', 'develop')),
  model text not null,
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0,
  outcome text not null,
  created_at timestamptz not null default now()
);
alter table public.ai_generation_costs enable row level security;
create index if not exists ai_generation_costs_created_at_idx on public.ai_generation_costs (created_at);
create index if not exists ai_generation_costs_user_created_idx on public.ai_generation_costs (user_id, created_at);
