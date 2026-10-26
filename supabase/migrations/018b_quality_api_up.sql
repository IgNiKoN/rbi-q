-- P2-0016 этап 2 (ADR-068 п.2). Раздел quality — открыть для API (PostgREST): к открытым public, storage, graphql_public
-- добавляется quality. Настройка роли authenticator (конфигурация PostgREST в базе; перекрывает PGRST_DB_SCHEMAS),
-- затем перечитать конфигурацию. planfact и core в API не открываются. Применять после 018_quality_up.sql.
-- Проверка: GET /rest/v1/rbi_inspections с заголовком Accept-Profile: quality — не 406. Откат — 018b_quality_api_down.sql.
alter role authenticator set pgrst.db_schemas = 'public, storage, graphql_public, quality';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
