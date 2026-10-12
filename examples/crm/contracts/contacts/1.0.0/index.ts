import type { Result } from "../../../profiles/bun-inprocess/1.0.0/index.ts";
export const CONTACTS = "example.crm/contacts@1.0.0";
export interface Contact { id: string; name: string }
export interface Contacts {
  create(name: string, request_id: string): Promise<Result<string>>;
  get(id: string): Promise<Result<Contact>>;
}
