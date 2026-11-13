# Note Auto-removal Policy

## Purpose

Notes need predictable cleanup across optional workflow steps without coupling their lifetime to the problems that created them. This capability defines typed policies, their closed textual grammar, validation and comparison.

## Requirements

### Requirement: Policy variants and validation

A policy SHALL be an object with a non-empty anyOf array of rules. A state rule SHALL contain on (enter-state or leave-state), states (the exclusive string all or a non-empty duplicate-free array of ChangeState), and optional direction (forward, backward, redesign, recovery or any; omitted means any). An operation rule SHALL contain on: operation-success and operation: archive only. Unknown properties, invalid variants, empty selectors and mixed all/state lists MUST fail with typed actionable errors. Policy absence means no automatic removal.

### Requirement: Closed Core parser

Core SHALL export a pure reusable parser accepting exactly enter-state:<states>[:<direction>], leave-state:<states>[:<direction>], or operation-success:archive. States are comma-separated valid tokens or all. Empty components, extra segments, duplicate states and unknown tokens MUST fail. The parser SHALL return a typed rule; adapters MUST reuse it. Object-input use cases SHALL use the same Core rule validator independently of parsing.

### Requirement: Effective event evaluation

State rules SHALL evaluate only successful effective hops, against destination for enter-state and source for leave-state, using existing workflow direction classification. Failed hops and no-ops MUST NOT match. Any matching rule removes a note once. Existing notes SHALL be evaluated before adding new operation notes. Archive success SHALL mean committed publication plus archive completion, not entering archiving or successful preparation; post-commit metadata/hook warnings do not undo success.

### Requirement: Policy equivalence

Comparison SHALL ignore rule order and state-array order, normalize omitted direction to any, and treat repeated equivalent OR conditions as equivalent. A missing policy differs from a present policy. It SHALL NOT rewrite notes or compare serialized insertion order. Distinct trigger types remain distinct, even where a particular hop happens to satisfy both.

### Requirement: Recovery and optional steps

Policies SHALL support redundant forward exit and arrival alternatives so optional/disabled implementing or verifying does not strand notes. Recovery, redesign and backward hops SHALL NOT satisfy forward-only rules. Policy evaluation MUST NOT invent transitions, change topology, or interpret note text as instructions.

## Spec Dependencies

- `core:change` — shared domain, application or adapter contract used by this capability.
- `core:workflow-topology` — shared domain, application or adapter contract used by this capability.
- `default:_global/error-handling-conventions` — shared domain, application or adapter contract used by this capability.
