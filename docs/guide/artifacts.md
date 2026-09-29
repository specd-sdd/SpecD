---
title: Artifacts & Templates
description: What artifacts are in SpecD, the artifact dependency DAG, drift tracking, and template authoring.
sidebar_position: 8
---

# Artifacts & Templates

In SpecD, **artifacts** are the concrete, typed deliverables produced during an active change. Rather than treating development as an informal chat or an unorganized series of code edits, SpecD models work as a deliberate progression through well-defined documents: proposals, living specifications, verification scenarios, architecture designs, and task checklists.

Every artifact in SpecD is defined and validated by the project's **schema**.

---

## 1. What is an Artifact?

An artifact is a versioned deliverable created inside an active change folder (`.specd/changes/<change-name>/`).

Each artifact possesses:

- **An Identifier (`id`)**: A unique name within the schema (e.g. `proposal`, `specs`, `verify`, `design`, `tasks`).
- **A Scope (`scope`)**:
  - `scope: change` — A single document for the entire change, located at the root of the change folder (e.g. `proposal.md`, `design.md`, `tasks.md`).
  - `scope: spec` — One document per targeted specification, located in capability subdirectories (e.g. `specs/<workspace>/<capability>/spec.md` for new specs, or `deltas/<workspace>/<capability>/spec.md.delta.yaml` for existing specs).
- **A Output Location (`output`)**: The file path pattern where the artifact is written on disk.
- **A Scaffolding Template (`template`)**: An initial Markdown template file on disk that provides structural headings and guidance comments when the artifact is first created.
- **Prompt Instructions (`instruction`)**: Contextual instructions injected into the AI agent's prompt when authoring or revising that artifact.
- **Validation Rules (`rules`)**: Pre- and post-validation checks (such as confirming all open questions are resolved or that task lists are properly formatted).

---

## 2. The Artifact Dependency DAG

Artifacts are not authored in arbitrary order. They form an explicit **Directed Acyclic Graph (DAG)** governed by the `requires` field in the schema:

```
proposal ──► specs ──► verify ──► design ──► tasks
```

You cannot author a `design.md` until the requirements in `spec.md` and `verify.md` are defined and validated. Likewise, you cannot write an actionable `tasks.md` checklist until the architecture and symbol impact are planned in `design.md`.

### Drift Detection & Invalidation

SpecD computes cryptographic SHA-256 hashes of all artifacts. If an author or reviewer goes back and modifies an upstream artifact (for example, revising `proposal.md` after `design.md` was already drafted), SpecD automatically detects the discrepancy:

1. **Drift Warning**: Upstream modifications flag downstream artifacts as `drifted`.
2. **Lifecycle Gate Protection**: SpecD blocks lifecycle transitions (such as moving to `implementing` or `archivable`) until drifted artifacts are reviewed and re-validated.
3. **Traceability**: Changes never silently drift out of sync with the specifications that govern them.

---

## 3. How Artifacts are Declared in a Schema

In a `schema.yaml` file (or in local custom schemas), artifacts are declared under the `artifacts` key:

```yaml
artifacts:
  - id: proposal
    scope: change
    output: proposal.md
    description: Initial proposal outlining why the change is needed
    template: templates/proposal.md
    requires: []
    instruction: |
      Create the proposal document that establishes WHY this change is needed.
      Address the problem statement, affected specs, and technical context.
    rules:
      post:
        - id: resolve-open-questions
          instruction: |
            Review the "Open questions" section. Any question affecting downstream
            artifacts must be resolved before proceeding.

  - id: specs
    scope: spec
    output: 'specs/**/spec.md'
    description: Detailed requirements defining what the system should do
    template: templates/spec.md
    requires:
      - proposal
    instruction: |
      Draft the normative specification using RFC 2119 keywords (SHALL, MUST, SHOULD).
```

### Key properties

| Field              | Type                 | Description                                                                            |
| :----------------- | :------------------- | :------------------------------------------------------------------------------------- |
| `id`               | `string`             | Unique artifact identifier (e.g. `proposal`, `design`).                                |
| `scope`            | `'change' \| 'spec'` | Whether the artifact is change-level or per-spec.                                      |
| `output`           | `string`             | File path or glob pattern relative to the change directory.                            |
| `description`      | `string`             | Human-readable explanation of the artifact's purpose.                                  |
| `template`         | `string` (optional)  | Relative file path to the template file on disk.                                       |
| `requires`         | `string[]`           | List of upstream artifact IDs that must be valid before this artifact can be authored. |
| `instruction`      | `string` (optional)  | Prompt instructions injected into AI agent context.                                    |
| `deltaInstruction` | `string` (optional)  | Alternate instructions used when authoring a `.delta.yaml` instead of a new file.      |
| `rules`            | `object` (optional)  | Validation rules (`pre` and `post`) executed during artifact lifecycle checks.         |

---

## 4. Artifact Templates

Artifact templates provide scaffolding when an AI agent or developer creates an artifact for the first time. They enforce consistent formatting, provide embedded guidance, and eliminate blank-canvas ambiguity.

### Template Storage as Files

In SpecD, artifact templates are **external files stored on disk** relative to the schema directory (or repository root):

```
my-schema/
├── schema.yaml
└── templates/
    ├── proposal.md
    ├── spec.md
    ├── verify.md
    ├── design.md
    └── tasks.md
```

In `schema.yaml`, the `template` field points to the file path:

```yaml
template: templates/proposal.md
```

SpecD reads the file from disk when initializing the artifact. Template files are plain Markdown and are versioned directly alongside your schema.

### Embedded Agent Guidance

Templates in `@specd/schema-std` make extensive use of HTML comments (`<!-- ... -->`). These comments serve as **in-situ instructions for AI coding assistants**:

```markdown
# Proposal: {{change.name}}

## Motivation

<!--
1-2 sentences on the problem or opportunity.
What is broken or missing? Why now? Focus strictly on WHY, not HOW.
-->

## Proposed Solution

<!--
High-level description of what we want to build or change.
Outline the concrete approach and the minimal necessary changes.
-->
```

When an AI agent scaffolds the document, it reads the guidance comments to understand what belongs in each section, what traps to avoid, and how deep the analysis should be. Agents are instructed not to copy the guidance comments into the final output.

---

## 5. The Standard Schema Artifact Pipeline (`@specd/schema-std`)

The default schema shipped with SpecD (`@specd/schema-std`) defines five core artifacts:

### 1. `proposal.md` (`scope: change`)

Establishes **why** the change is needed.

- **Sections**: Motivation, Current Behavior, Proposed Solution, Specs Affected (new vs modified), Technical Context, and Open Questions.
- **Role**: Serves as the initial alignment contract before any specification work begins.

### 2. `spec.md` (`scope: spec`)

Establishes **what** the system shall do.

- **Sections**: Purpose, Requirements (`### Requirement: <Title>`), Constraints, and Spec Dependencies.
- **Role**: Durable, living contract. Uses RFC 2119 keywords (`SHALL`, `MUST`, `SHOULD`) and omits implementation or testing details.

### 3. `verify.md` (`scope: spec`)

Establishes **how to verify** that requirements are satisfied.

- **Sections**: Verification Scenarios (`#### Scenario: <Name>`) structured as **GIVEN / WHEN / THEN** test cases.
- **Role**: Acceptance criteria paired 1:1 with requirements from `spec.md`.

### 4. `design.md` (`scope: change`)

Establishes **how** the capability will be implemented in code.

- **Sections**: Architectural Context, Symbols to Create/Modify, Blast Radius Analysis, Algorithms, Decision Records (ADRs), and Test Strategy.
- **Role**: Implementation contract for the developer or agent before writing code.

### 5. `tasks.md` (`scope: change`)

Establishes the **execution plan**.

- **Sections**: Checklists (`- [ ]`) grouped by component or phase.
- **Role**: Tracks granular implementation progress through the `implementing` lifecycle state.

---

## 6. Customizing Artifacts in `specd.yaml`

You can declare new artifact types or override existing templates in `specd.yaml` using `schemaOverrides`:

### Adding a Custom Artifact

To add a new deliverable (e.g. a database migration plan or OpenAPI contract):

```yaml
# specd.yaml
schemaOverrides:
  create:
    artifacts:
      - id: migration-plan
        scope: change
        output: migration.md
        description: Database migration and rollback strategy
        template: .specd/templates/migration.md
        requires:
          - design
        instruction: |
          Detail database schema changes, rollback scripts, and zero-downtime execution steps.
```

### Overriding an Existing Template

To replace an artifact's template with a company-specific format:

```yaml
# specd.yaml
schemaOverrides:
  set:
    artifacts:
      - id: proposal
        template: .specd/templates/enterprise-proposal.md
```

### Removing a Template

To have an artifact start as an empty file without initial scaffolding:

```yaml
# specd.yaml
schemaOverrides:
  remove:
    artifacts:
      - id: tasks
        template: null
```

---

## Where to go next

- [Changes Guide](./changes.md) — How changes manage artifacts and track state transitions.
- [Workflow Guide](./workflow.md) — The lifecycle states (`designing`, `implementing`, `verifying`, `archiving`).
- [Custom Schemas Guide](./custom-schemas.md) — Authoring custom schemas and schema plugins.
- [Schema Format Reference](../schemas/schema-format.md) — Full technical reference for all artifact and schema properties.
