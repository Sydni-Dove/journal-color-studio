-- Applied 2026-11-17 to the live project (Dove Expressions App 2), with Sydni's approval.
-- Product Studio: Cover Studio drafts and collections, and coloring books, saved online per account
-- (the same owner-only rules as product_studio_projects), plus a private bucket for their pictures.
create table if not exists public.product_studio_items (
  owner_id uuid not null default auth.uid(),
  kind text not null check (kind in ('cover-draft', 'cover-collection', 'coloring-book')),
  id text not null,
  name text not null default '',
  data jsonb not null,
  updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, kind, id)
);
alter table public.product_studio_items enable row level security;
create policy "Product Studio items: read own" on public.product_studio_items for select to authenticated using (owner_id = (select auth.uid()));
create policy "Product Studio items: add own" on public.product_studio_items for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Product Studio items: change own" on public.product_studio_items for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Pictures (reference images, illustrations, covers): private, each account only its own folder (<user id>/<picture id>).
insert into storage.buckets (id, name, public) values ('product-studio-artwork', 'product-studio-artwork', false) on conflict (id) do nothing;
create policy "Product Studio artwork: read own" on storage.objects for select to authenticated using (bucket_id = 'product-studio-artwork' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Product Studio artwork: add own" on storage.objects for insert to authenticated with check (bucket_id = 'product-studio-artwork' and (storage.foldername(name))[1] = (select auth.uid())::text);
