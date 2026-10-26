/**
 * Контрагенты ядра платформы (P2-0015, ADR-066): виды, реквизиты, проверка ввода и строка реквизитов для документов (КС-2).
 * Единственное место подписей видов и формата реквизитов на клиенте; правила хранения и права — на сервере (017).
 */

export type CounterpartyKind = 'customer' | 'general_contractor' | 'contractor' | 'supplier';

export const COUNTERPARTY_KINDS: { id: CounterpartyKind; label: string }[] = [
  { id: 'customer', label: 'Заказчик' },
  { id: 'general_contractor', label: 'Генподрядчик' },
  { id: 'contractor', label: 'Подрядчик' },
  { id: 'supplier', label: 'Поставщик' }
];

/** Реквизиты (jsonb на сервере): все поля необязательны. */
export interface Requisites {
  address?: string; phone?: string; bank?: string; bik?: string; account?: string; corr_account?: string; signer?: string;
}

export const REQUISITE_FIELDS: { key: keyof Requisites; label: string; placeholder: string }[] = [
  { key: 'address', label: 'Адрес', placeholder: 'г. Москва, ул. Строителей, д. 1' },
  { key: 'phone', label: 'Телефон', placeholder: '+7 495 000-00-00' },
  { key: 'bank', label: 'Банк', placeholder: 'ПАО Банк' },
  { key: 'bik', label: 'БИК', placeholder: '044525000' },
  { key: 'account', label: 'Расчётный счёт', placeholder: '40702810…' },
  { key: 'corr_account', label: 'Корр. счёт', placeholder: '30101810…' },
  { key: 'signer', label: 'Подписант (должность, ФИО)', placeholder: 'Генеральный директор Иванов И. И.' }
];

export interface Counterparty {
  id: string; name: string; inn: string | null; kpp: string | null; kinds: CounterpartyKind[];
  requisites: Requisites; archived_at: string | null; updated_at: string;
  /** P2-0016: подрядчик, добавленный в Качестве без ИНН, — черновик до дозаполнения ИНН. */
  draft?: boolean;
}

/** Карточка контрагента объекта для документов (pf_project_counterparties). */
export interface CounterpartyCard {
  id: string; name: string; inn: string; kpp: string | null; kinds: CounterpartyKind[]; requisites: Requisites; archived: boolean;
}
export interface ProjectCounterparties { customer: CounterpartyCard | null; general_contractor: CounterpartyCard | null }

export interface CounterpartyDraft { name: string; inn: string; kpp: string; kinds: CounterpartyKind[]; requisites: Requisites }

export const kindLabels = (kinds: CounterpartyKind[]): string =>
  COUNTERPARTY_KINDS.filter((k) => kinds.includes(k.id)).map((k) => k.label).join(', ');

const digits = (s: string): string => s.replace(/\s/g, '');

/** Проверка до отправки (та же, что на сервере); пусто — можно сохранять. */
export function counterpartyProblem(d: CounterpartyDraft): string {
  if (!d.name.trim()) return 'Введите название контрагента';
  if (!/^(\d{10}|\d{12})$/.test(digits(d.inn))) return 'ИНН — 10 цифр (организация) или 12 цифр (ИП)';
  const kpp = digits(d.kpp).toUpperCase();
  if (kpp && !/^\d{4}[0-9A-Z]{2}\d{3}$/.test(kpp)) return 'КПП — 9 знаков';
  if (!d.kinds.length) return 'Отметьте, кто это: заказчик, генподрядчик, подрядчик или поставщик';
  return '';
}

/** Реквизиты без пустых полей и пробелов по краям (то, что уходит на сервер). */
export function cleanRequisites(r: Requisites): Requisites {
  const out: Requisites = {};
  for (const f of REQUISITE_FIELDS) { const v = String(r[f.key] ?? '').trim(); if (v) out[f.key] = v; }
  return out;
}

/** Строка организации для документов: «ООО Ромашка, ИНН 7701234567, КПП 770101001, адрес, тел., р/с … в банке, БИК …». */
export function requisitesLine(c: Pick<Counterparty, 'name' | 'inn' | 'kpp' | 'requisites'>): string {
  const r = c.requisites || {};
  const bank = [r.account ? `р/с ${r.account}` : '', r.bank ? (r.account ? `в ${r.bank}` : r.bank) : '',
    r.corr_account ? `к/с ${r.corr_account}` : '', r.bik ? `БИК ${r.bik}` : ''].filter(Boolean).join(' ');
  return [c.name, c.inn ? `ИНН ${c.inn}` : '', c.kpp ? `КПП ${c.kpp}` : '', r.address || '', r.phone ? `тел. ${r.phone}` : '', bank]
    .filter(Boolean).join(', ');
}
