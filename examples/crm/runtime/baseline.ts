import { CONTACTS } from "../contracts/contacts/1.0.0/index.ts";
import { LABELS } from "../contracts/contact-labels/1.0.0/index.ts";
import { PROFILE, type Identity, type StorageFaults } from "../profiles/bun-inprocess/1.0.0/index.ts";
import { RELEASE as clientRelease, type ClientPorts } from "../components/client/1.0.0/index.ts";
import { contactsStore, RELEASE as contactsRelease, FORMAT as contactsFormat } from "../components/contacts-store/1.0.0/index.ts";
import { labelsStore, RELEASE as labelsRelease, FORMAT as labelsFormat } from "../components/labels/1.0.0/index.ts";
import { openState } from "./state.ts";

// Fixed baseline description, not a resolver or an accepted/locked assembly.
export const baseline = {
  profile: PROFILE,
  instances: {
    client: { release: clientRelease, requires: { contacts: CONTACTS, labels: LABELS } },
    contacts: { release: contactsRelease, provides: { api: CONTACTS }, owns: { resource: "contacts-data", format: contactsFormat } },
    labels: { release: labelsRelease, provides: { api: LABELS }, requires: { contacts: CONTACTS }, owns: { resource: "label-data", format: labelsFormat } },
  },
  bindings: [
    ["client.contacts", "contacts.api"],
    ["client.labels", "labels.api"],
    ["labels.contacts", "contacts.api"],
  ],
} as const;
export interface BaselineFaults { contacts?: StorageFaults; labels?: StorageFaults }
export function openBaseline(directory: string, faults: BaselineFaults = {}) {
  const state = openState(directory);
  try {
    const contacts = contactsStore(state.contacts, faults.contacts);
    const labels = labelsStore(state.labels, faults.labels);
    return {
      ports(identity: Identity): ClientPorts {
        const contactsPort = contacts.bind(identity);
        return { contacts: contactsPort, labels: labels.bind(identity, contactsPort) };
      },
      close: state.close,
    };
  } catch (error) {
    state.close();
    throw error;
  }
}
