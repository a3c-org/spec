import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("curl demo uses real HTTP and removes its disposable state", async () => {
  const script = fileURLToPath(new URL("../scripts/demo.ts", import.meta.url));
  const child = Bun.spawn([process.execPath, script], { stdout: "pipe", stderr: "pipe" });
  const [output, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(error).toBe("");
  expect(code).toBe(0);
  expect(output).toContain("Demo passed:");
  const first = JSON.parse(output.split("\n")[0]!);
  expect(existsSync(first.demo_state)).toBe(false);
}, 15_000);
