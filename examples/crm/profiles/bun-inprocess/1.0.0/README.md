# Bun in-process profile, candidate 1.0.0

Identity: `example.crm/bun-inprocess@1.0.0`. This profile is local to the CRM
experiment and is not a standardized A3C encoding or runtime.

## Invocation, values, and errors

Ports are TypeScript objects with asynchronous request/response methods. The
fixed runner supplies provided ports to their consumers explicitly. Operations
return `Promise<Result<T>>`: `{ok: true, value: T}` or `{ok: false, error: code}`.
A successful void operation has `value: undefined`. No serialization occurs
between in-process ports. Expected domain, dependency, and storage failures are
results; unexpected runtime failures are handled at the HTTP boundary.

| Contract | Operations | Requirement source |
| --- | --- | --- |
| `example.crm/contacts@1.0.0` (C1) | `create(name, request_id) -> id`; `get(id) -> {id, name}` | [CRM requirements](../../../../crm.md#1-contracts-and-fixtures), including `contacts.isolation`, `contacts.identity`, `contacts.visibility`, `contacts.retry`, and `contacts.errors`. |
| `example.community/contact-labels@1.0.0` (L1) | `add(contact_id, label) -> void`; `list(contact_id) -> labels` | Same walkthrough's L1 semantics. |

Names, labels, IDs, and request IDs use JavaScript strings. Names, labels, and
creation request IDs must be nonempty; whitespace and code units are preserved
exactly. Empty lookup IDs are simply absent. Label sorting uses ascending UTF-16
code-unit order (`Array.sort` on strings), never locale-specific collation.
The request-ID rule and ordering make previously implicit fixture details
explicit without adding operations. Request IDs are retained for the lifetime
of this fixture application.

The HTTP adapter maps these operations to the routes documented in the
[example README](../../../README.md). It is the application entry point, not a
second interoperable component profile.

## Identity and lifecycle

The runner maps a fixture bearer token to a frozen identity containing principal,
tenant, and permissions. It binds ports separately for each HTTP request and
passes that same identity into contacts and labels. Consumers receive already
bound methods; they cannot supply identity in method arguments. No ambient
mutable current-tenant variable is used.

Each operation checks the relevant permission, even for a retained retry.
Unauthorized reads return `not_found`; denied writes return `forbidden`. After
authorized label operations check contact visibility through C1, they access
only label-owned state. HTTP body-shape validation happens before dispatch to
these typed operations.

Startup opens initialized state, checks each owner's format, constructs the
fixed component graph, then starts accepting HTTP requests. On shutdown the
runner stops accepting requests, drains active work, and closes labels and
contacts storage. A startup failure closes any resources already opened.
General dependency lifecycle resolution is deferred to M1b.

## Storage boundaries

`contacts-store@1.0.0` owns `contacts-data`, represented by `contacts.sqlite` in
format `rows-v1`. Its contacts table is keyed by `(tenant, id)`. A separate request
table is keyed by `(tenant, request_json)` and retains the exact name and original
contact ID. Contact and request rows commit in the same immediate transaction,
with uniqueness and foreign-key constraints. A busy timeout permits short local
contention; storage errors still return `unavailable`.

`labels@1.0.0` owns `label-data`, represented by `labels.sqlite` in format
`label-sets-v1`. Labels are keyed by `(tenant, contact_id, label_json)` and added
atomically. The component has no contacts database handle or cross-database
foreign key; it checks visibility through its declared port.

User names, creation request IDs, and labels are JSON-encoded inside text columns
to preserve every JavaScript string, including unpaired surrogates that raw
SQLite text did not preserve in a local probe. This is an implementation storage
choice; public values are decoded strings. A schema-info row identifies the
format. There are no migrations or live state transitions in this slice.

## Test interface and evidence limits

Bun tests run reusable C1/L1 suites against a fixture driver. Suites use public
ports plus logical fixture inspection, seeding, and reopening supplied by that
driver; they never query a provider's SQL schema themselves. Future providers
must supply their own driver for the same checks.

The rows driver inspects counts and injects failures before reads, before commit,
and after commit but before returning a result. A before-commit exception rolls
back writes. An after-commit exception simulates a lost response: the caller sees
`unavailable`, then retries to recover the committed result. These factory-only
hooks are not reachable through HTTP, environment variables, or contract ports.
HTTP and curl integration tests exercise the actual server, and independent Bun
processes exercise retries against the same database.

The C1 suite covers all five named contacts requirements. The L1 suite covers
visibility/permissions, isolation, set semantics, ordering, exact strings,
idempotency, and dependency/storage failures. HTTP tests cover authentication,
error mapping, input validation, persistence, and concurrent request context.
These are ordinary test results, not machine-readable A3C acceptance reports.
Suite manifests, artifact digests, evidence obligations, and locks belong to M1b.
