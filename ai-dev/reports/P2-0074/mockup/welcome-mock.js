// Макет приветствия P2-0074 (этап 1, до кода): рисуется прямо в оболочке на стенде. Цвета — токены темы «Стандартная».
window.__mockWelcome = function (opts) {
  const { name, company, role, tiles, animate, phone } = opts;
  const css = `
  .p2w { box-sizing: border-box; width: 100%; max-width: 880px; margin: 0 auto; padding: ${phone ? '20px 16px 40px' : '64px 32px 64px'};
    color: var(--text-main); font-family: inherit; }
  .p2w * { box-sizing: border-box; }
  .p2w-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--accent-text); display: flex; align-items: center; gap: 10px; }
  .p2w-eyebrow::before { content: ''; width: 28px; height: 2px; border-radius: 2px; background: var(--accent); transform-origin: left; }
  .p2w-h { font-size: ${phone ? '26px' : '34px'}; line-height: 1.15; font-weight: 700; margin: 12px 0 8px; letter-spacing: -.01em; text-wrap: balance; }
  .p2w-p { font-size: ${phone ? '15px' : '16px'}; line-height: 1.5; color: var(--text-muted); margin: 0 0 ${phone ? '20px' : '32px'}; max-width: 60ch; }
  .p2w-grid { display: grid; gap: ${phone ? '10px' : '14px'}; grid-template-columns: ${phone ? '1fr' : 'repeat(' + Math.min(2, tiles.length) + ', minmax(0, 1fr))'}; ${!phone && tiles.length === 1 ? 'max-width: 420px;' : ''} }
  .p2w-tile { display: flex; align-items: center; gap: 14px; text-align: left; width: 100%; min-height: ${phone ? '76px' : '96px'};
    padding: ${phone ? '14px 14px' : '20px 20px'}; border-radius: 16px; border: 1px solid var(--card-border); background: var(--card-bg);
    box-shadow: var(--shadow-1); color: inherit; cursor: pointer; font: inherit; transition: border-color .15s, transform .15s, box-shadow .15s; }
  .p2w-tile:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: var(--shadow-2); }
  .p2w-ico { flex: none; width: ${phone ? '44px' : '52px'}; height: ${phone ? '44px' : '52px'}; border-radius: 12px; display: grid; place-items: center;
    background: var(--sel-bg); color: var(--accent-text); }
  .p2w-ico svg { width: ${phone ? '22px' : '26px'}; height: ${phone ? '22px' : '26px'}; }
  .p2w-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .p2w-t { font-size: ${phone ? '16px' : '17px'}; font-weight: 700; }
  .p2w-d { font-size: 14px; line-height: 1.4; color: var(--text-muted); }
  .p2w-go { flex: none; color: var(--text-muted); }
  .p2w-foot { margin-top: ${phone ? '22px' : '32px'}; padding-top: ${phone ? '16px' : '20px'}; border-top: 1px solid var(--card-border); display: flex; flex-wrap: wrap; gap: ${phone ? '0' : '10px'} 24px; }
  .p2w-link { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: 15px; font-weight: 600; color: var(--accent-text); text-decoration: none; background: none; border: 0; padding: 0; cursor: pointer; font-family: inherit; }
  .p2w-link svg { width: 18px; height: 18px; }
  .p2w-anim .p2w-eyebrow, .p2w-anim .p2w-h, .p2w-anim .p2w-p, .p2w-anim .p2w-tile, .p2w-anim .p2w-foot { opacity: 0; animation: p2w-in .5s cubic-bezier(.2,.7,.2,1) forwards; }
  .p2w-anim .p2w-eyebrow::before { transform: scaleX(0); animation: p2w-line .5s .1s ease-out forwards; }
  .p2w-anim .p2w-h { animation-delay: .08s; } .p2w-anim .p2w-p { animation-delay: .18s; }
  .p2w-anim .p2w-foot { animation-delay: .75s; }
  @keyframes p2w-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  @keyframes p2w-line { to { transform: scaleX(1); } }
  @media (prefers-reduced-motion: reduce) { .p2w-anim * { animation: none !important; opacity: 1 !important; transform: none !important; } }`;
  let st = document.getElementById('p2w-style');
  if (!st) { st = document.createElement('style'); st.id = 'p2w-style'; document.head.appendChild(st); }
  st.textContent = css;
  const chev = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  const book = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/></svg>';
  const gear = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  const tilesHtml = tiles.map((t, i) => `<button class="p2w-tile" style="animation-delay:${(0.28 + i * 0.09).toFixed(2)}s"><span class="p2w-ico">${t.icon}</span>
    <span class="p2w-txt"><span class="p2w-t">${t.title}</span><span class="p2w-d">${t.desc}</span></span><span class="p2w-go">${chev}</span></button>`).join('');
  const el = document.createElement('section');
  el.className = 'p2w' + (animate ? ' p2w-anim' : '');
  el.innerHTML = `<div class="p2w-eyebrow">${company}${role ? ' · ' + role : ''}</div>
    <h1 class="p2w-h">Добро пожаловать, ${name}</h1>
    <p class="p2w-p">Здесь ваши разделы. Откройте нужный — в следующий раз приложение сразу откроет тот, где вы были.</p>
    <div class="p2w-grid">${tilesHtml}</div>
    <div class="p2w-foot"><a class="p2w-link" href="#">${book}Как тут всё устроено — обучение</a><a class="p2w-link" href="#">${gear}Настройки</a></div>`;
  return el;
};
