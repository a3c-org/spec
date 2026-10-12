import type { Identity, Permission } from "../profiles/bun-inprocess/1.0.0/index.ts";
const all: readonly Permission[] = ["contacts.read", "contacts.write", "labels.read", "labels.write"];
const reader: readonly Permission[] = ["contacts.read", "labels.read"];
function identity(principal: string, tenant: string, permissions: readonly Permission[]): Identity {
  return Object.freeze({ principal, tenant, permissions: Object.freeze([...permissions]) });
}
export const identities = Object.freeze({
  "alpha-rw": identity("alpha-rw", "alpha", all),
  "beta-rw": identity("beta-rw", "beta", all),
  "alpha-ro": identity("alpha-ro", "alpha", reader),
});
export const tokens = new Map<string, Identity>([
  ["alpha-rw-token", identities["alpha-rw"]],
  ["beta-rw-token", identities["beta-rw"]],
  ["alpha-ro-token", identities["alpha-ro"]],
]);
export const contactSeeds = [
  { tenant: "alpha", id: "c17", name: "Ada Lovelace", request_id: "seed-alpha-c17" },
  { tenant: "beta", id: "c29", name: "Grace Hopper", request_id: "seed-beta-c29" },
] as const;
export const labelSeeds = [
  { tenant: "alpha", contact_id: "c17", label: "customer" },
  { tenant: "beta", contact_id: "c29", label: "partner" },
] as const;
