import { handle, json, errorResponse } from "../components/client/1.0.0/index.ts";
import { openBaseline, type BaselineFaults } from "./baseline.ts";
import { tokens } from "./fixtures.ts";

export interface ServerOptions { dataDir: string; port?: number; faults?: BaselineFaults }
export function startServer({ dataDir, port = 3000, faults }: ServerOptions) {
  const assembly = openBaseline(dataDir, faults);
  try {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port,
      async fetch(request) {
        if (new URL(request.url).pathname === "/healthz" && request.method === "GET") return json({ status: "ok" });
        const authorization = request.headers.get("authorization");
        const identity = authorization?.startsWith("Bearer ") ? tokens.get(authorization.slice(7)) : undefined;
        if (!identity) return json({ error: { code: "unauthorized" } }, 401, { "www-authenticate": "Bearer" });
        return handle(request, assembly.ports(identity));
      },
      error() { return errorResponse("internal_error", 500); },
    });
    let stopping: Promise<void> | undefined;
    return {
      url: server.url.toString().replace(/\/$/, ""),
      stop() {
        return stopping ??= (async () => {
          try { await server.stop(); }
          finally { assembly.close(); }
        })();
      },
    };
  } catch (error) {
    assembly.close();
    throw error;
  }
}
