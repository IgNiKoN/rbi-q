/**
 * P2-0057: сервис «Файлы» платформы (MODULES §3) — закрытые файлы ядра (бакет core-place-plans, 055). Экраны не зовут Storage
 * напрямую: только этот адаптер. Ссылка файла — того же вида, что у файлов Качества (…/storage/v1/object/public/<бакет>/<путь>):
 * открывает её кэш приложения со входом вошедшего (sw.js: isCompanyFileUrl), без сети — офлайн-кэш.
 */
import { getClient } from '../../auth/auth.service.ts';

export const PLACE_PLANS_BUCKET = 'core-place-plans';
/** Предел файла плана — как у бакета и сервера (055). */
export const PLAN_MAX_BYTES = 50 * 1024 * 1024;

export type FileCheck = { ok: true } | { ok: false; message: string };

/** Файл плана: PDF (по типу или имени), не пустой, до 50 МБ. Сервер проверяет то же. */
export function checkPlanFile(file: { name?: string; type?: string; size?: number }): FileCheck {
  const name = String(file.name || '');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(name);
  if (!isPdf) return { ok: false, message: `«${name || 'файл'}» — не PDF. План загружается файлом PDF.` };
  if (!file.size) return { ok: false, message: `«${name}» — пустой файл.` };
  if (file.size > PLAN_MAX_BYTES) return { ok: false, message: `«${name}» больше 50 МБ — уменьшите PDF.` };
  return { ok: true };
}

/** Путь файла плана: <компания>/<проект>/<место>/<id версии>.pdf (правило Storage 055). */
export function placePlanPath(companyId: string, projectId: string, placeId: string, docId: string): string {
  return `${companyId}/${projectId}/${placeId}/${docId}.pdf`;
}

/** Положить файл в закрытый бакет ядра (без перезаписи); ответ — ссылка вида …/object/public/<бакет>/<путь>. */
export async function uploadCoreFile(bucket: string, path: string, file: Blob): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const c = getClient();
  if (!c) return { ok: false, message: 'Нет входа' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, message: 'Нужен интернет' };
  try {
    const { error } = await c.storage.from(bucket).upload(path, file, { upsert: false, contentType: 'application/pdf' });
    if (error && !/exists|duplicate/i.test(error.message || '')) {
      return { ok: false, message: /row-level|403|unauthor|policy/i.test(error.message || '') ? 'Нет права загружать планы этого проекта' : error.message || 'Файл не загружен' };
    }
    const url = c.storage.from(bucket).getPublicUrl(path).data?.publicUrl || '';
    return url ? { ok: true, url } : { ok: false, message: 'Не получена ссылка на файл' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Файл не загружен' };
  }
}
