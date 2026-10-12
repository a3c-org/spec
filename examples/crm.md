# Worked example: independently evolving CRM capabilities

This example applies [Draft 0.1](../SPEC.md) to a small CRM. It is a proposed
acceptance fixture with a [runnable REST baseline slice](crm/README.md). The
complete locked assembly, replacement, adaptation, and update scenarios remain
work to implement; this walkthrough does not claim those checks already pass.

The developer wants a custom contacts implementation and a contact-label feature,
then wants to change the contacts API while continuing to accept client updates.
The original CRM maintainer does not need to merge either customization.

## 1. Contracts and fixtures

These aliases refer to exact releases. Their artifacts, suites, and the selected
interaction profile will also need content digests in an executable lock.
`example.*` names are illustrative namespaces, not registry locations.

| Alias | Contract release | Observable behavior |
| --- | --- | --- |
| C1 | `example.crm/contacts@1.0.0` | `create(name, request_id) -> id`; `get(id) -> {id, name}`. |
| L1 | `example.community/contact-labels@1.0.0` | `add(contact_id, label)`; `list(contact_id) -> labels`. |
| C2 | `example.community/people@1.0.0` | `register(display_name, request_id) -> key`; `fetch(key) -> {key, display_name}`. A branch of C1. |

The interaction profile supplies an authenticated principal and tenant context;
these values are not caller-controlled method parameters. C1 declares:

| Requirement | Rule | Required fixture check |
| --- | --- | --- |
| `contacts.isolation` | Read and write access is limited to the authenticated tenant. A caller must have the relevant permission. | Cross-tenant lookup has the same `not_found` result as an absent ID; denied writes change no state. |
| `contacts.identity` | A contact's ID remains stable within its tenant. The logical reference is `(tenant, id)`. | Get after create and get after migration identify the same record. |
| `contacts.visibility` | A successful create is immediately observable through get. | Create then read using the returned ID. |
| `contacts.retry` | Within a tenant, the same request ID and name returns the original ID without creating a second record; a changed name with the same request ID returns `conflict`. | Repeat creation, check count and ID, then repeat with a changed payload. Authorization is checked on every attempt. |
| `contacts.errors` | Missing or unauthorized reads return `not_found`; invalid names return `invalid_input`; denied creates return `forbidden`. Names must be nonempty strings and are preserved exactly. | Exercise each error and assert no mutation on failure. |

The contract retains creation request IDs for the lifetime of the fixture
application. A production contract would need to specify a bounded retention
policy or accept that storage cost. Concurrent repeats of a request must have
the same result as sequential repeats, including a single committed creation.
Storage failures return `unavailable`; retrying with the same request ID must
recover the committed result if a write completed before the response was lost.
The suite must exercise these cases as well as the happy path.

L1 treats labels as sets of nonempty, case-sensitive strings, returns them in
lexical order, and checks contact visibility through C1 before each operation.
It applies the same trusted context and read/write authorization rules. Invalid
labels return `invalid_input`, denied writes return `forbidden`, and missing or
hidden contacts return `not_found`. Repeated additions are idempotent; successful
additions are immediately visible. Dependency or storage failure returns
`unavailable` without reporting false success; a retry is safe even if the label
was committed before a response was lost. Label state is owned by the label
component, keyed by `(tenant, contact_id)`.

The fixture contract set has no contact deletion, cross-tenant transfers, events,
or transactions spanning contacts and labels. These are explicit scope limits;
adding them would require new semantics and tests. Interactions use
request/response operations, with atomic writes within each state owner.

Initial fixture data includes:

- Tenant `alpha`, contact `c17`, name `Ada Lovelace`, label `customer`.
- Tenant `beta`, contact `c29`, name `Grace Hopper`, label `partner`.
- Authorized read/write principals for each tenant and a read-only alpha principal.
- Retained request IDs for the initial creations, plus an unused request ID.

Contract suites must include tenant-isolation failures, concurrent retries,
interrupted responses, and migration preservation of retry records. Preserving
contacts while losing idempotency history is an invalid migration.

## 2. Baseline assembly

The baseline contains these exact component releases:

| Instance | Component release | Provides | Requires | Owned state |
| --- | --- | --- | --- | --- |
| `client` | `example.crm/client@1.0.0` | Local application entry point | `contacts: C1`, `labels: L1` | None |
| `contacts` | `example.crm/contacts-store@1.0.0` | `api: C1` | None | `contacts-data`, format `rows-v1` |
| `labels` | `example.community/labels@1.0.0` | `api: L1` | `contacts: C1` | `label-data`, format `label-sets-v1` |

The client is the assembly's root component. Its local entry point is supplied
by the experiment's runner; it is not a new interoperable UI contract.
All ports use the same pinned interaction profile. The complete bindings are:

```text
client.contacts -> contacts.api    (C1)
client.labels   -> labels.api      (L1)
labels.contacts -> contacts.api    (C1)
```

The dependency graph is acyclic. Labels accesses contacts through C1 and never
reads the contacts database. Each owner's grants permit its own storage and its
declared dependency calls only. The client has no direct storage access.

Create the baseline lock and run the C1 and L1 suites plus a client integration
flow: create a contact, add a label, and display the contact with its labels.
Run the same flow for both tenants and assert that neither sees the other's
records. These are expected checks for the future experiment, not recorded passes.

## 3. Replace contacts without changing consumers

Publish `example.custom/indexed-contacts@1.0.0`, which provides `api: C1` and
owns contacts in an `indexed-v1` format. It indexes records by tenant and ID;
the public operations and behavioral guarantees remain C1.

Change only the `contacts` instance's component reference and its storage-format
assignment. The three bindings above and both consumer releases remain unchanged.
The candidate must pass C1 against the new provider and the integration checks
with the unchanged label component and client.

This is a stateful replacement. A separately pinned migration from `rows-v1` to
`indexed-v1` must preserve names, tenant/ID pairs, and request-ID history. It must
also verify that every label reference still resolves to the same visible contact.
The label component continues to own `label-data`; its bytes need no conversion.

For the offline rehearsal:

1. Quiesce the application so all writes, including label writes, have finished;
   snapshot both state resources to obtain one consistent fixture baseline.
2. Transform a copy of contacts state, leaving the old data untouched.
3. Check record counts, field equality, stable IDs, retry behavior, and tenant
   isolation; run the candidate assembly against isolated copies of both resources.
4. Inject a migration validation failure and confirm that the original assembly
   can resume from the unchanged originals.
5. On a successful rehearsal, the activation procedure migrates a fresh copy of
   the quiesced actual state and checks preservation against its source snapshot.
   Mutating test flows run on disposable copies. It switches ownership and
   bindings to the validated migration output together before resuming writes.

A rehearsal against a disposable fixture does not authorize live activation.
After cutover, recovery must account for any new writes as specified in the
[state rules](../SPEC.md#7-state-ownership-and-replacement).

## 4. Branch the contract and bridge it explicitly

The custom developer now publishes C2 with `display_name` and `key` in place of
C1's `name` and `id`. C2 retains C1's tenant isolation, stable identity, immediate
visibility, idempotency, error behavior, and exact string preservation, with a
requirement mapping in its contract artifact. Its ancestry is informational;
existing C1 consumers cannot bind directly to it.

Publish two new components:

| Instance | Component release | Provides | Requires | Owned state |
| --- | --- | --- | --- | --- |
| `people` | `example.custom/people-store@1.0.0` | `api: C2` | None | `contacts-data`, format `people-v1` |
| `bridge` | `example.community/contacts-bridge@1.0.0` | `legacy: C1` | `people: C2` | None |

The bridge maps create to register, get to fetch, ID to key, and name to
display name. It forwards the trusted identity context, request IDs, and errors
unchanged. It does not split names, normalize strings, cache data, or retry with
new request IDs. This deliberately narrow mapping has no intended information loss.

Remove the old `contacts` instance, add `people` and `bridge`, and use these
complete bindings:

```text
client.contacts -> bridge.legacy   (C1)
client.labels   -> labels.api      (L1)
labels.contacts -> bridge.legacy   (C1)
bridge.people   -> people.api      (C2)
```

The client and label releases remain unchanged. C1 and C2 are both present as
separate contract dependencies. The bridge is verified as a C1 provider against
the actual C2 provider; neither the ancestry claim nor the field mapping alone
is sufficient. The C2 suite also runs directly against `people`.

A migration from `indexed-v1` to `people-v1` preserves tenant/ID values and request
history while transforming field representation. C2 declares IDs opaque and
permits these imported keys. For existing request IDs, retry comparison must
still recognize the equivalent request after translating its field names.
Rehearse this transition using the same pre-cutover and recovery rules as before.
The lock replaces the old provider and records both new components, their
contracts, the migration, and the changed graph.

## 5. Adopt an upstream update while keeping the changes

Assume the original CRM publisher releases `example.crm/client@1.0.1` with a
security fix to its HTTP handling and unchanged C1/L1 requirements. This is a
hypothetical fixture release, not a claim about a real product vulnerability.

Replace `client@1.0.0` with `client@1.0.1` in the assembly from section 4. Retain
`people`, `bridge`, `labels`, their contracts, and their state. Produce a new
lock and verification report, including the client regression check for the fix.
No source merge is required; the custom contract and extension remain in use.

If the update instead requires a different contact contract, the existing
binding must fail until the assembly selects an accepted provider, verifies a
new adapter, or adopts a newly verified consumer. A3C does not promise that all
updates are compatible, or that a client fix patches custom provider code.

## 6. Reject assemblies that look plausible but cannot work

| Candidate | Expected stage and result |
| --- | --- |
| Add a second C1 provider without identifying the target of `client.contacts`. | Resolution: ambiguous binding; name the port and candidate targets. |
| Bind `client.contacts` directly to `people.api`. | Resolution: C1/C2 mismatch; no automatic ancestry conversion. |
| Use matching C1 declarations with incompatible interaction profiles. | Resolution: profile mismatch. |
| Add a provider dependency on a port that leads back to itself. | Resolution: cycle; report the dependency path. |
| Keep both old and new providers owning `contacts-data`. | Resolution: conflicting owners. |
| Give labels direct access to contacts storage outside its allowed effects. | Resolution: denied access under the assembly policy. |
| Declare a provider's visibility semantics unknown while C1 requires immediate reads. | Acceptance blocked by missing required semantics/evidence. |
| Claim C1 but return another tenant's record for `c29`. | Verification: `contacts.isolation` fails despite matching schemas. |
| Claim C1 but lose request history during migration. | Transition verification: retry creates a duplicate; no cutover. |
| Implement C2 with eventual reads while the bridge still claims C1. | Verification: `contacts.visibility` fails; renaming fields cannot repair the guarantee. |
| Change an artifact without changing its pinned reference. | Resolution: digest mismatch; do not reuse prior results. |

The final demonstration must retain its manifests, locks, migration artifacts,
fixture definitions, and reports so another developer can repeat both the
successful assembly and the rejection cases without an AI model. Record how
much integration work each step actually required; the experiment should test
whether these boundaries make independent evolution practical.
