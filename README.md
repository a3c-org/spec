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
- [Worked CRM example](examples/crm.md): replacing contacts, adopting an upstream
  fix, adding an extension, and adapting a changed contract.

This repository currently contains **Draft 0.1**, a design proposal. It does not
yet contain a resolver, runtime, machine-readable format, or conformance suite.
The consortium name does not imply an established organization or standards body.

## Origin

The proposal starts from [Upstream Is No Longer a Product](https://olekk.com/posts/upstream-is-no-longer-a-product.html)
by Oleksandr Khomenko, published October 12, 2026. The next step is a small
reference experiment that tests the model before committing to a distribution
format or runtime.
