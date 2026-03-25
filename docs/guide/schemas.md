# Schemas

A schema defines the shape of your development workflow. It declares which artifact files exist, what order they are produced in, what rules govern them, and which lifecycle phases gate progression from design to archive.

Every SpecD project has exactly one active schema. You declare it in `specd.yaml` via the `schema` field:

```yaml
schema: '@specd/schema-std'
```

SpecD ships a standard schema — `@specd/schema-std` — that works for most projects. This guide explains what that schema does and how to adapt it to your needs.

## The standard schema

`@specd/schema-std` encodes the workflow: **proposal → specs → verify → design → tasks**. Five artifact types, a dependency graph between them, and a lifecycle that takes a change from idea to archived spec.

### Artifacts

#### 1. proposal (scope: change)

The proposal answers _why_ this change is needed. It is the entry point for every change — no other artifact can be written until a proposal exists.

A proposal covers motivation, current behaviour, proposed solution, the list of specs that will be created or modified, affected code areas, and open questions. The "Specs affected" section is the contract that drives everything downstream: every spec listed there must eventually be covered by a `spec.md` file or a delta.

Proposals are working documents. They live in the change directory and are not archived into the spec repository — they describe intent, not permanent requirements.

#### 2. specs (scope: spec)

The spec artifact (`spec.md`) defines _what_ the system should do. One spec file per capability. Specs use SHALL / MUST language, group requirements under `### Requirement: <name>` headings, and explicitly avoid WHEN/THEN scenarios (those belong in `verify.md`).

Unlike `proposal.md`, specs are permanent. They are synced into the `specs/` directory when the change is archived and remain there as the authoritative record of requirements.

Specs also support delta files: instead of rewriting an existing spec, the agent produces a `.delta.yaml` that expresses the changes as structured operations (add, modify, remove a requirement). SpecD applies deltas deterministically at archive time.

Requires: `proposal`

#### 3. verify (scope: spec)

The verify artifact (`verify.md`) defines _how to confirm_ the spec is satisfied. It groups GIVEN/WHEN/THEN scenarios under `### Requirement: <name>` headings that mirror `spec.md` exactly. Each scenario describes a concrete check, not a restatement of the requirement.

Like `spec.md`, verify files are permanent and synced to the spec directory at archive time.

Requires: `specs`

#### 4. design (scope: change)

The design document explains _how to implement_ the change. It analyses the codebase, lists affected files and symbols, defines new constructs with full signatures, documents the implementation approach, and maps every spec requirement and verify scenario to a concrete implementation path.

Design is a working document — it belongs to the change, not the permanent spec record. It is not optional, but its depth scales with the nature of the change: a large code refactor warrants detailed interface signatures; a documentation change warrants a content analysis.

Requires: `proposal`, `specs`, `verify` — the agent reads all three before writing the design.

#### 5. tasks (scope: change)

Tasks is the implementation checklist. Each task is a markdown checkbox (`- [ ]`) with indented context: which file, which symbol, what to change, and the specific approach from `design.md`. The agent works through tasks one by one and marks each complete (`- [x]`) as it goes.

SpecD uses task completion to gate the transition from `implementing` to `verifying` — the transition is blocked while any `- [ ]` items remain. Checking off tasks does not change the artifact's hash (pre-hash cleanup normalises checkboxes), so progress tracking does not trigger re-validation.

Requires: `specs`, `design` — the agent derives tasks from design.md and maps them back to spec requirements.

### Dependency graph

```
proposal
  ↓
specs
  ↓
verify
  ↓
design   (requires: proposal, specs, verify)
  ↓
tasks    (requires: specs, design)
```

The graph is acyclic and enforced by SpecD. An artifact's status is `pending` until all of its `requires` are `complete` (or `skipped`, for optional ones). You cannot start writing `verify.md` before `spec.md` is complete; you cannot start design before verify is done; you cannot start tasks before design is done.

## Artifact scope explained

Every artifact is either `scope: spec` or `scope: change`. This is the single most important property for understanding what survives a change.

**`scope: spec`** — the artifact is a permanent part of the spec record. When a change is archived, SpecD syncs every `scope: spec` artifact from the change directory into the `specs/` repository. The `specd validate` command checks that every spec directory contains all required `scope: spec` artifacts. In the standard schema, `spec.md` and `verify.md` are `scope: spec`.

**`scope: change`** — the artifact is a working document. It is validated during the change but never synced to the spec directory. `proposal.md`, `design.md`, and `tasks.md` are `scope: change` — they capture thinking and process, not permanent requirements.

At archive time the picture is:

- The change's `specs/` subdirectory (new `spec.md` and `verify.md` files, or delta files) is applied to the spec repository.
- `proposal.md`, `design.md`, and `tasks.md` remain in the change's archive directory as a record of the work, but they do not become part of the living spec.

## Templates

Each artifact type in `@specd/schema-std` ships with a template — a plain Markdown file used as scaffolding when the agent creates the artifact for the first time.

Templates are plain text. SpecD performs no variable substitution on them. HTML comments (`<!-- ... -->`) are preserved as-is and serve as guidance hints for the AI agent, pointing it toward intent, format requirements, and common pitfalls.

Here is the shape of each template:

**proposal.md** — opens with an HTML comment reminding the agent to focus on _why_, then provides sections for Motivation, Current behaviour, Proposed solution, Specs affected (split into New specs and Modified specs), Impact, and Open questions.

**spec.md** — opens with an HTML comment on the SHALL/MUST convention and the prohibition on WHEN/THEN, then provides a Purpose section, a Requirements section with one placeholder `### Requirement:` heading, a Constraints section, and a Spec Dependencies section.

**verify.md** — opens with a comment on the GIVEN/WHEN/THEN format and when to use AND/OR, then provides a structure with a `### Requirement:` heading and a `#### Scenario:` block with placeholders for GIVEN, WHEN, and THEN.

**design.md** — opens with a comment on the required depth and concrete specificity, then provides sections for Non-goals, Affected areas, New constructs, Approach, Key decisions, Trade-offs, Migration/Rollback, Testing, and Open questions.

**tasks.md** — opens with a comment on deriving tasks from design.md and including the approach inline, then provides two numbered task group sections with checkbox placeholders.

Templates can be replaced or extended when you extend or fork the schema. See [Customising your schema](#customising-your-schema) below.

## Artifact rules

Every artifact can carry `instruction` text and `rules` blocks. These are injected into the AI context when the agent is working on that artifact.

`instruction` is the main prompt for that artifact — what to write, how to structure it, and what to watch out for.

`rules` are pre- and post-instruction blocks injected around the instruction:

```yaml
- id: tasks
  scope: change
  output: tasks.md
  instruction: |
    Create the implementation checklist...
  rules:
    pre:
      - id: read-design-first
        text: 'Read design.md in full before creating any tasks.'
    post:
      - id: design-tasks-coverage
        text: |
          Cross-reference design.md against the tasks just written.
          Every item in Affected areas must map to at least one task.
```

In the standard schema, every artifact has a post-rule that cross-references the previous artifact for coverage: proposals check open questions are resolved before proceeding; specs check every listed spec has a file; verify checks every requirement has a scenario; and so on.

`requires` and `optional` control the dependency graph described above. A non-optional artifact cannot hard-depend on an optional one — that would make the non-optional artifact effectively optional too.

## Workflow steps

The schema also defines the lifecycle phases a change moves through. In `@specd/schema-std`:

| Step           | Requires (artifacts)                   |
| -------------- | -------------------------------------- |
| `designing`    | _(none — always available)_            |
| `ready`        | proposal, specs, verify, design, tasks |
| `implementing` | proposal, specs, verify, design, tasks |
| `verifying`    | verify, tasks                          |
| `archiving`    | specs, tasks                           |

Each step is independently gated by its own `requires`. A step becomes available once all listed artifacts are complete.

Steps can have `pre` and `post` hooks. Hooks are either instructions injected into the AI context or shell commands run at the phase boundary:

```yaml
- step: implementing
  requires: [proposal, specs, verify, design, tasks]
  hooks:
    pre:
      - id: implementing-guidance
        instruction: |
          Read all change artifacts before starting...
    post:
      - id: run-tests
        run: 'pnpm test'
```

**Pre-hook failure** — if a `run:` hook exits non-zero, the step is aborted. The agent should fix the problem and retry.

**Post-hook failure** — the step has already completed and is not rolled back. The user is prompted to continue with the remaining hooks or stop.

Shell hooks support template variables:

| Variable               | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| `{{change.name}}`      | The change's slug name                                 |
| `{{change.workspace}}` | The primary workspace of the change                    |
| `{{change.path}}`      | Absolute path to the change directory                  |
| `{{project.root}}`     | Absolute path to the directory containing `specd.yaml` |

## Customising your schema

There are three ways to customise schema behaviour, ranging from a single-line config change to a complete rewrite.

### 1. schemaOverrides in specd.yaml

`schemaOverrides` is the lightest-weight option. It modifies the active schema at load time without touching any file on disk. Use it for project-specific tweaks: an extra hook, an additional rule, a new artifact type that only this project needs.

It supports five operations:

| Operation | Effect                                                                                   |
| --------- | ---------------------------------------------------------------------------------------- |
| `create`  | Adds a new entry (artifact, workflow step). Fails if the ID already exists.              |
| `append`  | Appends entries to arrays (rules, hooks, metadataExtraction entries).                    |
| `prepend` | Prepends entries to arrays.                                                              |
| `set`     | Replaces scalar fields or whole array entries by identity.                               |
| `remove`  | Removes entries from arrays by identity (`id` for artifacts, `step` for workflow steps). |

**Example: add a post-implementing hook that runs your test suite**

```yaml
schemaOverrides:
  append:
    workflow:
      - step: implementing
        hooks:
          post:
            - id: run-tests
              run: 'pnpm test'
```

**Example: add a rule to an existing artifact**

```yaml
schemaOverrides:
  append:
    artifacts:
      - id: design
        rules:
          post:
            - id: check-compliance
              text: >-
                Cross-reference this design against the global compliance spec before proceeding.
```

**Example: add a new artifact type (an ADR)**

```yaml
schemaOverrides:
  create:
    artifacts:
      - id: adr
        scope: spec
        output: 'specs/**/adr.md'
        optional: true
        description: Architecture Decision Record
        requires: [specs]
```

`schemaOverrides` is the right tool for:

- Adding or removing hooks on existing workflow steps
- Appending rules or instructions to existing artifacts
- Adding a new artifact type that is unique to your project

### 2. Extend — specd schema extend

`specd schema extend` creates a new schema package that inherits from a parent and adds to it. The parent schema stays intact; the child schema describes only the delta. This is the right approach when you want to share a schema across multiple projects but each project needs additions.

```sh
specd schema extend @specd/schema-std --name my-workflow
```

The generated schema declares its parent and adds or modifies entries. Any artifact or workflow step from the parent is inherited as-is; you only declare what changes.

Use extend when:

- You want to add a new artifact type that multiple projects will share
- You want to publish the customisation as a reusable plugin
- The base schema stays structurally intact — you are adding, not restructuring

### 3. Fork — specd schema fork

`specd schema fork` makes a complete copy of a schema. You own every field. Use it when you need structural changes incompatible with the parent — different artifact ordering, renamed lifecycle steps, or a workflow that looks nothing like the original.

```sh
specd schema fork @specd/schema-std --name custom-workflow
```

Use fork when:

- You want to completely redesign the artifact dependency graph
- You need to rename lifecycle steps
- The base schema's structure would need to be dismantled more than extended

### Choosing the right approach

| Situation                                      | Approach          |
| ---------------------------------------------- | ----------------- |
| Add a hook after `implementing`                | `schemaOverrides` |
| Add a rule to the `design` artifact            | `schemaOverrides` |
| Add a new artifact type for this project only  | `schemaOverrides` |
| Add a new artifact type shared across projects | extend            |
| Publish schema additions as a reusable plugin  | extend            |
| Rename lifecycle steps                         | fork              |
| Restructure artifact dependencies from scratch | fork              |

## Validation rules

Schemas can declare structural validation rules for artifact content. Validations check that an artifact's AST matches the declared structure — for example, that `spec.md` always has a `## Requirements` section with at least one `### Requirement:` subsection.

The standard schema ships validations for `spec.md` and `verify.md` out of the box, so malformed artifacts fail before they can be archived.

For the full validation rule syntax and selector system, see [selectors.md](selectors.md).

## Metadata extraction

Schemas also declare how to extract structured metadata from artifact content — titles, descriptions, requirements, scenarios, and dependency references. This extracted metadata is what `specd context` uses to compile the structured instruction block for the agent.

For the full extractor syntax, see [selectors.md](selectors.md).

## Where to go next

- [selectors.md](selectors.md) — deep dive into selectors, extractors, and validation rules
- [workflow.md](workflow.md) — lifecycle states, transitions, and approval gates
- [docs/schemas/schema-format.md](../schemas/schema-format.md) — complete technical reference for the schema YAML format
- [docs/schemas/examples/](../schemas/examples/) — annotated schema examples
- [docs/config/config-reference.md](../config/config-reference.md) — `specd.yaml` reference, including `schemaOverrides` and `schemaPlugins`
