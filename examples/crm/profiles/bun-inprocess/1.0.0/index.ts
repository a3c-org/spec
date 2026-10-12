export const PROFILE = "example.crm/bun-inprocess@1.0.0";
export type ErrorCode = "not_found" | "invalid_input" | "forbidden" | "conflict" | "unavailable";
export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorCode };
export type Permission = "contacts.read" | "contacts.write" | "labels.read" | "labels.write";
export interface Identity {
  readonly principal: string;
  readonly tenant: string;
  readonly permissions: readonly Permission[];
}
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });
export const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0;

// Injected only by fixture drivers. These are not contract operations or HTTP options.
export interface StorageFaults {
  beforeRead?: () => void;
  beforeCommit?: () => void;
  afterCommit?: () => void;
}
