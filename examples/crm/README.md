# CRM REST API: runnable baseline slice

This is **M1a** of the [CRM experiment](../crm.md), tracked in
[PR #1](https://github.com/a3c-org/spec/pull/1). It implements contacts and labels
behind an HTTP adapter in one Bun process. Use curl to explore it; there is no
browser UI or application CLI.

This slice uses fixed assembly wiring. It does **not** resolve arbitrary
assemblies, pin artifact digests, produce A3C locks or acceptance reports, or
perform migrations. Those baseline checks belong to M1b; replacements and
contract branches follow afterward. Passing these tests is evidence for the
implemented fixture behavior, not acceptance of a locked A3C assembly.

## Run locally

Prerequisites: mise and curl. All commands below run from the repository root.
Bun is pinned in the mise configuration. A new checkout needs explicit trust:

```sh
mise trust
mise run crm:install
mise run crm:init
mise run crm:serve
```

The server listens on `http://127.0.0.1:3000` and prints its URL as JSON. Stop it
with Ctrl-C; it drains active requests before closing its databases.

Initialization creates `examples/crm/.local/crm/contacts.sqlite` and
`labels.sqlite`, seeded with the existing fixture contacts and labels. It refuses
to overwrite an existing directory. Startup requires initialized databases with
known formats and never performs an implicit migration.

Set `CRM_DATA_DIR` to select another state directory, and `CRM_PORT` to select a
port (0 chooses an available port). Relative data paths resolve from
`examples/crm`, the mise task working directory. For example:

```sh
mise exec -- env CRM_DATA_DIR=/tmp/my-crm-fixture mise run crm:init
mise exec -- env CRM_DATA_DIR=/tmp/my-crm-fixture CRM_PORT=3001 mise run crm:serve
```

The default local state and dependencies are ignored by Git. Use a new data
directory when you need another fixture rather than resetting existing data.

## Fixture identities

These publicly documented tokens select local demonstration identities. They
are not production credentials. The runner derives tenant and permissions from
the token and supplies bound ports to the HTTP component. It never trusts a
tenant or permission supplied in a request body or tenant header.

| Bearer token | Tenant | Permissions | Seed contact |
| --- | --- | --- | --- |
| `alpha-rw-token` | alpha | Contacts and labels: read/write | `c17`, Ada Lovelace, label `customer` |
| `beta-rw-token` | beta | Contacts and labels: read/write | `c29`, Grace Hopper, label `partner` |
| `alpha-ro-token` | alpha | Contacts and labels: read only | Same alpha data |

Creation request IDs `seed-alpha-c17` and `seed-beta-c29` are retained for the
seeded records. Unknown or absent tokens return 401. Cross-tenant and absent
contact reads both return 404 with the same error body.

## Curl walkthrough

In a second terminal, create a contact:

```sh
mise exec -- curl -sS -i http://127.0.0.1:3000/contacts \
  -H 'Authorization: Bearer alpha-rw-token' \
  -H 'Content-Type: application/json' \
  --data-binary '{"name":"Katherine Johnson","request_id":"example-create-1"}'
```

The response is `201 {"id":"<opaque-id>"}`, with a `Location` header. Repeating
that request returns the same ID and status, without creating another contact.
Changing the name while retaining the request ID returns 409. To inspect your
new contact, substitute its returned ID for `c17` in the following examples.
These commands also work as written against the seeded Ada contact:

```sh
mise exec -- curl -sS http://127.0.0.1:3000/contacts/c17 \
  -H 'Authorization: Bearer alpha-rw-token'

mise exec -- curl -sS -i http://127.0.0.1:3000/contacts/c17/labels \
  -H 'Authorization: Bearer alpha-rw-token' \
  -H 'Content-Type: application/json' \
  --data-binary '{"label":"lead"}'

mise exec -- curl -sS http://127.0.0.1:3000/contacts/c17/labels \
  -H 'Authorization: Bearer alpha-rw-token'
```

Adding a label returns 204, including repeated additions. Listing returns
`{"labels":["customer","lead"]}`. Labels are nonempty, case-sensitive sets;
whitespace is preserved and results use JavaScript string order, independent of
locale. Contacts support create/get only: there is no collection GET, search,
editing, or deletion.

Try reading `c29` with the alpha token to observe tenant isolation. Use
`alpha-ro-token` on the POST examples to observe write rejection. A public
`GET /healthz` returns `{"status":"ok"}` while the initialized server is running.

## Repeatable demo and checks

```sh
mise run crm:demo
```

The demo creates disposable fixture databases, starts an HTTP server on an
available loopback port, and invokes real curl requests for both tenants. It
checks create/read, labels, repeated requests, conflicts, hidden contacts, and
read-only rejection. It prints the resulting contacts and labels and removes
its temporary state when done. It does not use `CRM_DATA_DIR` or require another
server to be running.

```sh
mise run crm:check
```

This runs strict type checking and Bun tests, including the curl demo. The tests
cover contract behavior, real HTTP requests, independent-process SQLite
contention, injected rollback and lost-response failures, restart persistence,
and exact string preservation. The same check runs in Linux CI.

When an agent runs a resource-heavy local check, use the shared Task Spooler:

```sh
mise exec -- env TS_SOCKET="$HOME/.agent-heavy.socket" TS_SLOTS=2 ts -S 2
mise exec -- env TS_SOCKET="$HOME/.agent-heavy.socket" TS_SLOTS=2 ts -nf mise run crm:check
```

Do not enqueue the long-running development server.

## Interfaces and boundaries

The versioned [in-process profile](profiles/bun-inprocess/1.0.0/README.md)
documents the internal interfaces, errors, storage formats, and test conventions.
The `client@1.0.0` component is the HTTP adapter consuming C1 and L1. The fixed
baseline is:

```text
HTTP request -> fixture authentication -> context-bound client ports
client.contacts -> contacts.api
client.labels   -> labels.api
labels.contacts -> contacts.api
```

Providers share a lifecycle but own separate databases. Labels has no contacts
database handle, and the HTTP client has no database access. Factories receive
dependencies explicitly; a consumer never imports a provider implementation.
Release folders are source candidates, not immutable published releases yet;
M1b will establish their first pinned locks. Shared runtime imports are limited
to the explicitly versioned interaction profile; contracts provide type-only
interfaces to consumers.

## HTTP errors

Failures use `{"error":{"code":"..."}}`. JSON request bodies accept only the
specified fields; malformed input or caller-supplied identity fields are rejected.

| HTTP status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_input` | Malformed JSON, wrong fields/types, or empty required strings. |
| 401 | `unauthorized` | Missing or invalid fixture bearer token. |
| 403 | `forbidden` | Authenticated identity cannot perform the write. |
| 404 | `not_found` | Missing/hidden record, denied read, or unknown route. |
| 405 | `method_not_allowed` | Unsupported method on a known route; includes `Allow`. |
| 409 | `conflict` | A retained request ID was reused with another name. |
| 415 | `unsupported_media_type` | A POST body did not use `application/json`. |
| 500 | `internal_error` | Unexpected runtime failure; no implementation details exposed. |
| 503 | `unavailable` | Storage or a declared dependency failed; retry is safe. |

Health is the only unauthenticated route. Authentication precedes CRM routing;
malformed HTTP bodies are rejected before invoking typed contract operations.
Responses disable caching. The fixture runs trusted local components in-process;
these boundaries do not sandbox untrusted executable code.
