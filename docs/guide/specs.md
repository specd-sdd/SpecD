---
title: Specifications in SpecD
description: Comprehensive guide to specs, requirement authoring, verification scenarios, delta evolution, and how specs drive development in SpecD
sidebar_position: 3
---

# Specifications in SpecD

In SpecD, specifications (**specs**) are the absolute source of truth. They define what your software system should do, why it does it, and how to verify that the implementation is correct.

Specs are not post-hoc documentation, nor are they throwaway sprint tickets. They are living, versioned, machine-readable requirement contracts that govern both human developers and autonomous AI coding agents.

---

## 1. What is a Spec?

A spec is a durable requirement document that captures the agreed-upon behavior of a capability. It answers: **What must the system do, and under what constraints?**

A spec adheres to three core tenets:

1. **Separation of Intent from Implementation:** A spec describes capabilities, user expectations, and behavioral boundaries — never internal classes, function signatures, or private variable names.
2. **Normative Language:** Requirements use RFC-2119 keywords (`SHALL`, `MUST`, `SHOULD`, `MAY`) to establish clear, unambiguous contractual obligations.
3. **Paired Verification:** A requirement is only as good as its verification. Every spec file (`spec.md`) is paired with an executable verification scenario file (`verify.md`).

### The Capability Directory Structure

Every specification lives in a dedicated capability directory under `specs/` (or your workspace's configured `specsPath`):

```
specs/
└── auth/
    └── login/
        ├── spec.md         # Requirements, constraints, and normative rules
        ├── verify.md       # Acceptance criteria and test scenarios
        └── spec-lock.json  # Authoritative persisted state (dependencies, code links, optimizations)
```

---

## 2. Anatomy of `spec.md`

`spec.md` defines the functional boundaries of a single cohesive capability.

### Structure

```markdown
# Capability Title

## Purpose

A concise description explaining why this capability exists, what problem it solves, and the business or architectural motivation.

## Requirements

### Requirement: Unique Requirement Name

A clear description of the requirement using normative language.

- Specific rules, behaviors, and invariants.
- Error conditions and fallback handling.

### Requirement: Another Requirement Name

...

## Constraints

Non-functional constraints, performance ceilings, architectural boundaries, or platform limitations (e.g. "Zero external runtime dependencies").

## Spec Dependencies

Explicit cross-references to other specs that this capability depends upon:

- [`auth:jwt-tokens`](../jwt-tokens/spec.md)
- [`core:storage`](../../core/storage/spec.md)
```

---

## 3. Anatomy of `verify.md`

`verify.md` defines concrete acceptance criteria for every requirement declared in `spec.md`. It translates abstract requirements into testable conditions.

### Scenario Format

Scenarios are organized under their matching requirement heading and structured as `GIVEN` / `WHEN` / `THEN` tuples:

```markdown
# Verification: Capability Title

## Requirements

### Requirement: Unique Requirement Name

#### Scenario: Successful login with valid credentials

- **GIVEN** a registered user with active status in the database
- **WHEN** POST `/api/v1/login` is called with valid credentials
- **THEN** status code is 200 OK
- **AND** response payload contains a signed JWT and refresh token

#### Scenario: Account locked after multiple failed attempts

- **GIVEN** a registered user with 4 prior failed attempts
- **WHEN** POST `/api/v1/login` is called with invalid password
- **THEN** response status is 423 Locked
- **AND** an audit event `AUTH_LOCKOUT` is recorded
```

Verification scenarios are used during the `verifying` lifecycle state (via `/specd-verify`) to confirm that unit tests, integration tests, or end-to-end assertions prove the code meets the spec.

---

## 4. Metadata Extraction & Indexing

SpecD automatically parses spec files and builds an AST-based metadata index without requiring runtime YAML frontmatter in spec files:

- **Requirements Indexing:** Every `### Requirement: <Name>` is indexed as a discrete requirement node.
- **Scenarios Indexing:** Every `#### Scenario: <Name>` is linked to its parent requirement.
- **Dependency Resolution:** Relative links in `## Spec Dependencies` are normalized into canonical spec IDs (e.g. `core:kernel`, `default:auth/login`).
- **Full-Text BM25 Search:** Requirements and scenarios are indexed for high-speed semantic retrieval via CLI (`specd graph search "<query>" --specs`) and agent context compilers.

---

## 5. How Specs Evolve: Spec Deltas

In traditional development, documentation rots because Pull Requests only show code diffs, leaving documentation disconnected. In SpecD, **specs evolve atomically with code**.

When modifying an existing specification, you never edit the canonical `specs/` directory directly. Instead, you create a change (`specd changes create <name> --spec <id>`).

Inside the active change, SpecD tracks spec modifications as **Spec Deltas** under `.specd/changes/<name>/deltas/<spec-id>/spec.md.delta.yaml`.

### Delta Operations

A delta patch file uses structured YAML operations to modify requirements:

```yaml
- op: added
  description: Add biometric authentication requirement
  position:
    parent:
      type: section
      matches: Requirements
    after:
      type: section
      matches: 'Requirement: Password Authentication'
  content: |
    ### Requirement: Biometric Authentication
    The system SHALL accept WebAuthn passkeys for passwordless authentication.

- op: modified
  description: Increase session timeout from 15m to 30m
  selector:
    type: section
    matches: 'Requirement: Session Expiration'
  content: |
    ### Requirement: Session Expiration
    Sessions SHALL expire after 30 minutes of continuous inactivity.

- op: removed
  description: Deprecate legacy SMS 2FA
  selector:
    type: section
    matches: 'Requirement: SMS Two-Factor'

- op: no-op
  description: Capability implemented without spec changes
```

### Previewing and Merging

- **Preview Deltas (`specd changes spec-preview <name>`)**: Shows the unified specification that would result from applying the change's delta patches onto the baseline specs.
- **Archive Merging (`specd changes archive <name>`)**: When the change completes verification, SpecD applies the deltas to `specs/`, verifies patch integrity, and saves the applied delta records in `.specd/archive/`.

---

## 6. Persisted State (`spec-lock.json`) and Metadata Cache

Specifications in SpecD are not only human-readable Markdown documents; they also carry durable semantic relationships and fast-retrieval caches.

### The Sidecar File (`spec-lock.json`)

Authoritative semantic state lives in a `spec-lock.json` sidecar file placed directly beside each spec on disk:

```
specs/auth/login/
├── spec.md
├── verify.md
└── spec-lock.json
```

The lock file manages four key dimensions of semantic metadata:

1. **`schema`** — The workflow schema identity under which this spec was created or migrated (`specd specs schema`).
2. **`dependsOn`** — Curated spec dependency links (`specd specs deps`). SpecD uses these links to compute the dependency DAG and automatically pull required upstream specifications into compiled agent context.
3. **`implementation`** — Explicit source code file and symbol links that implement this capability (`specd specs implementation`).
4. **`optimizations`** — Baseline summaries and token optimizations for LLM consumption (`specd specs optimizations`).

#### Managing Lock Files

- **Initialize Lock Files (`specd specs init`)**: Creates `spec-lock.json` for any existing specs that lack one:
  ```bash
  specd specs init --all
  ```
- **Inspect and Update Dependencies**:
  ```bash
  specd specs deps default:auth/login
  specd specs deps default:auth/login --add default:auth/session
  ```
- **Track Implementation Links**:
  ```bash
  specd specs implementation default:auth/login --file packages/core/src/auth.ts
  ```

During the change archiving process (`specd changes archive`), SpecD automatically validates and synchronizes `spec-lock.json` sidecar entries for all affected specifications.

### The Materialized Metadata Cache (`.specd/metadata/`)

To deliver sub-millisecond retrieval speeds during agent sessions and CLI queries, SpecD automatically projects and materializes structured metadata into `.specd/metadata/<spec>.json`.

- **Self-Healing**: SpecD computes an SHA-256 fingerprint across `spec.md`, `verify.md`, and `spec-lock.json`. When any command reads metadata (`specd specs metadata`, context compilation, or graph indexing), SpecD automatically detects staleness and rebuilds the projection on the fly.
- **Gitignored**: The `.specd/metadata/` directory is an ephemeral runtime cache and is automatically gitignored (`/.specd/metadata/` in root `.gitignore`). It should never be committed to version control.
- **Cache Content**: Materialized JSON includes extracted requirement headers, acceptance scenario blocks, purpose statements, normative constraints, and projected `spec-lock.json` fields.

---

## 7. How Specs Function Inside SpecD

Specs are deeply woven into the entire SpecD development platform:

```
  ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
  │  Living Specs   │ ◄───► │   Code Graph    │ ◄───► │  Active Change  │
  │  (specs/**)     │       │   (AST Store)   │       │  (.specd/**)    │
  └────────┬────────┘       └────────┬────────┘       └────────┬────────┘
           │                         │                         │
           ▼                         ▼                         ▼
   Human Governance          Blast Radius Impact      Automated Compliance
   & Audit Records           & Symbol Coverage        & Gate Verification
```

### 1. The Code Graph & Traceability

SpecD indexes your source code and links it directly to specification files:

- **`COVERS_FILE`**: Identifies which specs govern each source code file.
- **`COVERS_SYMBOL`**: Links individual functions, classes, and exported APIs directly to the specific requirement they satisfy.
- **Blast Radius Analysis**: When a spec is modified, `specd graph impact --spec <id> --direction dependents` reveals all downstream files, symbols, and dependent specs that require re-verification.

### 2. Context Compilation for AI Agents

When an AI agent runs a SpecD skill (`/specd`, `/specd-implement`, etc.):

- The agent does not read random files across your repository.
- SpecD compiles the exact target specs, dependency summaries, and verification criteria into a compact context block.
- The agent implements code against concrete requirement contracts, eliminating hallucinations.

### 3. Approval Gates & Compliance Checking

SpecD provides automated compliance checking:

- **Spec Approval Gate**: Verifies that the proposal and design documents satisfy the requirements before code implementation begins.
- **Signoff Gate**: Audits the completed code and test evidence against `verify.md` scenarios before archiving.

---

## 8. Authoring Best Practices

To get the most out of SpecD:

- **Keep specs focused:** One spec directory per capability. If a spec grows beyond 10-12 requirements, split it into sub-capabilities.
- **Use standard RFC-2119 keywords:** Be explicit about what is mandatory (`MUST`, `SHALL`) versus optional (`MAY`, `SHOULD`).
- **Never put code in `spec.md`:** Describe data contracts, interfaces, and behaviors conceptually. Use JSON/YAML examples or schemas to describe payload shapes rather than language-specific structs or classes.
- **Make scenarios testable:** In `verify.md`, avoid subjective words like "fast", "intuitive", or "correctly". Specify measurable criteria: status codes, events, output values, or maximum latencies.
