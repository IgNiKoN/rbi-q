# Полный стенд после влития main (12 потоков, порты 8931–8954), 31.10.2026
- поток 1: PASS 52, FAIL 4 — cold375 w-slow r-middeploy m-hang d-device s-foreign w1440
- поток 2: PASS 22, FAIL 4 — cold1440 w-hang r-partial m-hang375 d-quality-only s-leader
- поток 3: PASS 34, FAIL 0 — rescue w-flap r-tabs m-revoke d-screens q-ids
- поток 4: PASS 22, FAIL 3 — expired w-drop r-chunk m-first s-module-off q-ids-other
- поток 5: PASS 18, FAIL 2 — stale14 w-5xx r-requests m-other s-new-kind pf-offline
- поток 6: PASS 24, FAIL 0 — invalid edit-mid r-delta v-summary375 s-pull-scope pf-offline1440
- поток 7: PASS 25, FAIL 1 — cache double-start r-allow v-summary1440 s-reject-retry pf-drop
- поток 8: PASS 32, FAIL 1 — otheruser double-start-nolocks r-launch v-other s-reject-retry-1440-dark pf-batch
- поток 9: PASS 52, FAIL 6 — screen375 reasons375 r-return v-prefetch375 s-own-first pf-batch1440-dark
- поток 10: PASS 50, FAIL 6 — screen768 reasons1440-dark r-queue v-prefetch1440 s-contractor c-who375
- поток 11: PASS 29, FAIL 6 — screen1440 w-tabs r-transition f-field s-kinds c-who1440
- поток 12: PASS 35, FAIL 0 — w-offline r-deploy r-size f-manager s-rename w375

Упавшее (только при 12 одновременных холодных запусках):
- FAIL cold375: без сети база = база компании
- FAIL cold375: без сети прежние осмотры на месте
- FAIL cold375: без сети права меню — по копии (Качество, Стройконтроль, План/Факт)
- FAIL cold375: сценарий упал — Cannot read properties of undefined (reading 'length')
- FAIL cold1440: без сети база = база компании
- FAIL cold1440: без сети прежние осмотры на месте
- FAIL cold1440: без сети права меню — по копии (Качество, Стройконтроль, План/Факт)
- FAIL cold1440: сценарий упал — Cannot read properties of undefined (reading 'length')
- FAIL screen1440d: плашка при запуске без связи
- FAIL screen1440d: значок «Нет связи, не отправлено: 0» — null
- FAIL screen1440d: записал осмотр — «не отправлено: 1» — null
- FAIL screen1440d: «Компания» — «Нужен интернет»
- FAIL screen1440d: План/Факт — «Нужен интернет»
- FAIL screen1440: сценарий упал — locator.click: Timeout 30000ms exceeded.
- FAIL expired: 120 с без сети — вошёл, база компании, экрана «Вход» нет
- FAIL expired: прежние осмотры видны
- FAIL expired: сценарий упал — page.evaluate: SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for this document.
- FAIL stale14: экран «Вход» с текстом «Нет связи больше 14 дней…»
- FAIL stale14: сценарий упал — page.evaluate: SecurityError: Failed to execute 'open' on 'IDBFactory': access to the Indexed Database API is denied in this context.
- FAIL cache: с сетью код План/Факта и «Компании» в кэше
- FAIL otheruser: сценарий упал — page.evaluate: TypeError: Cannot read properties of undefined (reading 'signOut')
- FAIL screen375: плашка при запуске без связи
- FAIL screen375: значок «Нет связи, не отправлено: 0» — null
- FAIL screen375: записал осмотр — «не отправлено: 1» — null
- FAIL screen375: «Компания» — «Нужен интернет»
- FAIL screen375: План/Факт — «Нужен интернет»
- FAIL screen375: сценарий упал — locator.click: Timeout 30000ms exceeded.
- FAIL screen768: плашка при запуске без связи
- FAIL screen768: значок «Нет связи, не отправлено: 0» — null
- FAIL screen768: записал осмотр — «не отправлено: 1» — null
- FAIL screen768: «Компания» — «Нужен интернет»
- FAIL screen768: План/Факт — «Нужен интернет»
- FAIL screen768: сценарий упал — locator.click: Timeout 30000ms exceeded.

Повтор упавших отдельно (по 2 на поток): cold375+screen375 PASS 21 FAIL 0; cold1440+screen768 PASS 21 FAIL 0; screen1440+expired PASS 16 FAIL 0; stale14+otheruser PASS 8 FAIL 0; cache (один) PASS 3 FAIL 0.
