-- Apply to the public/admin shared Supabase project before enabling recommendations.
begin;
create table if not exists public.product_recommendations (
  product_id bigint primary key references public.products(id) on delete cascade,
  sort_order integer not null default 100 check (sort_order >= 0),
  headline text not null default '' check (length(headline) <= 80),
  is_enabled boolean not null default false
);
alter table public.product_recommendations enable row level security;
grant select on public.product_recommendations to anon, authenticated;
grant insert, update, delete on public.product_recommendations to authenticated;
create policy recommendations_public_read on public.product_recommendations for select to anon using (is_enabled);
create policy recommendations_member_read on public.product_recommendations for select to authenticated using (is_enabled or public.is_admin_user());
create policy recommendations_admin_write on public.product_recommendations for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
commit;
notify pgrst, 'reload schema';
