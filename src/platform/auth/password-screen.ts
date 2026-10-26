/**
 * P2-0028: смена пароля без React (файл входа маленький — как login-screen.ts).
 * renderPasswordScreen — «Придумайте пароль» поверх оболочки после входа временным паролем: дальше не пускает, только «Выйти».
 * renderMyProfile — «Настройки → Платформа → Мой профиль»: ФИО («Изменить ФИО»), почта, «Сменить пароль».
 * Правило пароля на экране — checkNewPassword; сервер (GoTrue) проверяет своё, флаг снимает pf_password_changed.
 */
import { checkNewPassword } from './auth.service.ts';
import type { SignInResult } from './auth.service.ts';

export const PASSWORD_CSS = `
.p2-profile{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px}
.p2-profile [hidden]{display:none!important}
.p2-profile-title{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)}
.p2-profile-name{font-size:15px;font-weight:800;color:var(--text-main);overflow-wrap:anywhere}
.p2-profile-mail{font-size:13px;color:var(--text-muted);overflow-wrap:anywhere}
.p2-profile form{display:flex;flex-direction:column;gap:10px;max-width:420px}
.p2-profile label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted)}
.p2-profile input{font-size:16px;min-height:44px;padding:9px 12px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main);text-transform:none;font-weight:400}
.p2-profile-row{display:flex;flex-wrap:wrap;gap:8px}
.p2-profile-btn{min-height:40px;padding:0 16px;border-radius:12px;border:1px solid var(--card-border);background:transparent;color:var(--text-main);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;cursor:pointer}
.p2-profile-btn--main{background:var(--accent,var(--primary));border-color:transparent;color:#fff}
.p2-profile-btn:disabled{opacity:.6;cursor:default}
.p2-profile-error{font-size:13px;color:var(--color-red,#dc2626)}
.p2-profile-ok{font-size:13px;color:var(--color-green,#16a34a)}
`;

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function field(doc: Document, label: string, name: string, autocomplete: string): HTMLLabelElement {
  const l = el(doc, 'label', {}, label);
  l.appendChild(el(doc, 'input', { type: 'password', name, autocomplete, minlength: '8' }));
  return l;
}

/** Форма «новый пароль + ещё раз». onDone — после успешной смены. */
function passwordForm(doc: Document, opts: { change: (pw: string) => Promise<SignInResult>; submitText: string; btnClass: string;
  errClass: string; onDone: () => void; testid: string }): HTMLFormElement {
  const form = el(doc, 'form', { 'data-testid': opts.testid, novalidate: '' });
  form.append(field(doc, 'Новый пароль (не короче 8 знаков)', 'password', 'new-password'), field(doc, 'Ещё раз', 'repeat', 'new-password'));
  const err = el(doc, 'div', { class: opts.errClass, role: 'alert', hidden: '' });
  const submit = el(doc, 'button', { type: 'submit', class: opts.btnClass }, opts.submitText);
  form.append(err, submit);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (submit.disabled) return;
    const pw = (form.elements.namedItem('password') as HTMLInputElement).value;
    const rep = (form.elements.namedItem('repeat') as HTMLInputElement).value;
    const bad = checkNewPassword(pw, rep);
    if (bad) { err.textContent = bad; err.hidden = false; return; }
    submit.disabled = true; err.hidden = true;
    void opts.change(pw).then((res) => {
      submit.disabled = false;
      if (!res.ok) { err.textContent = res.message; err.hidden = false; return; }
      form.reset();
      opts.onDone();
    });
  });
  return form;
}

export interface PasswordScreenOpts {
  email: string;
  change: (password: string) => Promise<SignInResult>;
  signOut: () => void;
}

/** «Придумайте пароль» (после входа временным паролем). Карточка — как экран «Вход». */
export function renderPasswordScreen(host: HTMLElement, opts: PasswordScreenOpts): () => void {
  const doc = host.ownerDocument;
  host.replaceChildren();
  const card = el(doc, 'div', { class: 'p2-login', 'data-testid': 'p2-new-password', role: 'dialog', 'aria-label': 'Придумайте пароль' });
  card.append(el(doc, 'h2', {}, 'Придумайте пароль'),
    el(doc, 'p', { class: 'p2-login-sub' }, `${opts.email} — вы вошли временным паролем. Придумайте свой: дальше входите им.`));
  const form = passwordForm(doc, { change: opts.change, submitText: 'Сохранить пароль', btnClass: 'p2-login-btn', errClass: 'p2-login-error',
    onDone: () => undefined, testid: 'p2-new-password-form' });
  const out = el(doc, 'button', { type: 'button', class: 'p2-login-demo', 'data-testid': 'p2-new-password-signout' }, 'Выйти');
  out.addEventListener('click', () => opts.signOut());
  card.append(form, out);
  host.appendChild(card);
  return () => host.replaceChildren();
}

export interface MyProfileOpts {
  email: string;
  fullName: string | null;
  change: (password: string) => Promise<SignInResult>;
  /** Сохранить своё ФИО (сервер переписывает имя в моих записях). Нет — ФИО только показывается. */
  saveName?: (name: string) => Promise<SignInResult>;
}

/** «Мой профиль»: ФИО, почта (логин — меняет администратор), «Сменить пароль». */
export function renderMyProfile(host: HTMLElement, opts: MyProfileOpts): () => void {
  const doc = host.ownerDocument;
  host.replaceChildren();
  const box = el(doc, 'div', { class: 'p2-profile', 'data-testid': 'p2-profile' });
  box.append(el(doc, 'div', { class: 'p2-profile-title' }, 'Мой профиль'),
    el(doc, 'div', { class: 'p2-profile-name', 'data-testid': 'p2-profile-name' }, opts.fullName || 'ФИО не указано'),
    el(doc, 'div', { class: 'p2-profile-mail' }, `Почта для входа: ${opts.email} (меняет администратор компании)`));
  const ok = el(doc, 'div', { class: 'p2-profile-ok', role: 'status', hidden: '' }, 'Пароль сменён');
  const open = el(doc, 'button', { type: 'button', class: 'p2-profile-btn', 'data-testid': 'p2-profile-password' }, 'Сменить пароль');
  const form = passwordForm(doc, { change: opts.change, submitText: 'Сохранить пароль', btnClass: 'p2-profile-btn p2-profile-btn--main',
    errClass: 'p2-profile-error', testid: 'p2-profile-password-form', onDone: () => { form.hidden = true; open.hidden = false; ok.hidden = false; } });
  form.hidden = true;
  const cancel = el(doc, 'button', { type: 'button', class: 'p2-profile-btn' }, 'Отмена');
  cancel.addEventListener('click', () => { form.reset(); form.hidden = true; open.hidden = false; });
  form.appendChild(cancel);
  open.addEventListener('click', () => { form.hidden = false; open.hidden = true; ok.hidden = true; });
  const row = el(doc, 'div', { class: 'p2-profile-row' });
  row.append(open);
  box.append(row, form, ok);
  if (opts.saveName) {
    const save = opts.saveName;
    const editBtn = el(doc, 'button', { type: 'button', class: 'p2-profile-btn', 'data-testid': 'p2-profile-name-edit' }, 'Изменить ФИО');
    const nameForm = el(doc, 'form', { 'data-testid': 'p2-profile-name-form', novalidate: '' });
    const lab = el(doc, 'label', {}, 'ФИО');
    lab.appendChild(el(doc, 'input', { name: 'full_name', maxlength: '120', autocomplete: 'name', value: opts.fullName || '' }));
    const nerr = el(doc, 'div', { class: 'p2-profile-error', role: 'alert', hidden: '' });
    const nsubmit = el(doc, 'button', { type: 'submit', class: 'p2-profile-btn p2-profile-btn--main' }, 'Сохранить ФИО');
    const ncancel = el(doc, 'button', { type: 'button', class: 'p2-profile-btn' }, 'Отмена');
    nameForm.append(lab, nerr, nsubmit, ncancel);
    nameForm.hidden = true;
    editBtn.addEventListener('click', () => { nameForm.hidden = false; editBtn.hidden = true; ok.hidden = true; });
    ncancel.addEventListener('click', () => { nameForm.hidden = true; editBtn.hidden = false; nerr.hidden = true; });
    nameForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (nsubmit.disabled) return;
      const v = (nameForm.elements.namedItem('full_name') as HTMLInputElement).value.trim();
      if (v.length < 2) { nerr.textContent = 'Укажите ФИО'; nerr.hidden = false; return; }
      nsubmit.disabled = true; nerr.hidden = true;
      void save(v).then((res) => {
        nsubmit.disabled = false;
        if (!res.ok) { nerr.textContent = res.message; nerr.hidden = false; return; }
        nameForm.hidden = true; editBtn.hidden = false;
      });
    });
    row.prepend(editBtn);
    box.insertBefore(nameForm, form);
  }
  host.appendChild(box);
  return () => host.replaceChildren();
}
