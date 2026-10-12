# A3C

**Application Contracts & Composition Consortium** is a working name for a set
of rules that let application capabilities evolve independently and still be
assembled into a working application.

A contract describes observable behavior and the evidence required to rely on
it. Independent implementations can provide that behavior, extensions can add
new capabilities, and adapters can connect different contracts. An application
chooses its own assembly; no implementation upstream has special authority over
that choice.

The system must work without AI. People and agents can propose compositions,
but explicit rules and repeatable checks determine whether they are acceptable.

## Start here

- [First specification](SPEC.md): the composition model, rules, and boundaries.
- [Runnable CRM REST API](examples/crm/README.md): the first baseline slice, with
  curl examples, separate stores, and behavioral tests.
- [Worked CRM example](examples/crm.md): replacing contacts, adopting an upstream
  fix, adding an extension, and adapting a changed contract.

This repository contains **Draft 0.1**, a design proposal, and a runnable CRM
REST fixture with behavioral tests. Configurable resolution, artifact locks,
and A3C acceptance reports are not implemented yet.
The consortium name does not imply an established organization or standards body.

## Origin

The proposal starts from [Upstream Is No Longer a Product](https://olekk.com/posts/upstream-is-no-longer-a-product.html)
by Oleksandr Khomenko, published October 12, 2026. The CRM reference experiment
tests the model before committing to standardized distribution formats or runtimes.
