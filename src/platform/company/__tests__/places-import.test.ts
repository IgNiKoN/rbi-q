/// <reference types="node" />
/** P2-0056, этап 2: разбор списка помещений — заголовок не в первой строке, «лесенка», комнатность, площади, «Итого», шаблон. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleOfLabel, findPlaceHeader, setRole, placeName, roomsStr, areaStr, sheetRows, rowStatus, createdText, buildTemplate,
  TEMPLATE_LABELS } from '../places-import.ts';
import { readWorkbook } from '../../services/excel/xlsx-reader.ts';
import type { ImportResult } from '../../core/projects.service.ts';

test('роли по подписям: шаблон и квартирография заказчика', () => {
  assert.deepEqual(TEMPLATE_LABELS.map(roleOfLabel), ['object', 'section', 'floor', 'name', 'build_no', 'bti_no', 'area', 'rooms']);
  const t = ['№ п/п', 'Дом', 'Подъезд', 'Этаж', '№ кв.', 'Условный номер', 'Почтовый номер', 'Площадь общая, м2', 'Площадь жилая', 'Кол-во комнат', 'Цена', 'Этажность'];
  assert.deepEqual(t.map(roleOfLabel), ['ignore', 'object', 'section', 'floor', 'name', 'build_no', 'bti_no', 'area', 'area', 'rooms', 'ignore', 'ignore']);
  assert.equal(roleOfLabel('Тип квартиры'), 'rooms');
  assert.equal(roleOfLabel('Тип помещения'), 'ignore');
});

test('заголовок не в первой строке; из двух площадей — «общая»; роль можно поправить', () => {
  const rows = [['ЖК «Пример», квартирография'], [], ['Секция', 'Этаж', 'Номер квартиры', 'Площадь жилая', 'Площадь общая', 'Комнатность'], [1, 2, 5, 20, 40.5, '1к']];
  const h = findPlaceHeader(rows)!;
  assert.equal(h.row, 2);
  assert.deepEqual(h.roles, ['section', 'floor', 'name', 'ignore', 'area', 'rooms']);
  assert.deepEqual(setRole(h.roles, 3, 'area'), ['section', 'floor', 'name', 'area', 'ignore', 'rooms']);
  assert.deepEqual(setRole(h.roles, 0, 'ignore'), ['ignore', 'floor', 'name', 'ignore', 'area', 'rooms']);
  assert.equal(findPlaceHeader([['Наименование работ', 'Ед. изм.', 'Кол-во']]), null);
});

test('названия как в приложении', () => {
  assert.equal(placeName('object', '1'), 'Корпус 1');
  assert.equal(placeName('object', 'Корпус 2А'), 'Корпус 2А');
  assert.equal(placeName('section', '2'), 'Секция 2');
  assert.equal(placeName('section', 'подъезд №3'), 'Секция 3');
  assert.equal(placeName('floor', '3'), 'эт. 3');
  assert.equal(placeName('floor', '-1'), 'эт. -1');
  assert.equal(placeName('floor', '5 этаж'), 'эт. 5');
  assert.equal(placeName('floor', 'Этаж 12'), 'эт. 12');
  assert.equal(placeName('floor', 'Кровля'), 'Кровля');
  assert.equal(placeName('name', '45'), 'кв. 45');
  assert.equal(placeName('name', 'Кв. 45а'), 'кв. 45а');
  assert.equal(placeName('name', 'оф. 2'), 'оф. 2');
  assert.equal(placeName('name', ''), null);
});

test('комнатность и площадь', () => {
  for (const [a, b] of [['1к', '1'], ['2К', '2'], ['3-комн.', '3'], ['евро-2', '2'], ['2Е', '2'], ['студия', '0'], ['Ст', '0'], ['4', '4'], ['4+', '4+']]) {
    assert.equal(roomsStr(a), b, a);
  }
  assert.equal(areaStr('54,3'), '54,3');
  assert.equal(areaStr('54.3 м²'), '54.3');
  assert.equal(areaStr('много'), 'много');
  assert.equal(areaStr(''), null);
});

test('строки: «лесенка» и объединённые ячейки, новый уровень сбрасывает нижние, пустые и «Итого» пропускаются', () => {
  const sheet = { name: 'Лист1', rows: [
    ['Корпус', 'Секция', 'Этаж', 'Квартира', 'Площадь', 'Комнат'],
    [1, 1, 1, 1, 38.4, '1к'],
    [null, null, null, 2, '61,2', 2],
    [null, null, 2, 3, null, 'студия'],
    [null, null, null, null, null, null],
    [null, 2, null, 4, null, null],
    ['Итого по секции', null, null, null, 138, null],
    [2, null, -1, null, null, null]] };
  const h = findPlaceHeader(sheet.rows)!;
  const r = sheetRows(sheet, h, null);
  assert.deepEqual(r.map((x) => [x.row_no, x.object, x.section, x.floor, x.name, x.build_no, x.area, x.rooms]), [
    [2, 'Корпус 1', 'Секция 1', 'эт. 1', 'кв. 1', '1', '38.4', '1'],
    [3, 'Корпус 1', 'Секция 1', 'эт. 1', 'кв. 2', '2', '61,2', '2'],
    [4, 'Корпус 1', 'Секция 1', 'эт. 2', 'кв. 3', '3', null, '0'],
    [6, 'Корпус 1', 'Секция 2', null, 'кв. 4', '4', null, null],
    [8, 'Корпус 2', null, 'эт. -1', null, null, null, null]]);
});

test('без столбца корпуса — корпус по умолчанию; столбец «Стр. №» важнее номера квартиры', () => {
  const sheet = { name: 'Лист1', rows: [['Этаж', 'Кв.', 'Стр. №', '№ БТИ'], [3, 45, 101, 45.0]] };
  const r = sheetRows(sheet, findPlaceHeader(sheet.rows)!, 'Корпус 7');
  assert.deepEqual(r[0], { row_no: 2, object: 'Корпус 7', section: null, floor: 'эт. 3', name: 'кв. 45', build_no: '101', bti_no: '45', area: null, rooms: null });
});

test('статус строки и итог предпросмотра', () => {
  const res: ImportResult = { ok: false, dryRun: true, repeat: false, created: { objects: 1, sections: 2, floors: 24, apartments: 192 },
    existingRows: [3], differs: [{ row_no: 4, name: 'кв. 4', fields: [{ field: 'area', now: null, file: 40.5 }] }], errors: [{ row_no: 5, msg: 'У помещения не указан этаж' }], roots: [] };
  assert.deepEqual(rowStatus(res, 2), { status: 'new', note: '' });
  assert.deepEqual(rowStatus(res, 3), { status: 'exists', note: 'Уже есть' });
  assert.equal(rowStatus(res, 4).note, 'Уже есть, в файле иначе: площадь сейчас —, в файле 40,5 — не меняется');
  assert.deepEqual(rowStatus(res, 5), { status: 'error', note: 'У помещения не указан этаж' });
  assert.equal(createdText(res.created), '1 корпус, 2 секции, 24 этажа, 192 помещения');
  assert.equal(createdText({ objects: 0, sections: 0, floors: 21, apartments: 0 }), '21 этаж');
  assert.equal(createdText({ objects: 0, sections: 0, floors: 0, apartments: 0 }), 'ничего нового');
});

test('шаблон читается сам собой: заголовок узнан, строки-примеры разобраны', async () => {
  const wb = await readWorkbook(await buildTemplate());
  const sheet = wb.sheets[0];
  const h = findPlaceHeader(sheet.rows)!;
  assert.deepEqual(h.roles, ['object', 'section', 'floor', 'name', 'build_no', 'bti_no', 'area', 'rooms']);
  const r = sheetRows(sheet, h, null);
  assert.deepEqual(r.map((x) => [x.object, x.section, x.floor, x.name, x.build_no, x.area, x.rooms]), [
    ['Корпус 1', 'Секция 1', 'эт. 1', 'кв. 1', '1', '38.4', '1'],
    ['Корпус 1', 'Секция 1', 'эт. 1', 'кв. 2', '2', '61.2', '2'],
    ['Корпус 1', 'Секция 1', 'эт. 2', 'кв. 3', '3', '38.4', '0']]);
});
