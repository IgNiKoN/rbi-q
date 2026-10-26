-- =========================================================================
-- 010: checklist_results на construction_acceptance_v2
-- =========================================================================
-- Зачем: C+D срез 1 — проход пунктов чек-листа при приёмке работ (этаж/зона).
--   jsonb: { template_key, updated_at, items: [{id, group, name, status, comment?, photos?, updated_at}] }
--   status: ok | fail | na | fail_escalated (P audit-parity)
--   photos[]: local:// | https (upload в bucket construction-defects при push)
-- Применить вручную в Supabase SQL Editor до cloud-smoke.
-- Безопасно на уже существующей таблице (IF NOT EXISTS).
-- =========================================================================

ALTER TABLE construction_acceptance_v2
  ADD COLUMN IF NOT EXISTS checklist_results jsonb;

COMMENT ON COLUMN construction_acceptance_v2.checklist_results IS
  'Результаты чек-листа приёмки: {template_key, updated_at, items[{id,group,name,status,comment?,photos?,updated_at}]}; status=ok|fail|na|fail_escalated';
