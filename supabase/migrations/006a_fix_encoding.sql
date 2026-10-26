-- P2-0005 этап 1, исправление: при первом применении 006 кириллица в тексте миграции попала на сервер искажённой
-- (буфер обмена macOS без UTF-8). Этот файл убирает искажённые общие единицы и чинит описания двух действий каталога.
-- Выполнять ПЕРЕД повторным применением 006_up.sql (он пересоздаёт функции с правильными текстами и добавляет 9 общих единиц).
delete from planfact.units
 where company_id is null
   and code not in ('м²', 'м³', 'м.п.', 'шт.', 'компл.', 'т', 'кг', 'л', 'чел.-ч.');
update planfact.permission_catalog set description = 'Проекты и дерево локаций: создание, правка, архив' where action = 'planfact.projects.manage';
update planfact.permission_catalog set description = 'Справочник единиц измерения компании: добавление и удаление своих' where action = 'planfact.units.manage';
