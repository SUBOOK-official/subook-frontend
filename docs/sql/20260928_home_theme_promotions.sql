-- Shared public/admin database. Theme contents are saved atomically as one row.
begin;
create table public.content_themes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 20),
  image_url text not null check (image_url ~ '^https://'),
  product_ids bigint[] not null default '{}',
  is_enabled boolean not null default false,
  sort_order integer not null default 100 check (sort_order between 0 and 9999),
  constraint content_themes_product_ids_check check (cardinality(product_ids) >= 1)
);
alter table public.content_themes enable row level security;
grant select on public.content_themes to anon, authenticated;
grant insert, update, delete on public.content_themes to authenticated;
create policy themes_public_read on public.content_themes for select to anon using (is_enabled);
create policy themes_member_read on public.content_themes for select to authenticated using (is_enabled or public.is_admin_user());
create policy themes_admin_write on public.content_themes for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
commit;
notify pgrst, 'reload schema';
