// P2-0072: типы сервиса номеров платформы (js/services/record-id.service.js) для кода src/.
export declare const RECORDS_NAMESPACE: string;
export declare function isUuid(s: unknown): boolean;
export declare function newId(opts?: { noNative?: boolean }): string;
export declare function uuidV5(name: string, namespace: string): string;
export declare function stableId(...parts: unknown[]): string;
export declare function childId(parentId: unknown, legacyId: unknown, ...parts: unknown[]): string;
export declare const RbiIds: {
  newId: typeof newId;
  stableId: typeof stableId;
  childId: typeof childId;
  isUuid: typeof isUuid;
  uuidV5: typeof uuidV5;
  RECORDS_NAMESPACE: string;
};
