---
title: Standard Schema Reference
description: Deep-dive into @specd/schema-std artifacts, DAG validation, rules, and transition hooks.
sidebar_position: 11
---

# Standard Schema Reference

`@specd/schema-std` is the default workflow schema for SpecD projects. It defines an opinionated, production-grade spec-driven development process: **proposal → specs → verify → design → tasks**.

This reference describes each artifact in `@specd/schema-std`, its scope and lifecycle role, dependency constraints, templates, and transition gates.

---

## Artifact DAG

```
proposal [scope: change]
  ↓
specs [scope: spec]
  ↓
verify [scope: spec]
  ↓
design [scope: change]  (requires: proposal, specs, verify)
  ↓
tasks [scope: change]   (requires: specs, design)
```

The DAG is strictly acyclic. An artifact cannot be drafted or validated until all prerequisite artifacts in its dependency chain are complete (or explicitly skipped if optional).

---

## Artifacts in `@specd/schema-std`

### 1. proposal (`proposal.md`)

- **Scope**: `change` (working document, not synced to specs on archive)
- **Requires**: None (entrypoint artifact for every change)
- **Output**: `<change>/proposal.md`
- **Purpose**: Establishes the business motivation and technical intent before any spec or code is touched.
- **Sections**:
  - `## Motivation`: The problem being solved and value delivered.
  - `## Current behaviour`: Existing behavior or limitations.
  - `## Proposed solution`: High-level approach and architecture changes.
  - `## Specs affected`: Exhaustive list of specs created (`New specs`) or modified (`Modified specs`).
  - `## Impact`: Blast radius across workspaces, packages, and public contracts.
  - `## Open questions`: Unresolved design trade-offs.

### 2. specs (`spec.md` or `.delta.yaml`)

- **Scope**: `spec` (permanent specification synced to `specs/` upon archive)
- **Requires**: `proposal`
- **Output**: `<change>/specs/<capability>/spec.md` or `<change>/deltas/<capability>/spec.md.delta.yaml`
- **Purpose**: Formal normative contract defining what the system SHALL do.
- **Conventions**:
  - Normative RFC 2119 keywords (`SHALL`, `MUST`, `SHOULD`).
  - Requirements grouped under `### Requirement: <Title>` headings.
  - No implementation details (languages, classes, functions) or test scenarios.

### 3. verify (`verify.md` or `.delta.yaml`)

- **Scope**: `spec` (permanent verification scenarios synced to `specs/` upon archive)
- **Requires**: `specs`
- **Output**: `<change>/specs/<capability>/verify.md` or `<change>/deltas/<capability>/verify.md.delta.yaml`
- **Purpose**: Concrete test scenarios verifying requirement satisfaction.
- **Conventions**:
  - One-to-one parity with `spec.md`: every `### Requirement: <Title>` in `spec.md` has a corresponding heading in `verify.md`.
  - Structured GIVEN/WHEN/THEN behavior scenarios under `#### Scenario: <Name>`.

### 4. design (`design.md`)

- **Scope**: `change` (working document)
- **Requires**: `proposal`, `specs`, `verify`
- **Output**: `<change>/design.md`
- **Purpose**: Concrete technical specification of _how_ the implementation will be built.
- **Sections**:
  - `## Overview`: Technical summary and architecture diagrams.
  - `## Affected areas`: Files, packages, and modules touched.
  - `## New constructs`: Class, function, interface, and error signatures.
  - `## Approach & Execution flow`: Algorithms and step-by-step flow.
  - `## Key decisions`: Architecture Decision Records (ADRs) inline with rationale and alternatives.
  - `## Trade-offs`: Explicit compromises made.
  - `## Testing`: Unit, integration, and E2E test strategy.

### 5. tasks (`tasks.md`)

- **Scope**: `change` (working document with live progress checkboxes)
- **Requires**: `specs`, `design`
- **Output**: `<change>/tasks.md`
- **Purpose**: Granular, ordered implementation checklist driving execution.
- **Conventions**:
  - Grouped into logical task phases (e.g. `## 1. Domain Layer`, `## 2. CLI Adapter`).
  - Checkboxes (`- [ ]` / `- [x]`) with target files, symbols, approach, and requirement references.
  - Gated transition: Transition to `verifying` is blocked while any `- [ ]` remains.

---

## Workflow Step Gating

`@specd/schema-std` configures required artifacts for each lifecycle transition:

| State          | Required Artifacts                               | Description                                                                      |
| :------------- | :----------------------------------------------- | :------------------------------------------------------------------------------- |
| `drafting`     | None                                             | Initial state after change creation.                                             |
| `designing`    | None                                             | Authoring proposals, specs, verify, design, and tasks.                           |
| `ready`        | `proposal`, `specs`, `verify`, `design`, `tasks` | All planning artifacts complete and validated.                                   |
| `implementing` | `proposal`, `specs`, `verify`, `design`, `tasks` | Coding and task checklist advancement.                                           |
| `verifying`    | `verify`, `tasks`                                | Testing and scenario verification. Blocked if any `- [ ]` remains in `tasks.md`. |
| `archiving`    | `specs`, `tasks`                                 | Delta merging and syncing into `specs/`.                                         |

---

## Cross-Artifact Validations

The standard schema enforces relational integrity across artifacts:

1. **`specs-verify-requirement-parity`**:
   Ensures that every requirement declared in `spec.md` has a matching requirement heading with verification scenarios in `verify.md`.
2. **`proposal-specs-coverage`**:
   Ensures that every spec identifier listed under `## Specs affected` in `proposal.md` has a corresponding spec file or delta in the change.
3. **`design-tasks-coverage`**:
   Ensures that files and constructs identified in `design.md` are covered by implementation items in `tasks.md`.
