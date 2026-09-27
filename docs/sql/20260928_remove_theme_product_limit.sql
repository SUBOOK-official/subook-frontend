-- Apply to databases where content_themes already exists.
begin;
alter table public.content_themes
  drop constraint if exists content_themes_product_ids_check;
alter table public.content_themes
  add constraint content_themes_product_ids_check check (cardinality(product_ids) >= 1);
commit;
notify pgrst, 'reload schema';
