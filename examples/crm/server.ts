import { defaultDataDir } from "./runtime/state.ts";
import { startServer } from "./runtime/http.ts";
try {
  const rawPort = process.env.CRM_PORT ?? "3000";
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error("CRM_PORT must be an integer between 0 and 65535");
  const server = startServer({ dataDir: process.env.CRM_DATA_DIR ?? defaultDataDir, port });
  console.log(JSON.stringify({ listening: server.url }));
  const shutdown = () => { void server.stop().catch(() => { process.exitCode = 1; }); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Server startup failed");
  process.exitCode = 1;
}
