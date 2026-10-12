import type { Result } from "../../../profiles/bun-inprocess/1.0.0/index.ts";
export const LABELS = "example.community/contact-labels@1.0.0";
export interface Labels {
  add(contact_id: string, label: string): Promise<Result<void>>;
  list(contact_id: string): Promise<Result<string[]>>;
}
