import type { Contacts } from "../../../contracts/contacts/1.0.0/index.ts";
import type { Labels } from "../../../contracts/contact-labels/1.0.0/index.ts";
import type { ErrorCode } from "../../../profiles/bun-inprocess/1.0.0/index.ts";

export const RELEASE = "example.crm/client@1.0.0";
export interface ClientPorts { contacts: Contacts; labels: Labels }
const status: Record<ErrorCode, number> = { invalid_input: 400, forbidden: 403, not_found: 404, conflict: 409, unavailable: 503 };
export function json(value: unknown, statusCode = 200, headers: Record<string, string> = {}) {
  return Response.json(value, { status: statusCode, headers: { "cache-control": "no-store", ...headers } });
}
export const errorResponse = (code: string, statusCode: number) => json({ error: { code } }, statusCode);
const domainError = (code: ErrorCode) => errorResponse(code, status[code]);

async function body(request: Request, keys: readonly string[]): Promise<Record<string, string> | Response> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return errorResponse("unsupported_media_type", 415);
  }
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return errorResponse("invalid_input", 400);
    const fields = value as Record<string, unknown>;
    if (Object.keys(fields).length !== keys.length || !keys.every(key => typeof fields[key] === "string")) {
      return errorResponse("invalid_input", 400);
    }
    return fields as Record<string, string>;
  } catch {
    return errorResponse("invalid_input", 400);
  }
}

// The runner supplies ports already bound to the authenticated request identity.
export async function handle(request: Request, ports: ClientPorts): Promise<Response> {
  const path = new URL(request.url).pathname;
  const match = /^\/contacts\/([^/]+)(\/labels)?$/.exec(path);
  const collection = path === "/contacts";
  if (!collection && !match) return errorResponse("not_found", 404);
  const allowed = collection ? ["POST"] : match?.[2] ? ["GET", "POST"] : ["GET"];
  if (!allowed.includes(request.method)) {
    return json({ error: { code: "method_not_allowed" } }, 405, { allow: allowed.join(", ") });
  }
  let id: string;
  try { id = decodeURIComponent(match?.[1] ?? ""); }
  catch { return errorResponse("invalid_input", 400); }

  if (collection) {
    const input = await body(request, ["name", "request_id"]);
    if (input instanceof Response) return input;
    const result = await ports.contacts.create(input.name!, input.request_id!);
    return result.ok ? json({ id: result.value }, 201, { location: `/contacts/${encodeURIComponent(result.value)}` }) : domainError(result.error);
  }
  if (match?.[2]) {
    if (request.method === "GET") {
      const result = await ports.labels.list(id);
      return result.ok ? json({ labels: result.value }) : domainError(result.error);
    }
    const input = await body(request, ["label"]);
    if (input instanceof Response) return input;
    const result = await ports.labels.add(id, input.label!);
    return result.ok ? new Response(null, { status: 204, headers: { "cache-control": "no-store" } }) : domainError(result.error);
  }
  const result = await ports.contacts.get(id);
  return result.ok ? json(result.value) : domainError(result.error);
}
