/** Минимальные типы платформы для новых TS-модулей (не полный Core). */

export type NodeType = 'object' | 'building' | 'section' | 'floor';

export interface LocationNode {
  id: string;
  companyId: string;
  nodeType: NodeType;
  parentId: string | null;
  displayName: string;
  canonical_key?: string;
  sort_order: number;
  synonyms?: unknown;
  created_by?: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
  version?: number;
  syncStatus?: string;
  source?: string;
  _deleted?: boolean;
}

export interface FloorPlan {
  id: string;
  companyId: string;
  locationId: string;
  name?: string;
  sort_order: number;
  pdf_url: string;
  pdf_name: string;
  pdf_size: string;
  is_active: boolean;
  created_by?: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
  version?: number;
  syncStatus?: string;
  source?: string;
  _deleted?: boolean;
}

interface RbiStorage {
  stores: () => Record<string, string>;
  getAll: (store: string) => Promise<unknown[]>;
  get: (store: string, id: string) => Promise<unknown>;
  put: (store: string, row: unknown) => Promise<unknown>;
}

interface RbiSync {
  markDirty?: (keys: string | string[]) => void;
  triggerSync?: (mode?: string) => void;
}

interface RbiEvents {
  emit: (name: string, payload?: unknown) => void;
  on?: (name: string, fn: (payload?: unknown) => void) => void;
}

interface RbiRegistry {
  register: (key: string, value: unknown) => void;
}

declare global {
  interface Window {
    RBI: {
      services: Record<string, unknown> & {
        storage?: RbiStorage;
        sync?: RbiSync;
        locations?: unknown;
        constructionDefects?: unknown;
        contractors?: {
          list?: () => Array<{ id?: string; display_name?: string; displayName?: string }>;
        };
        permissions?: {
          isAdmin?: () => boolean;
          canManageHierarchy?: () => boolean;
        };
        shell?: {
          getContentRoot?: () => HTMLElement | null;
        };
      };
      events?: RbiEvents;
      registry?: RbiRegistry;
      ctx?: Record<string, unknown>;
    };
    STORES?: Record<string, string>;
    showToast?: (msg: string, type?: string) => void;
    triggerSync?: (mode?: string) => void;
    PhotoManager?: {
      getAsyncUrl?: (url: string) => Promise<string>;
    };
    rbiLoadCloudPdfArrayBuffer?: (url: string) => Promise<ArrayBuffer>;
    supabaseClient?: {
      storage: {
        from: (bucket: string) => {
          upload: (
            path: string,
            file: Blob | File,
            opts?: { upsert?: boolean; contentType?: string }
          ) => Promise<{ data: unknown; error: { message: string } | null }>;
          getPublicUrl: (path: string) => { data: { publicUrl: string } };
        };
      };
    };
    syncConfig?: { project_code?: string; engineerName?: string; enabled?: boolean };
    updateBodyPadding?: () => void;
    AppRouter?: { addRoute?: (path: string, fn: () => void) => void; navigate?: (path: string, replace?: boolean) => void };
  }
}

export {};
