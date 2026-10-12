# A3C application contracts and composition

Status: Draft 0.1 · October 12, 2026

A3C proposes common rules for describing, composing, evolving, and verifying
application capabilities. An application is an explicit assembly of independent
implementations. Contracts describe the behavior that lets those implementations
work together; they can also evolve or branch independently.

The initial goal is concrete: replace one capability, retain an independently
published extension, and adopt an update to another component without merging
their source trees. A successful assembly must also preserve the application's
data and required behavior. The [CRM example](examples/crm.md) makes this goal
testable.

This draft defines a conceptual model and a first experiment. **MUST**, **SHOULD**,
and **MAY** express requirements within this proposal, not a claim that an
interoperable standard or implementation already exists. Field names in examples
are explanatory notation; their serialization is not standardized here.

## 1. Scope and principles

A3C standardizes the description and composition of contracts, not a universal
set of application APIs. Contract authors choose their domain behavior. Assembly
authors choose which contracts and implementations to accept.

The following principles govern the model:

- **Independent evolution.** Implementations, contracts, adapters, and extensions
  can be published without approval from another project's maintainers.
- **Explicit composition.** Dependency bindings, overrides, state ownership, and
  required guarantees must be visible in the assembly.
- **Behavior matters.** Matching request and response shapes is insufficient
  evidence of compatible authorization, effects, consistency, or invariants.
- **Deterministic validation.** A locked assembly must be resolvable without AI,
  mutable discovery results, or undocumented choices.
- **Honest limits.** Some combinations cannot satisfy their requirements. The
  system must report a conflict or missing evidence instead of silently weakening
  guarantees.

This draft does not define a hosting platform, central registry, programming
language, package manager, universal UI framework, or automatic decomposition
of an existing monolith. Distribution rights remain those of each artifact.
Existing applications need explicit boundaries before their parts are replaceable.

## 2. Roles and units

| Term | Meaning |
| --- | --- |
| Contract | A separately versioned description of an observable capability and its verification obligations. |
| Capability | A named service or behavior available through a contract, such as managing contacts. |
| Component | A distributable implementation that declares provided and required ports, effects, and any owned state. |
| Port | A component-local name for a provided or required contract endpoint. |
| Assembly | Selected component instances, explicit bindings between their ports, configuration, state assignments, and acceptance policy. |
| Adapter | An ordinary component that provides one contract by consuming another, with explicit semantic mappings. |
| Guardian | A publisher maintaining a contract lineage, its stated guarantees, and conformance suite. |
| Composer | A person or tool proposing an assembly and any integration artifacts. AI is optional. |

A component is the smallest unit replaced in this draft. It may expose several
capabilities, but those capabilities share that component's release and lifecycle.
Independently replacing one of them requires extracting a separate component or
interposing an explicit adapter. A capability is therefore a logical boundary;
it does not imply a process, container, repository, or service boundary.

A guardian controls its own published lineage. It cannot prevent another party
from publishing a new contract or a branch under another identity. Assemblies
select guardians and artifacts explicitly; there is no mandatory global authority.

## 3. Contract contents

A contract release MUST contain, or reference immutable artifacts containing:

| Element | Required description |
| --- | --- |
| Identity | Namespaced identifier, immutable release identifier, publisher, and any parent lineage references. |
| Interface | Operations and/or events, types, errors, and supported interaction profiles. |
| Semantics | Preconditions, postconditions, effects, and stable identifiers for behavioral requirements. |
| Security context | Principal and tenant interpretation, authorization decisions, and required isolation. |
| Operational behavior | Retry and idempotency rules, ordering, consistency, transaction boundaries, and failure behavior where relevant. |
| State boundary | Logical resources and identifiers visible to consumers, including lifecycle and deletion semantics. |
| Verification | Versioned conformance suite, fixtures, and a mapping from requirement IDs to checks or explicit evidence obligations. |

An inapplicable concern MUST be marked as such with a reason. An unspecified
concern is unknown, not permission to assume any convenient behavior. For an
assembly-required guarantee, missing semantics or evidence blocks acceptance.

For example, a contact lookup contract could require that unauthorized and absent
records produce the same external error, and that lookups immediately after a
successful create observe the new contact. Both requirements affect whether an
adapter or implementation is acceptable even if their schemas match.

Tests are evidence for specified cases, not proof of semantic equivalence. A
contract must distinguish executable checks from guarantees needing other
review or operational evidence. Human approval can record that evidence; it
cannot turn a failed mandatory assertion into a pass.

## 4. Component declarations and interaction profiles

A component release MUST declare:

- Named provided ports and the exact contract releases they implement.
- Named required ports and the exact contract releases each accepts.
- Any optional required ports, their defaults, and behavior when unbound.
- Configuration schema, effects, and required access to external resources.
- Owned state, storage-format identity, and available migration paths.
- Implementation artifact references and supported interaction profiles.

Requirements refer to contracts, not preferred implementation names. An assembly
may impose a particular implementation as its own policy.

A contract describes behavior; an interaction profile defines how components
invoke it. A profile must cover encoding, dispatch, errors, identity propagation,
startup and shutdown, and test execution. Two ports require both a compatible
contract and a shared profile, or an explicit adapter between profiles. This
prevents an HTTP provider and an in-process caller from appearing connectable
solely because they name the same contract.

The model permits different profiles. The first experiment will use only one,
chosen before implementation. Cross-process discovery, event transport, and UI
composition remain outside that experiment.

## 5. Identity, versions, and provenance

Every contract and component has a stable namespaced identifier. Names are
opaque to the resolver; a package registry or a particular guardian is not needed
to assign them. The chosen distribution mechanism must establish publisher
provenance and prevent namespace impersonation.

A release reference identifies exact immutable content. The lock records a
content digest for each contract, component, suite, profile, adapter, and migration
artifact, including transitive dependencies. A changed release at an existing
reference is an integrity error. Version labels express publisher intent; labels
and version ranges alone MUST NOT establish compatibility.

For the first experiment, a required port lists exact accepted contract releases.
A provider is eligible only for a release it explicitly declares and verifies.
There is no inference from a parent contract, a newer version number, similar
schemas, or a claimed extension relationship. Broader compatibility negotiation
is deferred until these rules have been demonstrated.

A contract can evolve in three ways:

1. Publish another release in the same lineage, with its own obligations and
   change description.
2. Publish an extension contract for additional behavior while independently
   continuing to provide the original contract.
3. Publish a branch under a new identity, recording ancestry without asserting
   substitutability.

A new release or branch can coexist with its ancestor. An existing consumer can
use it only by explicitly accepting it, by having its original contract still
provided, or through an adapter. Editing a consumer produces a new component
release and requires verification of that consumer.

## 6. Composition rules

An assembly MUST identify its component instances and bind every required port
to a specific provided port, or explicitly leave an optional port unbound.
Component instances have stable assembly-local names, so two instances of the
same component can have distinct configuration and state.

For Draft 0.1:

1. Each required port binds to at most one provider. There is no implicit
   precedence, last-installed winner, or selection of the highest version.
2. Multiple providers of a contract may coexist, but each consumer binding is
   explicit. Unresolved choice is an error.
3. Fan-out, aggregation, decoration, and ordered middleware are components with
   their own contracts. They are not implicit merge operations.
4. Replacing an instance requires checking every affected binding, effect,
   permission, and state assignment. The replacement cannot acquire extra access
   merely by implementing the same interface.
5. An extension is an additional component or provided port. It cannot mutate
   another contract release or intercept unrelated calls implicitly.
6. The graph of all bound dependency ports, including optional ones, must be
   acyclic in the first experiment. Cycles produce an error with their path.
   Future profiles may define explicit lifecycle rules for cycles.

An assembly may inherit a starting configuration as an authoring convenience.
The accepted result must flatten to explicit instances and bindings. Overlay
syntax, conflict ordering, and automatic dependency search are not part of this
draft. Independently distributed components and contracts are sufficient for the
first experiment; a general patch-distribution mechanism is a later question.

### Adapters

An adapter MUST identify the contracts it provides and requires, the mapping of
operations, errors, identity, and effects, and any information loss. It must pass
the provided contract's suite and the integration checks for the actual binding.
Its state and dependencies follow ordinary component rules.

Adapters cannot conjure guarantees absent from their dependencies. For example,
renaming a field cannot turn eventual consistency into immediate visibility.
An adapter may implement a missing guarantee through additional behavior or
state, but must declare and verify that implementation. Otherwise composition
fails or the application explicitly chooses a different requirement in a new
assembly. A composer cannot silently relax the current assembly's policy.

## 7. State ownership and replacement

Every state resource has one declared owner in an assembly. Other components
use its owner's contracts; sharing tables or writing directly into another
component's storage is prohibited in the first experiment. Separate component
instances need separate state assignments unless an explicit coordinating
component owns and mediates the shared resource.

Public contracts govern visible data behavior. Storage formats belong to
implementations and MUST NOT be inferred from API compatibility. Replacing a
provider that implements the same contract can still require a data migration.

A stateful replacement requires a transition plan containing:

- Exact old and new component and storage-format references.
- Resources transferred, identifier mappings, and preservation requirements.
- A pinned migration artifact or an explicit, verified no-migration claim.
- Preconditions, backup/restore procedure, validation checks, and a cutover point.
- A recovery procedure distinguishing failure before cutover from failure after
  the new owner has accepted writes.

The first experiment allows an offline transition: stop writes, snapshot state,
migrate a copy, validate invariants, then switch ownership and bindings together.
Until successful cutover, the original owner and data remain authoritative.
After new writes occur, restoring the old snapshot would lose those writes;
recovery requires a verified reverse migration, reconciliation, or forward fix.
A successful forward migration does not imply reversibility.

Multi-owner transactions, live dual writing, and zero-downtime migration are
out of scope. State compatibility is a separate result from contract compatibility.

## 8. Resolution, verification, and activation

The composer produces a proposal. The resolver and verifier evaluate it under
an explicit assembly policy. Neither needs an AI model to reach its result.

The pipeline is:

1. **Resolve:** load the explicit artifact set, verify digests, validate
   declarations and profiles, resolve bindings, detect cycles, and check unique
   state ownership and policy-declared permissions.
2. **Lock:** record the complete resolved graph, artifact digests, configuration
   references, profile and tool versions, required checks, and policy identity.
3. **Verify:** run component conformance checks, adapter checks, assembly
   integration tests, and any state-transition rehearsal in the specified
   environment. Record other required evidence separately.
4. **Accept:** require every mandatory check and evidence obligation to be
   satisfied for that exact candidate. A structural pass alone is insufficient.
5. **Activate:** use a separate, authorized lifecycle operation to enact the
   assembly and any state transition. Validation has no production side effects.

The report MUST identify the lock digest, checks and their suite digests,
environment, inputs or fixture references, results, and unresolved obligations.
Changed artifacts, bindings, policy, or relevant configuration require new
verification; results from another candidate cannot be presented as current.
Secrets are not stored in the lock. Use secret references and record the relevant
access/configuration constraints without publishing credential values.

For a fixed assembly declaration, artifact set, and policy, structural resolution
must produce the same graph or the same ordered diagnostics. A lock makes inputs reproducible;
it does not guarantee deterministic external services or identical test timings.
The first experiment uses controlled fixtures and records nondeterministic inputs.

Diagnostics distinguish malformed declarations, integrity failure, missing or
ambiguous bindings, contract/profile mismatch, cycles, denied effects, state
conflicts, failed checks, and missing evidence. Each diagnostic identifies the
affected instance, port or requirement and explains what prevents acceptance.
Unsupported declarations must be reported rather than ignored.

## 9. Trust and the composer's authority

Conformance and trust are separate. A passing suite does not prove an artifact
is safe to run. Assembly policy determines accepted publishers and artifacts,
permitted effects, and the isolation used for running implementations, migrations,
and tests. Contract suites themselves are executable dependencies subject to
that policy.

A person or AI may discover candidates, generate adapters, propose migrations,
and explain conflicts. These outputs are ordinary versioned artifacts, subject
to the same review and verification requirements. A model's confidence is not
compatibility evidence. Test execution and activation require the authority of
the local operator; neither follows from an untrusted artifact's instructions.

A3C does not make a security fix in one component repair a separately maintained
replacement. Each selected implementation retains its own maintenance burden.

## 10. First experiment and acceptance criteria

Build a small local CRM with a client, contacts provider, and an independent
contact-label extension. Publish a second contacts implementation and a branch
of the contacts contract. Use fixture data and one interaction profile.

The experiment succeeds when it can demonstrate all of the following:

| Scenario | Required observation |
| --- | --- |
| Baseline | An explicit, locked assembly passes contract and integration checks. |
| Replacement | A second contacts implementation works with the unchanged client; fixture data, IDs, and tenant boundaries survive its state transition. |
| Independent extension | A label component remains usable across that replacement without changes to the original contacts contract. |
| Upstream update | A client security-fix release can be adopted while retaining custom contacts and labels, with no source merge and all affected checks rerun. |
| Contract branch | A changed contact representation works with the old client through a verified adapter; both contract lineages remain identifiable. |
| Invalid assembly | Ambiguous bindings, incompatible profiles, missing guarantees, cycles, and competing state owners produce specific failures. |
| Semantic conflict | A schema-compatible provider that leaks tenant data fails verification. |
| Migration failure | Failed pre-cutover validation leaves the original assembly and state usable. |
| Reproduction | Another clean environment can resolve the same lock and rerun the fixture-based checks without AI or mutable discovery. |

Compare the replacement and upstream-update steps with the equivalent source
fork workflow. Record manual edits, adapters, migrations, and unresolved work;
counting fewer Git conflicts alone would miss integration effort moved elsewhere.

This repository's first commit specifies these checks; it does not claim they
have been implemented or passed.

## 11. Decisions to make after this draft

Before implementing the experiment, choose one interaction profile, concrete
manifest and lock encodings, digest rules, and a portable test-runner interface.
Keep these choices small enough to exercise the model in one local environment.

Use the experiment to decide whether exact-release matching is practical, how
much evidence contracts need, and whether component boundaries actually reduce
maintenance effort. Then consider compatible-release ranges, event and UI
profiles, dependency cycles, registry discovery, publisher authentication, and
live state transitions. These require further specifications rather than
implicit resolver behavior.

## Source

The motivating argument is [Upstream Is No Longer a Product](https://olekk.com/posts/upstream-is-no-longer-a-product.html)
by Oleksandr Khomenko. The resolution rules, state lifecycle, and experiment above
are proposed design choices for A3C.
