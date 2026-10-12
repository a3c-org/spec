import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../runtime/http.ts";
import { initializeState, openState } from "../runtime/state.ts";
import type { StorageFaults } from "../profiles/bun-inprocess/1.0.0/index.ts";

describe("REST baseline", () => {
  let root: string;
  let directory: string;
  let server: ReturnType<typeof startServer>;
  let faults: { contacts: StorageFaults; labels: StorageFaults };
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "crm-http-"));
    directory = join(root, "state");
    await initializeState(directory);
    faults = { contacts: {}, labels: {} };
    server = startServer({ dataDir: directory, port: 0, faults });
  });
  afterEach(async () => { await server.stop(); await rm(root, { recursive: true, force: true }); });
  async function request(method: string, path: string, payload?: unknown, token = "alpha-rw-token") {
    const response = await fetch(server.url + path, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", connection: "close" },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  }

  test("health is public; CRM operations require a recognized bearer token", async () => {
    expect(await (await fetch(server.url + "/healthz")).json()).toEqual({ status: "ok" });
    for (const authorization of [undefined, "Bearer unknown", "Basic alpha-rw-token"]) {
      const response = await fetch(server.url + "/contacts/c17", { headers: authorization ? { authorization } : {} });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      expect(await response.json()).toEqual({ error: { code: "unauthorized" } });
    }
  });

  test("create, add label, and read work for both tenants and persist across restart", async () => {
    for (const token of ["alpha-rw-token", "beta-rw-token"]) {
      const created = await request("POST", "/contacts", { name: "New contact", request_id: "new" }, token);
      expect(created.status).toBe(201);
      expect(created.headers.get("location")).toBe(`/contacts/${created.body.id}`);
      const path = `/contacts/${created.body.id}`;
      expect((await request("POST", path + "/labels", { label: "customer" }, token)).status).toBe(204);
      expect((await request("POST", path + "/labels", { label: "customer" }, token)).status).toBe(204);
      expect((await request("GET", path, undefined, token)).body).toEqual({ id: created.body.id, name: "New contact" });
      expect((await request("GET", path + "/labels", undefined, token)).body).toEqual({ labels: ["customer"] });
      const other = token === "alpha-rw-token" ? "beta-rw-token" : "alpha-rw-token";
      expect((await request("GET", path, undefined, other)).status).toBe(404);
    }
    await server.stop();
    server = startServer({ dataDir: directory, port: 0 });
    const replay = await request("POST", "/contacts", { name: "New contact", request_id: "new" });
    expect((await request("GET", `/contacts/${replay.body.id}/labels`)).body).toEqual({ labels: ["customer"] });
  });

  test("read-only identities cannot create, add labels, or replay writes", async () => {
    expect((await request("GET", "/contacts/c17", undefined, "alpha-ro-token")).status).toBe(200);
    expect((await request("GET", "/contacts/c17/labels", undefined, "alpha-ro-token")).status).toBe(200);
    const denied = await request("POST", "/contacts", { name: "Ada Lovelace", request_id: "seed-alpha-c17" }, "alpha-ro-token");
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: { code: "forbidden" } });
    expect((await request("POST", "/contacts/c17/labels", { label: "customer" }, "alpha-ro-token")).status).toBe(403);
  });

  test("hidden reads and label operations are indistinguishable from missing contacts", async () => {
    for (const suffix of ["", "/labels"]) {
      const hidden = await request("GET", "/contacts/c29" + suffix);
      const absent = await request("GET", "/contacts/absent" + suffix);
      expect(hidden.status).toBe(404);
      expect(hidden.body).toEqual(absent.body);
    }
    expect((await request("POST", "/contacts/c29/labels", { label: "x" })).status).toBe(404);
  });

  test("parallel HTTP requests preserve tenant context and idempotency", async () => {
    const payload = { name: "Parallel", request_id: "parallel" };
    const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => request("POST", "/contacts", payload, i % 2 ? "alpha-rw-token" : "beta-rw-token")));
    const alpha = responses.filter((_, i) => i % 2);
    const beta = responses.filter((_, i) => !(i % 2));
    expect(responses.every(response => response.status === 201)).toBe(true);
    expect(new Set(alpha.map(response => response.body.id)).size).toBe(1);
    expect(new Set(beta.map(response => response.body.id)).size).toBe(1);
    expect(alpha[0]!.body.id).not.toBe(beta[0]!.body.id);
    const conflict = await request("POST", "/contacts", { ...payload, name: "Changed" });
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ error: { code: "conflict" } });
  });

  test("independent processes racing on the same database create only one record", async () => {
    const worker = fileURLToPath(new URL("./concurrency-worker.ts", import.meta.url));
    const children = [0, 1].map(() => Bun.spawn([process.execPath, worker, directory], { stdout: "pipe", stderr: "pipe" }));
    try {
      const outputs = await Promise.all(children.map(async child => {
        const [output, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        expect(error).toBe("");
        expect(code).toBe(0);
        return JSON.parse(output) as { ok: boolean; value: string }[];
      }));
      expect(outputs.flat().every(result => result.ok)).toBe(true);
      expect(new Set(outputs.flat().map(result => result.value)).size).toBe(1);
      const state = openState(directory);
      try {
        expect(state.contacts.query("SELECT count(*) AS n FROM contacts").get()).toEqual({ n: 3 });
        expect(state.contacts.query("SELECT count(*) AS n FROM requests").get()).toEqual({ n: 3 });
      } finally { state.close(); }
    } finally { for (const child of children) if (child.exitCode === null) { child.kill(); await child.exited; } }
  });

  test("rejects invalid JSON, invalid fields, caller-supplied identity, and empty values", async () => {
    for (const payload of [null, [], {}, { name: "", request_id: "x" }, { name: "A", request_id: "" }, { name: 1, request_id: "x" }, { name: "A", request_id: "x", tenant: "beta" }]) {
      expect((await request("POST", "/contacts", payload)).status).toBe(400);
    }
    expect((await request("POST", "/contacts/c17/labels", { label: "" })).status).toBe(400);
    const malformed = await fetch(server.url + "/contacts", { method: "POST", headers: { authorization: "Bearer alpha-rw-token", "content-type": "application/json" }, body: "{" });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: { code: "invalid_input" } });
    const wrongType = await fetch(server.url + "/contacts", { method: "POST", headers: { authorization: "Bearer alpha-rw-token" }, body: "{}" });
    expect(wrongType.status).toBe(415);
    await wrongType.text();
    expect((await request("GET", "/contacts/%ZZ")).status).toBe(400);
  });

  test("missing routes and unsupported methods have explicit responses", async () => {
    expect((await request("GET", "/missing")).status).toBe(404);
    const method = await request("DELETE", "/contacts/c17");
    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("GET");
    expect((await request("GET", "/contacts")).status).toBe(405);
  });

  test("JSON strings round-trip exactly through HTTP and SQLite", async () => {
    const name = "  A\u0000\ud800😀  ";
    const created = await request("POST", "/contacts", { name, request_id: name });
    expect(created.status).toBe(201);
    expect((await request("GET", `/contacts/${created.body.id}`)).body.name).toBe(name);
    expect((await request("POST", `/contacts/${created.body.id}/labels`, { label: name })).status).toBe(204);
    expect((await request("GET", `/contacts/${created.body.id}/labels`)).body.labels).toEqual([name]);
  });

  test("storage failures map to 503 and an interrupted response can be retried", async () => {
    faults.contacts.afterCommit = () => { delete faults.contacts.afterCommit; throw new Error("private storage diagnostic"); };
    const payload = { name: "Lost", request_id: "lost" };
    const lost = await request("POST", "/contacts", payload);
    expect(lost.status).toBe(503);
    expect(lost.body).toEqual({ error: { code: "unavailable" } });
    const replay = await request("POST", "/contacts", payload);
    expect(replay.status).toBe(201);
    expect((await request("POST", "/contacts", payload)).body).toEqual(replay.body);
    faults.contacts.beforeRead = () => { delete faults.contacts.beforeRead; throw new Error("dependency down"); };
    expect((await request("GET", "/contacts/c17/labels")).status).toBe(503);
  });

  test("initialization cannot overwrite data, and startup requires known formats", async () => {
    await expect(initializeState(directory)).rejects.toThrow("already exists");
    expect((await request("GET", "/contacts/c17")).status).toBe(200);
    const absent = join(root, "missing");
    expect(() => startServer({ dataDir: absent, port: 0 })).toThrow("not initialized");
    expect(existsSync(absent)).toBe(false);
    await server.stop();
    const state = openState(directory);
    state.contacts.query("UPDATE schema_info SET format = 'unknown'").run();
    state.close();
    expect(() => startServer({ dataDir: directory, port: 0 })).toThrow("Unsupported contacts storage format");
  });
});
