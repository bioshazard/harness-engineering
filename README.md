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
5. Read the [meso adapter-surgery chapter](./poc/dependency-upgrade/README.md).
6. Read the [email review-and-send meso chapter](./poc/email-review-send/README.md).

## Install the skill

```bash
npx skills@latest add https://github.com/bioshazard/harness-engineering/tree/main/skills/harness-engineering
```

## Current scope

The micro chapter derives the irreducible boundaries around one guarded file
write:

```text
Intent → Proposal → Guard → Capability → Effect
       → Observation → Evaluator → Reaction → Receipt
```

The dependency-upgrade chapter coordinates verification, exact upgrade, and
bounded adapter remediation. The email chapter separates narrow MCP
mechanisms, model meta-harnesses, workflow coordination, and Goal System
governance. Both use transition evidence to select what happens next.

## Status

Early and intentionally narrow. Executable examples continue to earn the model
one concrete pressure at a time.
