# P2-0043 этап 1 — опись Storage РБИ (сервер, 26.10.2026)

Источник: `scripts/p2-0043/01_inventory.sql` (только чтение, SQL Editor).

## Бакеты
| Старый бакет | public | файлов | МБ | не скопировано в `quality-*` |
|---|---|---|---|---|
| `construction-defects` | true | 36 | 11.0 | 0 |
| `construction-plans` | true | 25 | 26.2 | 0 |
| `custom-assets` | true | 146 | 98.8 | 0 |
| `inspection-photos` | true | 4260 | 1200.5 | 0 |
| `library-checklists` | true | 0 | 0 | 0 |
| `library-docs` | true | 24 | 65.5 | 0 |
| `library-etalons` | true | 336 | 113.5 | 0 |
| `library-nodes` | true | 2 | 0.2 | 0 |
| `library-practices` | true | 30 | 3.1 | 0 |
| `library-twi` | true | 378 | 57.2 | 0 |
| `reports` | true | 382 | 1804.3 | 0 |
| `twi-pdfs` | true | 0 | 0 | 0 |

Бакеты `quality-*` (11 шт.) — `public = false`, число файлов совпадает (`quality-reports` 383 = 382 + 1 новый).

## Правила `storage.objects`
- Старые (30): `Allow all for anon on …` (9), `Public … Access Plans` (4, роль `public`), `construction-defects_*_anon` (4, `anon, authenticated`), `temp reports storage …` (7), `storage_*_transition` (5, роль `public`; `storage_insert_transition` и `storage_update_transition` читают `public.rbi_engineer_profiles`), `rbi_admin_storage_access` (`public.rbi_current_role()`).
- Качества (8): `quality_files_*`, `quality_files_guard_*` (018d) — не трогать. Правил на `storage.buckets` нет.

## Потребители
- Данные `quality`: строк со ссылками `/object/(public|authenticated|sign)/<старый бакет>/` — **0** (все таблицы схемы).
- Клиент: имена бакетов логические, мост дописывает `quality-` (`companyBucket`, `quality-bridge.ts:169`); `getStoragePathFromPublicUrl` только разбирает оба вида ссылок; SW подменяет ссылки `quality-*`.
- Правила других схем, читающие `public`: только `storage_insert_transition`, `storage_update_transition` → `rbi_engineer_profiles` (ТД №242).

**Вывод:** все файлы скопированы, потребителей нет — стоп-условие этапа 1 не сработало.
