# Goal-System Engineering

Language for composing, executing, and explaining portable Goal Systems.

## Language

**Manifest Version**:
An immutable publication of declared component references and selectors. It may resolve differently after a mutable selector moves.
_Avoid_: Composition version

**Composition Lock**:
The complete immutable resolution of one Manifest Version for execution.
_Avoid_: Manifest, configuration snapshot

**Composition ID**:
The content-derived identity of a canonical Composition Lock.
_Avoid_: Manifest version, run ID

**Default Profile**:
A versioned set of composition declarations expanded when a consumer omits categories. Its expanded identities remain explicit in the Composition Lock.
_Avoid_: Ambient defaults, implicit configuration

**Resolution Failure**:
A structured explanation that no executable Composition Lock could be produced. It is not a Receipt because no run was admitted.
_Avoid_: Failed Receipt

**Receipt**:
The terminal evidence explaining why an admitted run was accepted or rejected.
_Avoid_: Resolution Failure, trace
