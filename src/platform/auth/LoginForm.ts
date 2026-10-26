/**
 * Общие стили базовых элементов разделов Platform 2.0 (полоса «кто вошёл», кнопки, поля). Форма входа внутри разделов
 * убрана (P2-0013): вход — общий экран «Вход» платформы (login-screen.ts). Имя файла сохранено ради импортов.
 */
/** Общие стили входа и базовых элементов (токены оболочки, светлая/тёмная тема). */
export const PLATFORM_AUTH_CSS = `
.pf-login{max-width:380px;margin:24px auto;padding:20px;display:flex;flex-direction:column;gap:12px}
.pf-field{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted)}
.pf-field input{font-size:14px;padding:9px 12px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main)}
.pf-btn{font-size:13px;font-weight:700;padding:10px 14px;border-radius:10px;border:1px solid var(--primary);background:var(--primary);color:var(--card-bg);cursor:pointer}
.pf-btn:disabled{opacity:.6;cursor:default}
.pf-btn--ghost{background:transparent;color:var(--text-main);border-color:var(--card-border)}
.pf-error{font-size:12px;color:var(--color-red)}
.pf-bar{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:10px 24px;font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--card-border)}
.pf-bar b{color:var(--text-main)}
.pf-muted{color:var(--text-muted);font-size:13px}
`;
