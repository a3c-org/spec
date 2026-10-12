import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeContacts } from "../components/contacts-store/1.0.0/index.ts";
import { initializeLabels } from "../components/labels/1.0.0/index.ts";
import { contactSeeds, labelSeeds } from "./fixtures.ts";

export const defaultDataDir = fileURLToPath(new URL("../.local/crm", import.meta.url));
export function openDatabase(path: string, create = false) {
  const db = new Database(path, { strict: true, create, readwrite: true });
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return db;
}
export async function initializeState(directory: string) {
  const target = resolve(directory);
  if (existsSync(target)) throw new Error("State already exists; choose a new CRM_DATA_DIR");
  await mkdir(dirname(target), { recursive: true });
  const staging = await mkdtemp(join(dirname(target), ".crm-init-"));
  try {
    const contacts = openDatabase(join(staging, "contacts.sqlite"), true);
    try { initializeContacts(contacts, contactSeeds); } finally { contacts.close(); }
    const labels = openDatabase(join(staging, "labels.sqlite"), true);
    try { initializeLabels(labels, labelSeeds); } finally { labels.close(); }
    // Publish both initialized resources together; ordinary startup never creates them.
    if (existsSync(target)) throw new Error("State already exists; choose a new CRM_DATA_DIR");
    await rename(staging, target);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
export function openState(directory: string) {
  for (const name of ["contacts.sqlite", "labels.sqlite"]) {
    if (!existsSync(join(directory, name))) throw new Error("State is not initialized; run mise run crm:init");
  }
  const contacts = openDatabase(join(directory, "contacts.sqlite"));
  try {
    const labels = openDatabase(join(directory, "labels.sqlite"));
    return { contacts, labels, close() { labels.close(); contacts.close(); } };
  } catch (error) {
    contacts.close();
    throw error;
  }
}
