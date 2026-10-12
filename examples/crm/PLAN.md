# Executable CRM reference example

Status: agreed implementation plan; no executable components or recorded passes
yet. This document plans the experiment in the [CRM walkthrough](../crm.md).
The [Draft 0.1 specification](../../SPEC.md) and its
[acceptance criteria](../../SPEC.md#10-first-experiment-and-acceptance-criteria)
remain the source of truth for required behavior.

## Goal and scope

Build a small local CRM that lets a developer replace a component, preserve its
data, branch a contract through an explicit adapter, and adopt a client update
while unchanged consumers continue to work. The demonstration must be repeatable
without AI or mutable artifact discovery.

- Use Bun, TypeScript, and SQLite, with tooling managed through mise.
- Start with a CLI client and scripted scenarios. Defer a browser UI.
- Keep the existing contacts operations (`create`, `get`) and label operations
  (`add`, `list`), including all their specified semantics.
- Use the existing alpha/beta tenant fixtures, read/write principals, read-only
  alpha principal, stable contact IDs, labels, and retained creation request IDs.
- Defer contact browsing/search, editing, deletion, and additional CRM features.
  Cross-tenant transfers, events, multi-owner transactions, and live migrations
  remain outside the experiment, as specified in the walkthrough.

## Architecture decisions

### Runtime and components

Use one Bun process and one in-process request/response interaction profile. The
runner loads explicit component bindings, supplies dependencies and trusted
principal/tenant context, and manages startup and shutdown. The profile records
invocation and value encoding, error handling, identity propagation, lifecycle,
and test execution conventions before the baseline components are implemented.
Principal and tenant identity are not caller-controlled contract arguments.

The CLI is the client component's local entry point. It has no direct storage
access. The baseline bindings are exactly those in the walkthrough:

```text
client.contacts -> contacts.api
client.labels   -> labels.api
labels.contacts -> contacts.api
```

Each state-owning component has its own SQLite database. Labels accesses contacts
only through the contacts contract and owns its label state separately. Use
Bun's built-in [SQLite driver](https://bun.sh/docs/runtime/sqlite) and
[test runner](https://bun.sh/docs/test).

The client, providers, labels extension, and adapter have separate versioned
local artifacts. Provider replacement must retain the exact unchanged consumer
artifacts and their digests; editing a consumer creates a new release. Local
artifacts exercise independent releases without requiring a package registry.

The trust model is reviewed local components. Declared permissions and dependency
access are checked by the resolver and runner; in-process boundaries do not
provide a security sandbox for untrusted code.

### Resolution and evidence

Use experimental JSON manifests, locks, and verification reports. These encodings
and the interaction profile belong to this example; they are not standardized
A3C formats. Record concrete schemas and digest serialization rules with the
baseline implementation.

- Resolve explicit bindings with exact contract releases and a shared profile.
  Check cycles, state ownership, permitted effects, and required evidence;
  reject unsupported declarations with specific diagnostics.
- Use SHA-256 digests for immutable artifact contents, covering implementations,
  contracts, suites, profiles, adapters, migrations, and their transitive
  dependencies. The lock also identifies policy, configuration references,
  fixtures, tool versions, and required checks. Keep secrets out of the lock.
- Expose a scriptable verification entry point taking a locked candidate and
  fixture references. Emit a machine-readable report identifying the lock and
  suite digests, environment, inputs, results, and unresolved obligations.
  Mandatory failures or missing required evidence prevent acceptance and produce
  a nonzero exit status.
- Rerun affected checks when artifacts, bindings, policy, or relevant
  configuration change. A structural pass alone does not establish acceptance.

### State transitions and client evolution

Keep verification separate from explicit activation. Rehearse migrations against
disposable copies after quiescing all writes and snapshotting both state owners.
Preserve tenant/ID pairs, exact names, label references, and request-ID history.
Failed pre-cutover validation leaves the original assembly and state usable.
Successful activation validates a fresh migration of the quiesced actual state
and switches ownership and bindings together before resuming writes. Recovery
after new writes must account for those writes; restoring an old snapshot alone
is insufficient.

Make the later client update a CLI display fix: escape terminal control
characters in displayed contact names while retaining exact stored names and
unchanged C1/L1 requirements. Capture the regression in tests so the hypothetical
unsafe display behavior is not exercised against a developer's terminal. Keep
the people provider, adapter, labels, and their state unchanged for this update.

## Implementation milestones

Each milestone is a separate PR targeting `main` and adds its relevant tests
immediately. The final milestone completes coverage and reproduction; it does
not defer testing of earlier work.

| Milestone | Deliverable | Required observation |
| --- | --- | --- |
| M1: Runnable baseline | Project setup, CLI client, contacts, labels, composition runner, resolver, locks, and contract suites. | An explicit locked assembly passes contract checks and a create -> label -> read flow for both tenants. |
| M2: Contacts replacement | Alternative contacts provider and offline migration from `rows-v1` to `indexed-v1`. | Client and labels remain unchanged; identities, names, tenant boundaries, label references, and retry history survive. Failed validation preserves the originals. |
| M3: Contract branch | People contract/provider, contacts adapter, and migration from `indexed-v1` to `people-v1`. | Original consumers work through the adapter; C1 passes against the actual adapted provider and C2 passes directly. |
| M4: Client update | New CLI client release with the terminal-control-character display fix. | The regression check passes while the custom provider, adapter, labels, contracts, and state remain unchanged. |
| M5: Complete demonstration | Remaining rejection cases, clean-environment instructions, retained artifacts and reports, and integration-effort comparison. | Another developer reproduces successful transitions and expected failures without AI or mutable discovery. |

## Acceptance coverage

Every milestone must satisfy the applicable requirements in the walkthrough,
including failure cases. The tracking PR checklist must account for:

- Contract behavior: tenant isolation, permission failures, stable identity,
  immediate visibility, exact string preservation, invalid inputs, safe retries,
  concurrent repeats, storage/dependency failures, and interrupted responses.
- Structural rejection: malformed or unsupported declarations, missing or
  ambiguous bindings, contract/profile mismatches, cycles, conflicting state
  owners, denied effects, and changed artifacts at pinned references. Resolution
  produces the same ordered diagnostics for the same inputs.
- Evidence and semantic rejection: missing required semantics/evidence, a
  schema-compatible provider that leaks tenant data, and a bridge over an
  eventually consistent provider that cannot satisfy immediate visibility.
- Transition safety: preserve retry records as well as contacts and labels;
  reject migrations that lose history; prove failed pre-cutover validation
  leaves the original assembly and state usable.
- Reproduction: retain manifests, locks, migrations, fixture definitions, and
  reports, recording nondeterministic inputs and relevant environment versions.
- Practical comparison: record manual edits, adapters, migrations, and unresolved
  maintenance work for replacement and upstream updates versus a source fork.

## Tracking PR lifecycle

The documentation-only draft PR containing this plan stays open during
implementation. Its description is the progress checklist and holds links to
the follow-up PRs. Mark a milestone complete only after its implementation PR is
merged and the required checks pass.

Implementation branches start from and target `main` independently of the
tracking branch. They add runnable code and its documentation without depending
on this unmerged plan. Keep this plan on the tracking branch until the experiment
is complete, then reconcile it with the delivered work and merge the tracker.

For the tracking PR itself, validate documentation links and consistency with
the specification. Do not add executable code, dependency files, databases, or
generated reports, or claim that the planned checks already pass.
