/**
 * Экран «Настройки → Администрирование платформы» (P2-0013). Без React: файл маленький и скачивается только администратору платформы.
 * Компании (название, тестовая, людей, модули), «Создать компанию», выключатель модуля Platform 2.0, «Назначить администратора компании»
 * по почте существующей учётки. Старые модули (Качество, Стройконтроль…) — в списке с пометкой, без выключателя (решение владельца 22.10.2026).
 * Права проверяет сервер; экран только показывает ответ.
 */
import type { AdminApi, AdminCompany } from './admin.service.ts';

export const ADMIN_CSS = `
.pa-root{display:flex;flex-direction:column;gap:12px;color:var(--text-main)}
.pa-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px}
.pa-title{margin:0;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.02em}
.pa-muted{font-size:12px;color:var(--text-muted);line-height:1.45}
.pa-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pa-input{flex:1 1 200px;min-width:0;font-size:16px;min-height:44px;padding:8px 12px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main)}
.pa-btn{min-height:44px;padding:8px 16px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;border-radius:12px;border:0;background:var(--accent,var(--primary));color:#fff;cursor:pointer}
.pa-btn:disabled{opacity:.6;cursor:default}
.pa-check{display:inline-flex;align-items:center;gap:8px;font-size:13px;min-height:44px}
.pa-check input{width:20px;height:20px}
.pa-head{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;justify-content:space-between}
.pa-name{font-size:15px;font-weight:800}
.pa-badge{font-size:10px;font-weight:800;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid var(--card-border);color:var(--text-muted)}
.pa-mods{display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--card-border);padding-top:10px}
.pa-mod{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;min-height:44px}
.pa-mod-name{font-size:14px;font-weight:700}
.pa-mod-hint{flex:1 1 100%;font-size:11px;color:var(--text-muted);margin-top:-6px}
.pa-switch{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;cursor:pointer;min-height:44px}
.pa-switch input{width:22px;height:22px}
.pa-msg{font-size:13px}
.pa-msg[data-kind="error"]{color:var(--color-red,#dc2626)}
.pa-msg[data-kind="ok"]{color:var(--color-green,#16a34a)}
.pa-root [hidden]{display:none!important}
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
  const m = el(doc, 'div', { class: 'pa-msg', role: 'status', hidden: '' }) as HTMLDivElement & { show: (kind: 'ok' | 'error', text: string) => void };
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
  const root = el(doc, 'div', { class: 'pa-root', 'data-testid': 'pa-root' });
  host.replaceChildren(root);

  // Создать компанию
  const create = el(doc, 'form', { class: 'pa-card', 'data-testid': 'pa-create', novalidate: '' });
  const nameIn = el(doc, 'input', { class: 'pa-input', name: 'name', placeholder: 'Название компании', 'aria-label': 'Название компании' });
  const testIn = el(doc, 'input', { type: 'checkbox', name: 'is_test' });
  const testLbl = el(doc, 'label', { class: 'pa-check' }); testLbl.append(testIn, doc.createTextNode('тестовая'));
  const createBtn = el(doc, 'button', { type: 'submit', class: 'pa-btn' }, 'Создать компанию');
  const createMsg = msg(doc);
  const row = el(doc, 'div', { class: 'pa-row' }); row.append(nameIn, testLbl, createBtn);
  create.append(el(doc, 'h3', { class: 'pa-title' }, 'Новая компания'),
    el(doc, 'div', { class: 'pa-muted' }, 'При создании у компании появляются 9 ролей-шаблонов и включается «План/Факт». Людей заводит администратор компании.'),
    row, createMsg);

  const list = el(doc, 'div', { class: 'pa-root', 'data-testid': 'pa-list' });
  const listMsg = msg(doc);
  root.append(
    el(doc, 'div', { class: 'pa-muted' }, 'Компании платформы и их модули. Раздел видит только администратор платформы; каждое изменение пишется в журнал.'),
    create, listMsg, list);

  async function load(): Promise<void> {
    const res = await api.companies();
    if (!alive) return;
    if (!res.ok) { list.replaceChildren(); listMsg.show('error', res.message); return; }
    list.replaceChildren(...res.value.map(companyCard));
    if (!res.value.length) list.appendChild(el(doc, 'div', { class: 'pa-muted' }, 'Компаний пока нет.'));
  }

  function companyCard(c: AdminCompany): HTMLElement {
    const card = el(doc, 'section', { class: 'pa-card', 'data-company': c.id });
    const head = el(doc, 'div', { class: 'pa-head' });
    const left = el(doc, 'div', { class: 'pa-row' });
    left.appendChild(el(doc, 'span', { class: 'pa-name' }, c.name));
    if (c.is_test) left.appendChild(el(doc, 'span', { class: 'pa-badge' }, 'тестовая'));
    head.append(left, el(doc, 'span', { class: 'pa-muted' }, 'людей: ' + c.people));
    const cardMsg = msg(doc);

    const mods = el(doc, 'div', { class: 'pa-mods' });
    for (const m of c.modules) {
      const line = el(doc, 'div', { class: 'pa-mod', 'data-module': m.code });
      line.appendChild(el(doc, 'span', { class: 'pa-mod-name' }, m.name));
      if (m.managed) {
        const sw = el(doc, 'label', { class: 'pa-switch' });
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
      if (MODULE_HINTS[m.code]) line.appendChild(el(doc, 'div', { class: 'pa-mod-hint' }, MODULE_HINTS[m.code]));
      mods.appendChild(line);
    }

    const adm = el(doc, 'form', { class: 'pa-row', 'data-testid': 'pa-admin', novalidate: '' });
    const mail = el(doc, 'input', { class: 'pa-input', type: 'email', name: 'email', inputmode: 'email', placeholder: 'почта существующей учётки', 'aria-label': `Почта администратора компании ${c.name}` });
    const go = el(doc, 'button', { type: 'submit', class: 'pa-btn' }, 'Назначить администратора');
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

    card.append(head, mods, el(doc, 'div', { class: 'pa-muted' }, 'Администратор компании'), adm, cardMsg);
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

  list.appendChild(el(doc, 'div', { class: 'pa-muted' }, 'Загрузка…'));
  void load();
  return () => { alive = false; host.replaceChildren(); };
}
