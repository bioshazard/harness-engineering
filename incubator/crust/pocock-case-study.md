# Pocock workflow case study

This experiment asks what changes when a multi-stage coding workflow gains
durable authority outside the model: explicit state, immutable artifacts,
bounded capabilities, operator proposals, verification, receipts, and resume.

Pocock supplies a stressful concrete sequence:

```text
grill → specify → slice → implement → review → fix/commit → done
```

The sequence is not a recommended lifecycle for every project. Its value is the
pressure it puts on handoffs and evidence. In particular, the grill-to-spec
boundary can lose decisions that exist only in conversation; durable artifacts
let the next fresh agent session recover intent without treating a context
window as authority.

Crust tests one response: a Pi-native state machine that exposes only legal work
for the current state, keeps content-addressed evidence, and asks an operator to
accept consequential transitions. Future experiments may keep those ideas while
discarding Pocock's phases entirely.

This note distills the useful question from
[issue #23](https://github.com/bioshazard/harness-engineering/issues/23). The
implementation remains evidence, not doctrine.
