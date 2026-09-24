---
title: Changes in SpecD
description: Comprehensive guide to changes as the atomic unit of work, directory structure, manifest lifecycle, and artifact DAG in SpecD
sidebar_position: 4
---

# Changes in SpecD

In SpecD, a **change** is the fundamental unit of work. Every modification to your system — whether creating a new capability, refactoring an existing service, or fixing a bug — is organized as an active change.

There is no "code-only" workflow in SpecD. Code never moves forward in isolation; it moves forward in lockstep with the specifications that govern it.

---

## 1. What is a Change?

A change is an isolated, structured workspace that tracks the evolution of one or more specifications from initial intent through technical design, code implementation, and verification, to permanent archiving.

A change answers four essential questions:

1. **What intent is being addressed?** Captured in `proposal.md`.
2. **Which specifications are being created or updated?** Declared in `specIds` and staged in `specs/` or `deltas/`.
3. **How will it be built?** Planned in `design.md` and tracked in `tasks.md`.
4. **Where does the work currently sit?** Tracked in `manifest.yaml` as an explicit lifecycle state.

Unlike ephemeral git branches or informal issue tickets, a change in SpecD is a durable directory on disk containing both human-readable documentation and machine-verifiable metadata.

---

## 2. Anatomy of a Change Directory

Active changes live in `.specd/changes/` under a timestamped directory slug:

```
.specd/changes/
└── 20260923-144548-add-oauth-flow/
    ├── manifest.yaml          # Machine-readable state, scope, and artifact baselines
    ├── proposal.md            # Problem statement, intent, and user requirements
    ├── specs/                 # Staged full artifacts for brand-new specifications
    │   └── auth/
    │       └── oauth/
    │           ├── spec.md
    │           └── verify.md
    ├── deltas/                # Structured YAML delta patches for existing specs
    │   └── auth/
    │       └── login/
    │           └── spec.md.delta.yaml
    ├── design.md              # Technical architecture, symbol impact, and trade-offs
    └── tasks.md               # Granular implementation task checklist
```

### The Change Manifest (`manifest.yaml`)

The `manifest.yaml` is the control center of the change. It is managed automatically by the SpecD CLI and records:

- **Identity:** Unique change name and human-readable description.
- **State:** Current lifecycle step (e.g. `drafting`, `designing`, `implementing`, `verifying`).
- **Target Specs (`specIds`):** List of canonical spec identifiers affected by this change (e.g. `auth:login`, `core:storage`).
- **Artifact Tracking:** Content hashes and validation states for every required artifact. If an upstream artifact changes on disk after validation, SpecD flags it as `drifted` and requires review before advancing.
- **History:** Chronological log of state transitions, actor timestamps, and approval signatures.

---

## 3. The Artifact Dependency DAG

The schema governing your project (such as `@specd/schema-std`) defines an explicit Directed Acyclic Graph (DAG) of required artifacts:

```
  proposal (scope: change)
     │
     ▼
   specs (scope: spec)
     │
     ▼
   verify (scope: spec)
     │
     ▼
   design (scope: change)
     │
     ▼
   tasks (scope: change)
```

Each artifact depends on its predecessor:

- You cannot write a **design** until you have defined requirements in **specs** and acceptance criteria in **verify**.
- You cannot write implementation **tasks** until you have planned your technical architecture in **design**.
- You cannot transition to **`implementing`** until all upstream artifacts are validated and mark complete.

This guarantees that developers and AI agents never skip planning or jump straight to code without clear intent.

---

## 4. The Change Lifecycle

A change transitions through a series of explicit states:

```
  create
    │
    ▼
  drafting ──► designing ──► ready ──► implementing ──► verifying ──► done ──► archivable
    │                                                                             │
    │                                                                          archive
    ▼
  [pause: drafts]          [discard: discarded]
```

| Lifecycle State    | Meaning & Activities                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`drafting`**     | The change is opened. The developer and AI assistant explore the problem and draft the initial `proposal.md`.                                                               |
| **`designing`**    | Requirements are drafted into `specs/` or `deltas/`, acceptance scenarios are written in `verify.md`, and technical architecture is detailed in `design.md` and `tasks.md`. |
| **`ready`**        | All design artifacts are complete and validated against the schema. Ready for implementation. (If configured, the Spec Approval Gate triggers here).                        |
| **`implementing`** | Application code is modified. The agent checks off tasks in `tasks.md` one by one.                                                                                          |
| **`verifying`**    | Code is complete. Tests and verification scenarios from `verify.md` are executed to prove compliance.                                                                       |
| **`done`**         | Verification has passed. Ready for final review.                                                                                                                            |
| **`archivable`**   | All required signoffs and preflight integrity checks have passed.                                                                                                           |
| **`archived`**     | Spec deltas are merged into the living `specs/` directory; the change is moved to `.specd/archive/`.                                                                        |

---

## 5. Operations on Changes

### Creating a Change

```bash
# Create a change targeting existing specs
specd changes create add-oauth --spec auth/login --description "Add OAuth2 support"
```

### Checking Status and the Artifact DAG

The `specd changes status` command renders the full visual DAG, blockers, and recommended next actions:

```bash
specd changes status add-oauth
```

### Transitioning Lifecycle States

```bash
# Explicit transition
specd changes transition add-oauth implementing

# Automatically resolve the next logical forward step
specd changes transition add-oauth --next
```

### Shelving & Pausing (`drafts/`)

When urgent work interrupts an active change, you don't need to stash git changes or lose context:

```bash
# Shelve the active change
specd changes draft add-oauth --reason "Pausing to address production hotfix"

# Restore it later
specd drafts restore add-oauth
```

### Discarding (`discarded/`)

If an architectural spike or idea is abandoned:

```bash
specd changes discard add-oauth
```

The change is moved to `.specd/discarded/` for auditability rather than being deleted.

### Detecting Overlapping Changes

When multiple developers or AI agents work concurrently in the same repository:

```bash
specd changes check-overlap add-oauth
```

Detects if another active change is modifying the same specifications, preventing merge conflicts before they happen.

---

## 6. Archiving: The Final Step

When a change reaches `archivable`, you archive it:

```bash
specd changes archive add-oauth
```

Archiving executes an atomic transaction:

1. **Delta Application:** Staged `.delta.yaml` patches are applied to the canonical `specs/` directory, updating the living specifications.
2. **Integrity Validation:** SpecD validates that the resulting specs are parseable and satisfy all schema rules.
3. **Permanent Record:** The entire change folder is moved from `.specd/changes/` to `.specd/archive/<date>-add-oauth/`.

Archived changes remain in your repository as an immutable, permanent record of _why_ your system changed, _what_ was designed, and _how_ it was verified.
