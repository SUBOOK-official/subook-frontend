-- Run once in the project's Supabase SQL editor before enabling banner-copy refresh.
create table if not exists public.banner_copy_cache (
  product_id bigint primary key references public.products(id) on delete cascade,
  source_hash text,
  copy text check (char_length(copy) between 1 and 20),
  generated_at timestamptz,
  lease_token uuid,
  locked_until timestamptz,
  next_attempt_at timestamptz
);
alter table public.banner_copy_cache enable row level security;
revoke all on public.banner_copy_cache from anon, authenticated;
grant all on public.banner_copy_cache to service_role;

-- Atomic lease: separate server instances cannot generate the same product concurrently.
create or replace function public.claim_banner_copy(p_product_id bigint, p_source_hash text, p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed bigint;
begin
  insert into public.banner_copy_cache(product_id, lease_token, locked_until, next_attempt_at)
  values (p_product_id, p_token, now() + interval '5 minutes', now() + interval '1 hour')
  on conflict (product_id) do update
    set lease_token = excluded.lease_token, locked_until = excluded.locked_until,
        next_attempt_at = excluded.next_attempt_at
    where (banner_copy_cache.source_hash is distinct from p_source_hash or banner_copy_cache.copy is null)
      and coalesce(banner_copy_cache.locked_until, '-infinity'::timestamptz) < now()
      and coalesce(banner_copy_cache.next_attempt_at, '-infinity'::timestamptz) < now()
  returning product_id into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.claim_banner_copy(bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.claim_banner_copy(bigint,text,uuid) to service_role;
