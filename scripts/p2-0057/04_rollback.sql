-- P2-0057 этап 4: откат переноса 02_transfer.sql — документы, созданные переносом, помечаются удалёнными (ничего не стирается);
-- ссылки в Качестве / СК перенос не менял — их откат не касается. Версии, загруженные после переноса, не трогаются.
begin;
update core.place_documents d set deleted_at = now(), is_current = false, updated_at = now()
  from p2_backup.p2_0057_transfer t
 where t.doc_id = d.id and t.rolled_back_at is null and d.deleted_at is null;
update p2_backup.p2_0057_transfer set rolled_back_at = now() where rolled_back_at is null;
commit;
