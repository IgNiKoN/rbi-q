# P2-0034 этап 1 — путь выкладки, функция pf-ai, одна кнопка насквозь

**Дата:** 25.10.2026. Доступ — панель Beget владельца в его Chrome («посмотри сам», затем кнопка «Да, выкладывай»).

## Найдено (только чтение)
- VPS Beget «rbi-q supabase»; Supabase — `/opt/beget/supabase` (`docker-compose*.yml`, `.env` — не открывались). Функции — `/opt/beget/supabase/volumes/functions/`: `main` (стандартный маршрутизатор: папка `<имя>` на каждый запрос; `VERIFY_JWT` по факту выключен — запросы без ключа доходят до функций), `deepseek-proxy`, `hello`, `.env` (не открывался).
- `deepseek-proxy/index.ts` (107 строк, 4371 байт, CRLF) прочитан в просмотрщике → копия `supabase/functions/_legacy/deepseek-proxy/index.ts` (тот же текст, LF). Режимы: Bearer = корпоративный пароль; `mode: corporate` (пароль); `mode: role` (имя + код объекта в `public.rbi_engineer_profiles`). Корпоративный пароль по умолчанию `'12345'`, если `AI_CORP_PASSWORD` не задан → ТД.
- Попутно: баланс Beget ~3 дня, диск 69,7 / 80 ГБ — сообщено владельцу.

## Сделано
- `supabase/functions/pf-ai/` — `handler.ts` (логика, тестируется в Node) + `index.ts` (запуск, `std@0.168.0 serve`, как у работающей функции). Токен → `/auth/v1/user` → 401; `x-company-id` → `quality.request_company` от имени пользователя (этап 1 — членство; этап 2 — право `quality.ai`); модель `deepseek-chat`, `max_tokens` ≤ 2000; имя/код объекта/пароль не используются.
- `callAI`: не «свой ключ» → `window.supabaseClient.functions.invoke('pf-ai')` (токен и `x-company-id` подставляет клиент Качества); `APP_CONFIG.SUPABASE_URL` больше не нужен.
- `docs/EDGE_FUNCTIONS.md` — выкладка/откат.
- Выкладка (разрешение владельца): файловый менеджер → новая папка `functions/pf-ai` (права 700) → загружены `index.ts`, `handler.ts`. Без перезапуска.

## Проверки
| Проверка | Результат |
|---|---|
| `node --test supabase/functions/__tests__/pf-ai.test.ts` | 9/9 |
| `npm run test:unit` / `tsc` | 642/642, 0 |
| До выкладки: `deepseek-proxy` `{"mode":"bogus"}` | 400 «Неизвестный режим доступа» |
| До выкладки: `pf-ai` | 500 (функции нет) |
| После: `pf-ai` без токена | 401 «Войдите в Платформу 2.0» |
| После: `pf-ai` `Bearer 12345` | 401 «Сеанс входа истёк» (DeepSeek не вызывается; окружение есть — нет 500 «не настроен») |
| После: OPTIONS `pf-ai` | 200 |
| После: `deepseek-proxy` `{"mode":"bogus"}` | 400 — как до |
| Владелец, `localhost:8839`, вход по почте, «Умный комментарий» | «Умный комментарий ответил» |
