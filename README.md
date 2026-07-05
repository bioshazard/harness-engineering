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
5. Read the [email review-and-send meso chapter](./poc/email-review-send/README.md).

## Current scope

The first chapter derives the irreducible boundaries around one guarded file
write:

```text
Intent → Proposal → Guard → Capability → Effect
       → Observation → Evaluator → Reaction → Receipt
```

The email chapter separates narrow MCP mechanism design from harness control,
then composes draft, review, and guarded mock-send child Runs. Review evidence
selects revision, rejection, escalation, or one exact send.

## Status

Early and intentionally narrow. Executable examples continue to earn the model
one concrete pressure at a time.
