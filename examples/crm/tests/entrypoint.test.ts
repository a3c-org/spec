import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("entrypoints initialize once, serve curl, and shut down on SIGTERM", async () => {
  const root = await mkdtemp(join(tmpdir(), "crm-entrypoint-"));
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  const env = { ...process.env, CRM_DATA_DIR: join(root, "state"), CRM_PORT: "0" };
  let server: ReturnType<typeof Bun.spawn> | undefined;
  try {
    const initialize = () => Bun.spawn([process.execPath, "init.ts"], { cwd, env, stdout: "pipe", stderr: "pipe" });
    const first = initialize();
    expect(await first.exited).toBe(0);
    expect(await new Response(first.stderr).text()).toBe("");
    await new Response(first.stdout).text();
    const repeat = initialize();
    expect(await repeat.exited).toBe(1);
    expect(await new Response(repeat.stderr).text()).toContain("already exists");
    await new Response(repeat.stdout).text();

    const running = Bun.spawn([process.execPath, "server.ts"], { cwd, env, stdout: "pipe", stderr: "pipe" });
    server = running;
    const reader = running.stdout.getReader();
    let line = "";
    while (!line.includes("\n")) {
      const { done, value } = await reader.read();
      if (done) throw new Error("Server exited without a listening address");
      line += new TextDecoder().decode(value);
    }
    reader.releaseLock();
    const { listening } = JSON.parse(line.split("\n")[0]!);
    const curl = Bun.spawn(["curl", "--silent", "--show-error", "--fail", "--max-time", "5", "--header", "Authorization: Bearer alpha-rw-token", `${listening}/contacts/c17`], { stdout: "pipe", stderr: "pipe" });
    expect(await curl.exited).toBe(0);
    expect(await new Response(curl.stdout).json()).toEqual({ id: "c17", name: "Ada Lovelace" });
    expect(await new Response(curl.stderr).text()).toBe("");
    running.kill("SIGTERM");
    expect(await running.exited).toBe(0);
    expect(await new Response(running.stderr).text()).toBe("");
  } finally {
    if (server && server.exitCode === null) { server.kill("SIGKILL"); await server.exited; }
    await rm(root, { recursive: true, force: true });
  }
}, 10_000);
