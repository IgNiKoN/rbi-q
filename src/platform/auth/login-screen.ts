/**
 * Экран «Вход» при открытии платформы (P2-0013). Без React: файл входа маленький и скачивается всем, а модули — только положенные.
 * Один вход — «Почта и пароль» (все разделы Platform 2.0, в т.ч. Качество и Стройконтроль — P2-0016, ADR-068);
 * ниже — «Посмотреть без входа (демо)». Вход по PIN — только в старом приложении РБИ (отдельный код).
 */
export interface LoginScreenOpts {
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onDemo: () => void;
}

export const LOGIN_CSS = `
.p2-login{width:100%;max-width:380px;background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:24px;padding:22px 20px;box-shadow:0 20px 50px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:14px;max-height:calc(100dvh - 32px);overflow-y:auto}
.p2-login h2{margin:0;text-align:center;font-size:15px;font-weight:900;text-transform:uppercase;letter-spacing:-.01em}
.p2-login-sub{margin:-8px 0 0;text-align:center;font-size:12px;color:var(--text-muted)}
.p2-login form{display:flex;flex-direction:column;gap:12px}
.p2-login [hidden]{display:none!important}
.p2-login label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted)}
.p2-login input{font-size:16px;min-height:44px;padding:9px 12px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main)}
.p2-login-btn{min-height:46px;font-size:13px;font-weight:800;text-transform:uppercase;border-radius:12px;border:0;background:var(--accent,var(--primary));color:#fff;cursor:pointer}
.p2-login-btn:disabled{opacity:.6;cursor:default}
.p2-login-error{font-size:13px;color:var(--color-red,#dc2626)}
.p2-login-demo{align-self:center;min-height:40px;font-size:12px;border:0;background:transparent;color:var(--text-muted);text-decoration:underline;cursor:pointer}
`;

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function field(doc: Document, label: string, input: Record<string, string>): HTMLLabelElement {
  const l = el(doc, 'label', {}, label);
  l.appendChild(el(doc, 'input', input));
  return l;
}

/** Нарисовать экран входа в контейнер. Возвращает функцию очистки. */
export function renderLoginScreen(host: HTMLElement, opts: LoginScreenOpts): () => void {
  const doc = host.ownerDocument;
  host.replaceChildren();
  const card = el(doc, 'div', { class: 'p2-login', 'data-testid': 'p2-login', role: 'dialog', 'aria-label': 'Вход' });
  card.append(el(doc, 'h2', {}, 'Вход'), el(doc, 'p', { class: 'p2-login-sub' }, 'RBI Platform'));

  // Почта и пароль
  const form = el(doc, 'form', { 'data-testid': 'p2-login-email', novalidate: '' });
  form.append(
    field(doc, 'Почта', { type: 'email', name: 'email', autocomplete: 'username', inputmode: 'email' }),
    field(doc, 'Пароль', { type: 'password', name: 'password', autocomplete: 'current-password' })
  );
  const err = el(doc, 'div', { class: 'p2-login-error', role: 'alert', hidden: '' });
  const submit = el(doc, 'button', { type: 'submit', class: 'p2-login-btn' }, 'Войти');
  form.append(err, submit);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (submit.disabled) return;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    if (!email.trim() || !password) { err.textContent = 'Введите почту и пароль'; err.hidden = false; return; }
    submit.disabled = true; submit.textContent = 'Входим…'; err.hidden = true;
    void opts.signIn(email, password).then((res) => {
      submit.disabled = false; submit.textContent = 'Войти';
      if (!res.ok) { err.textContent = res.message; err.hidden = false; return; }
      form.reset();
    });
  });

  const demo = el(doc, 'button', { type: 'button', class: 'p2-login-demo', 'data-testid': 'p2-login-demo' }, 'Посмотреть без входа (демо)');
  demo.addEventListener('click', () => opts.onDemo());

  card.append(form, demo);
  host.appendChild(card);
  return () => host.replaceChildren();
}
