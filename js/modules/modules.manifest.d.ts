/** P2-0061: типы реестра манифестов для кода платформы (src/*.ts) — описание видов записей `sync` (standards/SYNC_AND_ACCESS.md). */
export interface SyncKindManifest { kind: string; store: string; table?: string; title: string; mode?: string; /** P2-0064: функция сервера — вид уходит общей отправкой сервиса платформы */ rpc?: string; [k: string]: unknown }
export interface ModuleManifestLike { id: string; enabled?: boolean; sync?: SyncKindManifest[]; [k: string]: unknown }
export const ModulesManifest: ModuleManifestLike[];
export function isModuleEnabled(manifest: ModuleManifestLike | null | undefined): boolean;
export function getModuleManifest(id: string): ModuleManifestLike | null;
