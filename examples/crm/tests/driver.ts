import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClientPorts } from "../components/client/1.0.0/index.ts";
import type { ContactSeed } from "../components/contacts-store/1.0.0/index.ts";
import type { Identity, StorageFaults } from "../profiles/bun-inprocess/1.0.0/index.ts";
import { openBaseline } from "../runtime/baseline.ts";
import { initializeState, openState } from "../runtime/state.ts";

export interface ContractDriver {
  ports(identity: Identity): ClientPorts;
  counts(): { contacts: number; requests: number; labels: number };
  fault(owner: "contacts" | "labels", point: keyof StorageFaults): void;
  seed(contact: ContactSeed): void;
  reopen(): void;
  dispose(): Promise<void>;
}
export async function rowsDriver(): Promise<ContractDriver> {
  const root = await mkdtemp(join(tmpdir(), "crm-contract-"));
  const directory = join(root, "state");
  await initializeState(directory);
  const faults = { contacts: {} as StorageFaults, labels: {} as StorageFaults };
  let assembly = openBaseline(directory, faults);
  return {
    ports: identity => assembly.ports(identity),
    counts() {
      const state = openState(directory);
      try {
        const count = (db: typeof state.contacts, table: string) => db.query<{ n: number }, []>(`SELECT count(*) AS n FROM ${table}`).get()!.n;
        return { contacts: count(state.contacts, "contacts"), requests: count(state.contacts, "requests"), labels: count(state.labels, "labels") };
      } finally { state.close(); }
    },
    fault(owner, point) {
      faults[owner][point] = () => { delete faults[owner][point]; throw new Error("injected storage failure"); };
    },
    seed(contact) {
      const state = openState(directory);
      try {
        state.contacts.transaction(() => {
          state.contacts.query("INSERT INTO contacts VALUES (?, ?, ?)").run(contact.tenant, contact.id, JSON.stringify(contact.name));
          state.contacts.query("INSERT INTO requests VALUES (?, ?, ?, ?)").run(contact.tenant, JSON.stringify(contact.request_id), JSON.stringify(contact.name), contact.id);
        }).immediate();
      } finally { state.close(); }
    },
    reopen() { assembly.close(); assembly = openBaseline(directory, faults); },
    async dispose() { assembly.close(); await rm(root, { recursive: true, force: true }); },
  };
}
