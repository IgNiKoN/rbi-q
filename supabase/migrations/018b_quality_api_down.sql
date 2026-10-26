-- P2-0016: откат 018b_quality_api_up.sql — API снова открывает только PGRST_DB_SCHEMAS сервера (public, storage, graphql_public).
-- Применять до 018_quality_down.sql.
alter role authenticator reset pgrst.db_schemas;
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
