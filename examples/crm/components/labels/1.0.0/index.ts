import type { Database } from "bun:sqlite";
import type { Contacts } from "../../../contracts/contacts/1.0.0/index.ts";
import type { Labels } from "../../../contracts/contact-labels/1.0.0/index.ts";
import { fail, nonempty, ok, type Identity, type StorageFaults } from "../../../profiles/bun-inprocess/1.0.0/index.ts";

export const RELEASE = "example.community/labels@1.0.0";
export const FORMAT = "label-sets-v1";
export interface LabelSeed { tenant: string; contact_id: string; label: string }

export function initializeLabels(db: Database, seeds: readonly LabelSeed[]) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE schema_info (id INTEGER PRIMARY KEY CHECK (id = 1), format TEXT NOT NULL);
      CREATE TABLE labels (
        tenant TEXT NOT NULL, contact_id TEXT NOT NULL, label_json TEXT NOT NULL,
        PRIMARY KEY (tenant, contact_id, label_json)
      );
    `);
    db.query("INSERT INTO schema_info VALUES (1, ?)").run(FORMAT);
    for (const seed of seeds) db.query("INSERT INTO labels VALUES (?, ?, ?)").run(seed.tenant, seed.contact_id, JSON.stringify(seed.label));
  }).immediate();
}

export function labelsStore(db: Database, faults: StorageFaults = {}) {
  const metadata = db.query<{ format: string }, []>("SELECT format FROM schema_info WHERE id = 1").get();
  if (metadata?.format !== FORMAT) throw new Error("Unsupported labels storage format");
  const insert = db.query("INSERT OR IGNORE INTO labels VALUES (?, ?, ?)");
  const read = db.query<{ label_json: string }, [string, string]>("SELECT label_json FROM labels WHERE tenant = ? AND contact_id = ?");
  return {
    bind(identity: Identity, contacts: Contacts): Labels {
      return {
        async add(contact_id, label) {
          if (!identity.permissions.includes("labels.write")) return fail("forbidden");
          try {
            const visible = await contacts.get(contact_id);
            if (!visible.ok) return visible;
            if (!nonempty(label)) return fail("invalid_input");
            db.transaction(() => {
              insert.run(identity.tenant, contact_id, JSON.stringify(label));
              faults.beforeCommit?.();
            }).immediate();
            faults.afterCommit?.();
            return ok(undefined);
          } catch {
            return fail("unavailable");
          }
        },
        async list(contact_id) {
          if (!identity.permissions.includes("labels.read")) return fail("not_found");
          try {
            const visible = await contacts.get(contact_id);
            if (!visible.ok) return visible;
            faults.beforeRead?.();
            return ok(read.all(identity.tenant, contact_id).map(row => JSON.parse(row.label_json) as string).sort());
          } catch {
            return fail("unavailable");
          }
        },
      };
    },
  };
}
