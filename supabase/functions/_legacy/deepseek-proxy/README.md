# deepseek-proxy — ИИ старого РБИ (архив, P2-0034)

Живёт на сервере: `/opt/beget/supabase/volumes/functions/deepseek-proxy/index.ts` (служба функций Supabase; выкладка и откат — `docs/EDGE_FUNCTIONS.md`).

- `index.orig-20261025.ts` — исходный файл с сервера до P2-0034 (текст тот же; на сервере переводы строк CRLF). Копия на сервере: `/opt/beget/supabase/backup-functions/deepseek-proxy.index.ts.bak-20261025`.
- `index.ts` — выложено 25.10.2026 (решение владельца): режим `mode: "role"` (по имени инженера и коду объекта) отвечает 403 «Режим отключён, войдите в Платформу 2.0»; Bearer = корпоративный пароль и `mode: "corporate"` — без изменений.

Откат: вернуть на сервер `index.orig-20261025.ts` под именем `index.ts` (или копию из `backup-functions`).
