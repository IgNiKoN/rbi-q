-- P2-0036 этап 2. Снимки отчётов (≈ 1,2 ГБ HTML) — порциями: запрос SQL Editor дольше ~2 мин обрывается и откатывается,
-- а преобразование самого большого снимка (37,7 МБ) — 11 с. Порция — снимки подряд по id, ≈ 150 МБ.
-- Отбор и преобразование — те же функции, что у переноса (quality.rbi_transfer_filter / rbi_transfer_row), повтор безопасен
-- (on conflict do nothing). Запуск: v_part = 0, 1, 2 … пока в ответе не будет «порций всего N» и v_part = N − 1 (больше — ничего не делает).
-- Затем — список файлов: select * from quality.rbi_transfer_run_part((select id from core.companies where name = 'RBI'), '{}', true);
do $$
declare
  v_part int := 0;                          -- номер порции
  v_mb int := 150;                          -- размер порции, МБ
  c uuid := (select id from core.companies where name = 'RBI');
  v_projects jsonb;
  v_n bigint; v_total int; v_mb_part numeric;
begin
  if c is null then raise exception 'Нет компании RBI' using errcode = 'P0001'; end if;
  select jsonb_object_agg(old_code, core_project_id::text) into v_projects from quality.rbi_transfer_projects where core_company_id = c;
  execute format($q$create temp table _part on commit drop as
    select p.id, (sum(length(p.html_content)) over (order by p.id collate "C") - length(p.html_content)) / (%s * 1048576) part, length(p.html_content) len
      from public.shared_report_snapshots p where %s$q$, v_mb, quality.rbi_transfer_filter(c, 'shared_report_snapshots', null));
  select count(distinct part), round(coalesce(sum(len) filter (where part = v_part), 0) / 1048576.0, 1) into v_total, v_mb_part from _part;
  -- lateral: преобразование — один раз на строку ((f()).* вызывало бы его по разу на каждый из ~20 столбцов)
  insert into quality.shared_report_snapshots
  select r.* from public.shared_report_snapshots p,
         lateral jsonb_populate_record(null::quality.shared_report_snapshots,
                   quality.rbi_transfer_row(c, 'shared_report_snapshots', to_jsonb(p), v_projects, '{}', '{}')) r
   where p.id in (select id from _part where part = v_part)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  insert into quality.rbi_transfer_runs (core_company_id, action, scope, result)
  values (c, 'run', 'snapshots part ' || v_part, jsonb_build_object('shared_report_snapshots', v_n, 'mb', v_mb_part, 'parts', v_total));
  raise notice 'порция % из % (номера 0…%): % МБ, перенесено снимков %, % с', v_part, v_total, v_total - 1, v_mb_part, v_n,
    round(extract(epoch from clock_timestamp() - statement_timestamp())::numeric, 1);
end $$;
select at::text, scope, result from quality.rbi_transfer_runs order by id desc limit 1;
