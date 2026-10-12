import type { Database } from "bun:sqlite";
import type { Contacts } from "../../../contracts/contacts/1.0.0/index.ts";
import { fail, nonempty, ok, type Identity, type Result, type StorageFaults } from "../../../profiles/bun-inprocess/1.0.0/index.ts";

export const RELEASE = "example.crm/contacts-store@1.0.0";
export const FORMAT = "rows-v1";
export interface ContactSeed { tenant: string; id: string; name: string; request_id: string }

export function initializeContacts(db: Database, seeds: readonly ContactSeed[]) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE schema_info (id INTEGER PRIMARY KEY CHECK (id = 1), format TEXT NOT NULL);
      CREATE TABLE contacts (
        tenant TEXT NOT NULL, id TEXT NOT NULL, name_json TEXT NOT NULL,
        PRIMARY KEY (tenant, id)
      );
      CREATE TABLE requests (
        tenant TEXT NOT NULL, request_json TEXT NOT NULL, name_json TEXT NOT NULL, contact_id TEXT NOT NULL,
        PRIMARY KEY (tenant, request_json),
        FOREIGN KEY (tenant, contact_id) REFERENCES contacts(tenant, id)
      );
    `);
    db.query("INSERT INTO schema_info VALUES (1, ?)").run(FORMAT);
    for (const seed of seeds) {
      db.query("INSERT INTO contacts VALUES (?, ?, ?)").run(seed.tenant, seed.id, JSON.stringify(seed.name));
      db.query("INSERT INTO requests VALUES (?, ?, ?, ?)").run(seed.tenant, JSON.stringify(seed.request_id), JSON.stringify(seed.name), seed.id);
    }
  }).immediate();
}

export function contactsStore(db: Database, faults: StorageFaults = {}) {
  const metadata = db.query<{ format: string }, []>("SELECT format FROM schema_info WHERE id = 1").get();
  if (metadata?.format !== FORMAT) throw new Error("Unsupported contacts storage format");
  const read = db.query<{ id: string; name_json: string }, [string, string]>("SELECT id, name_json FROM contacts WHERE tenant = ? AND id = ?");
  const retry = db.query<{ contact_id: string; name_json: string }, [string, string]>("SELECT contact_id, name_json FROM requests WHERE tenant = ? AND request_json = ?");
  const insertContact = db.query("INSERT INTO contacts VALUES (?, ?, ?)");
  const insertRequest = db.query("INSERT INTO requests VALUES (?, ?, ?, ?)");

  return {
    bind(identity: Identity): Contacts {
      return {
        async create(name, request_id) {
          if (!identity.permissions.includes("contacts.write")) return fail("forbidden");
          if (!nonempty(name) || !nonempty(request_id)) return fail("invalid_input");
          try {
            const result = db.transaction((): Result<string> => {
              const encodedName = JSON.stringify(name);
              const encodedRequest = JSON.stringify(request_id);
              const previous = retry.get(identity.tenant, encodedRequest);
              if (previous) return previous.name_json === encodedName ? ok(previous.contact_id) : fail("conflict");
              const id = crypto.randomUUID();
              insertContact.run(identity.tenant, id, encodedName);
              insertRequest.run(identity.tenant, encodedRequest, encodedName, id);
              faults.beforeCommit?.();
              return ok(id);
            }).immediate();
            if (result.ok) faults.afterCommit?.();
            return result;
          } catch {
            return fail("unavailable");
          }
        },
        async get(id) {
          if (!identity.permissions.includes("contacts.read")) return fail("not_found");
          if (typeof id !== "string") return fail("invalid_input");
          try {
            faults.beforeRead?.();
            const row = read.get(identity.tenant, id);
            return row ? ok({ id: row.id, name: JSON.parse(row.name_json) as string }) : fail("not_found");
          } catch {
            return fail("unavailable");
          }
        },
      };
    },
  };
}
