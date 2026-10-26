/**
 * Ожидание в тестах экранов (P2-0006c, этап 7 — нестабильный тест после P2-0006): вместо фиксированной паузы 20–40 мс
 * ждём, пока экран «успокоится» — нет изменений DOM quietMs подряд (подставной сервер отвечает сразу, React дорисовывает
 * порциями) и на экране нет «Загрузка…». Под нагрузкой (параллельные файлы тестов) фиксированной паузы не хватало. Предел — maxMs.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function settle(quietMs = 60, maxMs = 3000): Promise<void> {
  const doc = (globalThis as any).document;
  const MO = doc && doc.defaultView && doc.defaultView.MutationObserver;
  return new Promise((resolve) => {
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let obs: { observe: (n: unknown, o: unknown) => void; disconnect: () => void } | null = null;
    const loading = (): boolean => !!(doc && doc.body && /Загрузка/.test(String(doc.body.textContent || '')));
    const done = (): void => {
      if (loading() && Date.now() - start <= maxMs) { arm(); return; }
      if (timer) clearTimeout(timer); if (obs) obs.disconnect(); resolve();
    };
    const arm = (): void => {
      if (timer) clearTimeout(timer);
      if (Date.now() - start > maxMs) { done(); return; }
      timer = setTimeout(done, quietMs);
    };
    if (MO) { obs = new MO(arm); obs!.observe(doc, { subtree: true, childList: true, characterData: true, attributes: true }); }
    arm();
  });
}

/** Дождаться условия (опрос каждые 10 мс, не дольше maxMs), затем — settle(). Для экранов, где данные приходят в несколько шагов. */
export async function until(cond: () => unknown, maxMs = 3000): Promise<void> {
  const start = Date.now();
  while (!cond() && Date.now() - start < maxMs) await new Promise((r) => setTimeout(r, 10));
  await settle();
}
