import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeState } from "../runtime/state.ts";
import { startServer } from "../runtime/http.ts";

const root = await mkdtemp(join(tmpdir(), "crm-curl-demo-"));
let server: ReturnType<typeof startServer> | undefined;
try {
  const directory = join(root, "state");
  await initializeState(directory);
  server = startServer({ dataDir: directory, port: 0 });
  console.log(JSON.stringify({ demo_state: root, listening: server.url }));
  async function call(token: string, method: string, path: string, expectedStatus: number, payload?: unknown) {
    const args = ["curl", "--silent", "--show-error", "--max-time", "10", "--write-out", "\n%{http_code}",
      "--request", method, "--header", `Authorization: Bearer ${token}`, "--header", "Content-Type: application/json"];
    if (payload !== undefined) args.push("--data-binary", JSON.stringify(payload));
    args.push(server!.url + path);
    const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
    const [output, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    assert.equal(code, 0, error);
    const boundary = output.lastIndexOf("\n");
    assert.equal(Number(output.slice(boundary + 1)), expectedStatus, output);
    const body = output.slice(0, boundary);
    return body ? JSON.parse(body) : undefined;
  }
  const ids: string[] = [];
  for (const tenant of ["alpha", "beta"]) {
    const token = `${tenant}-rw-token`;
    const creation = { name: "Katherine Johnson", request_id: "demo-create" };
    const { id } = await call(token, "POST", "/contacts", 201, creation);
    ids.push(id);
    assert.deepEqual(await call(token, "POST", "/contacts", 201, creation), { id });
    await call(token, "POST", `/contacts/${id}/labels`, 204, { label: "customer" });
    await call(token, "POST", `/contacts/${id}/labels`, 204, { label: "customer" });
    const contact = await call(token, "GET", `/contacts/${id}`, 200);
    const labels = await call(token, "GET", `/contacts/${id}/labels`, 200);
    assert.deepEqual(contact, { id, name: creation.name });
    assert.deepEqual(labels, { labels: ["customer"] });
    await call(token, "POST", "/contacts", 409, { ...creation, name: "Changed" });
    console.log(JSON.stringify({ tenant, contact, ...labels }));
  }
  assert.notEqual(ids[0], ids[1]);
  const hidden = await call("alpha-rw-token", "GET", `/contacts/${ids[1]}`, 404);
  assert.deepEqual(hidden, await call("alpha-rw-token", "GET", "/contacts/absent", 404));
  await call("alpha-ro-token", "POST", "/contacts", 403, { name: "Denied", request_id: "readonly" });
  console.log("Demo passed: both tenants, safe retries, labels, isolation, and read-only rejection.");
} finally {
  try { await server?.stop(); }
  finally { await rm(root, { recursive: true, force: true }); }
}
