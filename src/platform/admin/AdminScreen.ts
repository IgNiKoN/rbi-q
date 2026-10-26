/**
 * Экран «Настройки → Администрирование платформы» (P2-0013). Без React: файл маленький и скачивается только администратору платформы.
 * Компании (название, тестовая, людей, модули), «Создать компанию», выключатель модуля Platform 2.0, «Назначить администратора компании»
 * по почте существующей учётки. Старые модули (Качество, Стройконтроль…) — в списке с пометкой, без выключателя (решение владельца 22.10.2026).
 * Права проверяет сервер; экран только показывает ответ.
 */
import type { AdminApi, AdminCompany } from './admin.service.ts';
import { SETTINGS_UI_CSS } from '../ui/settings.ts';
import { PLATFORM_AUTH_CSS } from '../auth/LoginForm.ts';

/** P2-0038: экран в общем стиле «Настроек» (классы sui-* — src/platform/ui/settings.ts, кнопки — pf-btn); своих классов нет. */
export const ADMIN_CSS = SETTINGS_UI_CSS + PLATFORM_AUTH_CSS + `
.sui-stack .pf-btn{min-height:44px}
`;

/** P2-0031: пояснения к выключателям модулей, которые живут внутри «Качества» (038: без включённого Качества их нет). */
const MODULE_HINTS: Record<string, string> = {
  knowledge: 'Работает вместе с «Качеством»: документы и чек-листы компании, видят все с доступом к Качеству.',
  ai: 'Работает вместе с «Качеством». Кому именно — галочка «ИИ-помощник» в роли (Компания → Роли).'
};

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function msg(doc: Document): HTMLDivElement & { show: (kind: 'ok' | 'error', text: string) => void } {
  const m = el(doc, 'div', { class: 'sui-msg', role: 'status', hidden: '' }) as HTMLDivElement & { show: (kind: 'ok' | 'error', text: string) => void };
  m.show = (kind, text) => { m.dataset.kind = kind; m.textContent = text; m.hidden = false; };
  return m;
}

export interface AdminScreenOpts {
  api: AdminApi;
  /** После изменения модулей — перечитать «кто я» (меню самого администратора). */
  onChanged?: () => void;
}

/** Нарисовать экран в контейнер; возвращает очистку. */
export function renderAdminScreen(host: HTMLElement, opts: AdminScreenOpts): () => void {
  const doc = host.ownerDocument;
  const { api } = opts;
  let alive = true;
  const root = el(doc, 'div', { class: 'sui-stack', 'data-testid': 'pa-root' });
  host.replaceChildren(root);

  // Создать компанию
  const create = el(doc, 'form', { class: 'sui-card sui-stack', 'data-testid': 'pa-create', novalidate: '' });
  const nameIn = el(doc, 'input', { class: 'sui-input', name: 'name', placeholder: 'Название компании', 'aria-label': 'Название компании' });
  const testIn = el(doc, 'input', { type: 'checkbox', name: 'is_test' });
  const testLbl = el(doc, 'label', { class: 'sui-check' }); testLbl.append(testIn, doc.createTextNode('тестовая'));
  const createBtn = el(doc, 'button', { type: 'submit', class: 'pf-btn' }, 'Создать компанию');
  const createMsg = msg(doc);
  const row = el(doc, 'div', { class: 'sui-row' }); row.append(nameIn, testLbl, createBtn);
  create.append(el(doc, 'h3', { class: 'sui-section-title' }, 'Новая компания'),
    el(doc, 'div', { class: 'sui-hint' }, 'При создании у компании появляются 9 ролей-шаблонов и включается «План/Факт». Людей заводит администратор компании.'),
    row, createMsg);

  const list = el(doc, 'div', { class: 'sui-stack', 'data-testid': 'pa-list' });
  const listMsg = msg(doc);
  root.append(
    el(doc, 'div', { class: 'sui-hint' }, 'Компании платформы и их модули. Раздел видит только администратор платформы; каждое изменение пишется в журнал.'),
    create, listMsg, list);

  async function load(): Promise<void> {
    const res = await api.companies();
    if (!alive) return;
    if (!res.ok) { list.replaceChildren(); listMsg.show('error', res.message); return; }
    list.replaceChildren(...res.value.map(companyCard));
    if (!res.value.length) list.appendChild(el(doc, 'div', { class: 'sui-hint' }, 'Компаний пока нет.'));
  }

  function companyCard(c: AdminCompany): HTMLElement {
    const card = el(doc, 'section', { class: 'sui-card sui-stack', 'data-company': c.id });
    const head = el(doc, 'div', { class: 'sui-card-head' });
    const left = el(doc, 'div', { class: 'sui-row' });
    left.appendChild(el(doc, 'span', { class: 'sui-title' }, c.name));
    if (c.is_test) left.appendChild(el(doc, 'span', { class: 'sui-badge' }, 'тестовая'));
    head.append(left, el(doc, 'span', { class: 'sui-hint' }, 'людей: ' + c.people));
    const cardMsg = msg(doc);

    const mods = el(doc, 'div', { class: 'sui-list' });
    for (const m of c.modules) {
      const line = el(doc, 'div', { class: 'sui-list-row', 'data-module': m.code });
      line.appendChild(el(doc, 'span', { class: 'sui-title' }, m.name));
      if (m.managed) {
        const sw = el(doc, 'label', { class: 'sui-check' });
        const box = el(doc, 'input', { type: 'checkbox', 'aria-label': `${m.name} у компании ${c.name}` });
        box.checked = m.enabled === true;
        const state = el(doc, 'span', {}, box.checked ? 'включён' : 'выключен');
        box.addEventListener('change', () => {
          const want = box.checked;
          box.disabled = true;
          void api.setModule(c.id, m.code, want).then((r) => {
            box.disabled = false;
            if (!r.ok) { box.checked = !want; cardMsg.show('error', r.message); return; }
            state.textContent = want ? 'включён' : 'выключен';
            cardMsg.show('ok', `«${m.name}» ${want ? 'включён' : 'выключен'}. Люди компании увидят изменение после обновления страницы.`);
            if (opts.onChanged) opts.onChanged();
          });
        });
        sw.append(box, state);
        line.appendChild(sw);
      }
      if (MODULE_HINTS[m.code]) line.appendChild(el(doc, 'div', { class: 'sui-hint', 'data-testid': 'pa-mod-hint' }, MODULE_HINTS[m.code]));
      mods.appendChild(line);
    }

    const adm = el(doc, 'form', { class: 'sui-row', 'data-testid': 'pa-admin', novalidate: '' });
    const mail = el(doc, 'input', { class: 'sui-input', type: 'email', name: 'email', inputmode: 'email', placeholder: 'почта существующей учётки', 'aria-label': `Почта администратора компании ${c.name}` });
    const go = el(doc, 'button', { type: 'submit', class: 'pf-btn' }, 'Назначить администратора');
    adm.append(mail, go);
    adm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const email = mail.value.trim();
      if (!email) { cardMsg.show('error', 'Введите почту'); return; }
      go.disabled = true;
      void api.setCompanyAdmin(c.id, email).then((r) => {
        go.disabled = false;
        if (!r.ok) { cardMsg.show('error', r.message); return; }
        mail.value = '';
        // список перерисуется (число людей) — итог показываем над списком
        void load().then(() => listMsg.show('ok', `${email} — администратор компании «${c.name}».`));
      });
    });

    card.append(head, mods, el(doc, 'div', { class: 'sui-hint' }, 'Администратор компании'), adm, cardMsg);
    return card;
  }

  create.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = nameIn.value.trim();
    if (!name) { createMsg.show('error', 'Введите название компании'); return; }
    createBtn.disabled = true;
    void api.createCompany(name, testIn.checked).then((r) => {
      createBtn.disabled = false;
      if (!r.ok) { createMsg.show('error', r.message); return; }
      nameIn.value = ''; testIn.checked = false;
      createMsg.show('ok', `Компания «${name}» создана.`);
      if (opts.onChanged) opts.onChanged();
      void load();
    });
  });

  list.appendChild(el(doc, 'div', { class: 'sui-hint' }, 'Загрузка…'));
  void load();
  return () => { alive = false; host.replaceChildren(); };
}
