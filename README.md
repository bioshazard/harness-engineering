# Harness Engineering

An executable textbook deriving a standard model of harness engineering from
small, working examples.

Rather than begin with a complete framework or taxonomy, this repository adds
one conceptual pressure at a time:

```text
pressure → distinction → term → implementation → observation → ontology
```

Code supplies evidence. Chapters derive conclusions. Labs make them observable.
The ontology records only what the examples have earned.

## Start here

1. Read the [vision](./VISION.md).
2. Read [Harness Engineering: Hello World](./poc/hello-world/README.md).
3. Run the [hello-1 lab](./poc/hello-world/examples/hello-1/README.md).
4. Inspect the [current ontology](./poc/hello-world/docs/ontology.md).

## Current scope

The first chapter derives the irreducible boundaries around one guarded file
write:

```text
Intent → Proposal → Guard → Capability → Effect
       → Observation → Evaluator → Reaction → Receipt
```

Retries, orchestration, durable history, multiple capabilities, and richer
evaluation remain deliberately deferred. Later examples should introduce them
only when their necessity can be demonstrated.

## Status

Early and intentionally narrow. The first executable chapter is complete; the
broader model will emerge incrementally.
