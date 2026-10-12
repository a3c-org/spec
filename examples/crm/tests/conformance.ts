import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ContractDriver } from "./driver.ts";
import { identities } from "../runtime/fixtures.ts";
import type { Result } from "../profiles/bun-inprocess/1.0.0/index.ts";
export function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`Expected success, got ${result.error}`);
  return result.value;
}

// Suites use operations and logical fixture-driver methods, never provider SQL.
export function contactSuite(makeDriver: () => Promise<ContractDriver>) {
  describe("C1 contacts", () => {
    let driver: ContractDriver;
    beforeEach(async () => { driver = await makeDriver(); });
    afterEach(async () => { await driver.dispose(); });
    const alpha = () => driver.ports(identities["alpha-rw"]).contacts;

    test("seed identities, tenant isolation, and hidden reads", async () => {
      expect(value(await alpha().get("c17"))).toEqual({ id: "c17", name: "Ada Lovelace" });
      expect(await alpha().get("c29")).toEqual({ ok: false, error: "not_found" });
      expect(await alpha().get("absent")).toEqual(await alpha().get("c29"));
      const denied = driver.ports({ principal: "denied", tenant: "alpha", permissions: [] }).contacts;
      expect(await denied.get("c17")).toEqual(await alpha().get("absent"));
      expect(value(await driver.ports(identities["beta-rw"]).contacts.get("c29")).name).toBe("Grace Hopper");
    });

    test("create is immediately visible and survives reopening", async () => {
      const id = value(await alpha().create("New contact", "new"));
      expect(value(await alpha().get(id))).toEqual({ id, name: "New contact" });
      driver.reopen();
      expect(value(await alpha().get(id))).toEqual({ id, name: "New contact" });
      expect(value(await alpha().create("New contact", "new"))).toBe(id);
    });

    test("retained seed requests and conflicting retries", async () => {
      const before = driver.counts();
      expect(value(await alpha().create("Ada Lovelace", "seed-alpha-c17"))).toBe("c17");
      expect(await alpha().create("Changed", "seed-alpha-c17")).toEqual({ ok: false, error: "conflict" });
      expect(driver.counts()).toEqual(before);
    });

    test("concurrent calls have one committed creation and tenant-local request keys", async () => {
      const before = driver.counts();
      const results = await Promise.all(Array.from({ length: 10 }, () => alpha().create("A", "same")));
      expect(new Set(results.map(value)).size).toBe(1);
      const other = value(await driver.ports(identities["beta-rw"]).contacts.create("B", "same"));
      expect(other).not.toBe(value(results[0]!));
      expect(driver.counts()).toEqual({ ...before, contacts: before.contacts + 2, requests: before.requests + 2 });
    });

    test("authorization is checked on every write, even a previously successful retry", async () => {
      const reader = driver.ports(identities["alpha-ro"]).contacts;
      const before = driver.counts();
      expect(await reader.create("Ada Lovelace", "seed-alpha-c17")).toEqual({ ok: false, error: "forbidden" });
      expect(await reader.create("New", "new")).toEqual({ ok: false, error: "forbidden" });
      expect(driver.counts()).toEqual(before);
    });

    test("invalid names and request IDs cannot mutate state", async () => {
      const before = driver.counts();
      for (const invalid of ["", null, 12]) {
        expect(await alpha().create(invalid as string, "id")).toEqual({ ok: false, error: "invalid_input" });
        expect(await alpha().create("Valid", invalid as string)).toEqual({ ok: false, error: "invalid_input" });
      }
      expect(driver.counts()).toEqual(before);
    });

    test("names and request IDs preserve exact JavaScript strings", async () => {
      for (const name of [" ", "  Ada  ", "É😀", "A\u0000B", "A\ud800B", "A\u001b[2J", "e\u0301", "é"]) {
        const id = value(await alpha().create(name, name));
        expect(value(await alpha().get(id)).name).toBe(name);
        expect(value(await alpha().create(name, name))).toBe(id);
      }
    });

    test("before-commit failure rolls back both records", async () => {
      const before = driver.counts();
      driver.fault("contacts", "beforeCommit");
      expect(await alpha().create("A", "fail")).toEqual({ ok: false, error: "unavailable" });
      expect(driver.counts()).toEqual(before);
      const id = value(await alpha().create("A", "fail"));
      expect(value(await alpha().get(id)).name).toBe("A");
    });

    test("lost response recovers the committed result after reopening", async () => {
      const before = driver.counts();
      driver.fault("contacts", "afterCommit");
      expect(await alpha().create("A", "lost")).toEqual({ ok: false, error: "unavailable" });
      driver.reopen();
      const id = value(await alpha().create("A", "lost"));
      expect(value(await alpha().create("A", "lost"))).toBe(id);
      expect(driver.counts()).toEqual({ ...before, contacts: before.contacts + 1, requests: before.requests + 1 });
    });

    test("storage read failures are unavailable", async () => {
      driver.fault("contacts", "beforeRead");
      expect(await alpha().get("c17")).toEqual({ ok: false, error: "unavailable" });
    });
  });
}

export function labelSuite(makeDriver: () => Promise<ContractDriver>) {
  describe("L1 labels", () => {
    let driver: ContractDriver;
    beforeEach(async () => { driver = await makeDriver(); });
    afterEach(async () => { await driver.dispose(); });
    const alpha = () => driver.ports(identities["alpha-rw"]).labels;

    test("sets preserve strings, sort lexically, and survive reopening", async () => {
      for (const label of ["Z", "a", "A", "é", "😀", "\ue000", " a ", "a"]) value(await alpha().add("c17", label));
      expect(value(await alpha().list("c17"))).toEqual([" a ", "A", "Z", "a", "customer", "é", "😀", "\ue000"]);
      driver.reopen();
      expect(value(await alpha().list("c17"))).toHaveLength(8);
      value(await alpha().add("c17", "\ud800\u0000"));
      expect(value(await alpha().list("c17"))).toContain("\ud800\u0000");
    });

    test("same contact ID in two tenants keeps labels isolated", async () => {
      driver.seed({ tenant: "beta", id: "c17", name: "Another contact", request_id: "shared" });
      const beta = driver.ports(identities["beta-rw"]).labels;
      value(await beta.add("c17", "beta-only"));
      expect(value(await beta.list("c17"))).toEqual(["beta-only"]);
      expect(value(await alpha().list("c17"))).toEqual(["customer"]);
    });

    test("missing and hidden contacts return not_found without mutations", async () => {
      const before = driver.counts();
      for (const id of ["c29", "absent"]) {
        expect(await alpha().add(id, "x")).toEqual({ ok: false, error: "not_found" });
        expect(await alpha().list(id)).toEqual({ ok: false, error: "not_found" });
      }
      expect(driver.counts()).toEqual(before);
    });

    test("read-only identity can list but cannot add or retry an addition", async () => {
      const reader = driver.ports(identities["alpha-ro"]).labels;
      const before = driver.counts();
      expect(value(await reader.list("c17"))).toEqual(["customer"]);
      expect(await reader.add("c17", "customer")).toEqual({ ok: false, error: "forbidden" });
      expect(await reader.add("c17", "new")).toEqual({ ok: false, error: "forbidden" });
      expect(driver.counts()).toEqual(before);
      const denied = driver.ports({ principal: "denied", tenant: "alpha", permissions: ["contacts.read"] }).labels;
      expect(await denied.list("c17")).toEqual({ ok: false, error: "not_found" });
    });

    test("invalid labels cannot mutate state", async () => {
      const before = driver.counts();
      for (const label of ["", null, 12]) expect(await alpha().add("c17", label as string)).toEqual({ ok: false, error: "invalid_input" });
      expect(driver.counts()).toEqual(before);
    });

    test("checks contact visibility before every operation, including repeated additions", async () => {
      const before = driver.counts();
      driver.fault("contacts", "beforeRead");
      expect(await alpha().add("c17", "customer")).toEqual({ ok: false, error: "unavailable" });
      driver.fault("contacts", "beforeRead");
      expect(await alpha().list("c17")).toEqual({ ok: false, error: "unavailable" });
      expect(driver.counts()).toEqual(before);
      const withoutContactRead = driver.ports({ principal: "labels-only", tenant: "alpha", permissions: ["labels.read", "labels.write"] }).labels;
      expect(await withoutContactRead.add("c17", "x")).toEqual({ ok: false, error: "not_found" });
      expect(await withoutContactRead.list("c17")).toEqual({ ok: false, error: "not_found" });
    });

    test("storage failures before commit roll back; lost responses can be retried", async () => {
      const before = driver.counts();
      driver.fault("labels", "beforeCommit");
      expect(await alpha().add("c17", "new")).toEqual({ ok: false, error: "unavailable" });
      expect(driver.counts()).toEqual(before);
      driver.fault("labels", "afterCommit");
      expect(await alpha().add("c17", "new")).toEqual({ ok: false, error: "unavailable" });
      driver.reopen();
      value(await alpha().add("c17", "new"));
      expect(value(await alpha().list("c17"))).toEqual(["customer", "new"]);
      expect(driver.counts()).toEqual({ ...before, labels: before.labels + 1 });
      driver.fault("labels", "beforeRead");
      expect(await alpha().list("c17")).toEqual({ ok: false, error: "unavailable" });
    });
  });
}
