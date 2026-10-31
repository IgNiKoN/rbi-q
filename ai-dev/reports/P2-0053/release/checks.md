# P2-0053 — проверки выкладки (31.10.2026)

- T0 снимка: 2026-10-31 06:49 МСК; снимок «до» — release/snapshot-before.json (94 таблицы, учёток не zd- до T0: 131)
- 057_demo_mode_up.sql md5: 9898ac969798e70ca4d8d60a62cda18d
- 057 на боевом: Success; сторожей 100, функции демо 5, сводка пропатчена; SQL-тест 057: FAIL всего 0 (после двух правок теста: отпечаток по версии строки — укладывается в ожидание SQL Editor; старые функции Качества «кто я» в списке пустых вызовов)
- засев: Готово: {"today":"2026-10-31","core":{"places":244,"counterparties":4,"workTypes":20,"plans":3,"demoRoles":8,"people":10},"planfact":{"vorRows":325,"expectedDone":74972603,"doneByObject":{"k1":0,"k2":28862511,"k3":46110092,"park":0},"positions":281,"kpTotal":167304112,"factEntries":241,"pending":0,"corrected":1,"ks2":3,"ks2Issued":2},"quality":{"inspections":10,"inspectionFails":9,"photos":39,"defects":30,"defectsOnPlans":24,"acceptances":3,"contractorSees":18,"contractorOwn":18}}
- снимок «после засева» (T0 тот же): 94 прежние таблицы — равны «до»; новые core.demo_roles, core.demo_visits — 0 строк не демо-компаний
