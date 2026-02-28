# Example: Full schema — proposal → specs → design → tasks

## When to use this schema as a starting point

This is the standard SpecD workflow for teams adopting spec-driven development. It models the full lifecycle of a change: a proposal explains why the change is needed, specs define what the system should do, an optional design document captures how to implement it, and a task list drives implementation.

Use this as your starting point and trim or extend it to match your team's conventions. The `design` artifact is declared `optional: true` — teams that do not produce design documents can skip it without affecting the rest of the workflow.

## File layout

```
specd/schemas/spec-driven/
├── schema.yaml
└── templates/
    ├── proposal.md
    ├── spec.md
    ├── verify.md
    ├── design.md       # optional artifact
    └── tasks.md
```

## schema.yaml

```yaml
name: spec-driven
version: 1
description: Proposal → specs → design → tasks workflow

artifacts:
  # ── proposal ──────────────────────────────────────────────────────────────
  # A change-scoped document — produced during the change, never synced to the
  # spec directory. Establishes WHY this change is needed before any spec work
  # begins. Has no dependencies: it is always the first artifact produced.
  - id: proposal
    scope: change
    output: proposal.md
    description: Initial proposal outlining why the change is needed
    template: templates/proposal.md
    requires: []
    instruction: |
      Create the proposal document explaining WHY this change is needed.
      Cover: motivation, current pain, proposed solution, and scope.
      Do not write requirements here — those go in spec.md.

  # ── specs ──────────────────────────────────────────────────────────────────
  # A spec-scoped artifact — synced to the permanent spec directory on archive.
  # Supports delta files: when modifying an existing spec, the agent produces a
  # .delta.yaml instead of rewriting the whole file. Requires proposal first.
  - id: specs
    scope: spec
    output: 'specs/**/spec.md'
    description: Detailed specifications defining what the system should do
    template: templates/spec.md
    requires:
      - proposal
    instruction: |
      Create or update specification files defining WHAT the system should do.
      Use SHALL / MUST for normative statements.
      Do not include WHEN/THEN scenarios — those go in verify.md.
    delta: true
    deltaInstruction: |
      When modifying an existing requirement, use op: modified with a selector
      targeting the requirement section by its exact heading.
      When adding a new requirement, use op: added with position.parent targeting
      the Requirements section. Include the full ### Requirement: heading in content.
    validations:
      # The spec must have a Purpose section.
      - type: section
        matches: '^Purpose$'
        required: true
      # The spec must have a Requirements section containing at least one requirement.
      - type: section
        matches: '^Requirements$'
        required: true
        children:
          - type: section
            matches: '^Requirement:'
            required: true
    contextSections:
      # When metadata is absent, extract the Requirements section for AI context.
      - selector:
          type: section
          matches: '^Requirements$'
        role: rules
        contextTitle: Spec Requirements
      # Extract the Constraints section separately with its semantic role.
      - selector:
          type: section
          matches: '^Constraints$'
        role: constraints

  # ── verify ─────────────────────────────────────────────────────────────────
  # A spec-scoped artifact paired with specs. Contains WHEN/THEN scenarios that
  # verify the system behaves as specified. Requires specs to be complete first.
  - id: verify
    scope: spec
    output: 'specs/**/verify.md'
    description: Verification scenarios for the spec
    template: templates/verify.md
    requires:
      - specs
    instruction: |
      Create verification scenarios (WHEN/THEN) for the spec.
      Group scenarios under ### Requirement: headings that match the spec.md
      requirements exactly — same heading text, same order.
      Only include scenarios that add information beyond what the requirement
      prose already states. Do not restate the happy path.
    delta: true
    deltaInstruction: |
      When modifying scenarios under an existing requirement, use op: modified
      with a selector targeting the ### Requirement: heading.
      When adding scenarios for a new requirement, use op: added with
      position.parent targeting the Requirements section. Include the full
      ### Requirement: heading and at least one #### Scenario: block in content.
    deltaValidations:
      # Every delta that adds or modifies content must include at least one scenario.
      - type: sequence-item
        where:
          op: 'added|modified'
        contentMatches: '#### Scenario:'
        required: false # warning only — some requirements legitimately have no scenarios
    validations:
      - type: section
        matches: '^Requirements$'
        required: true
        children:
          - type: section
            matches: '^Requirement:'
            required: true
            children:
              - type: section
                matches: '^Scenario:'
                required: true

  # ── design ─────────────────────────────────────────────────────────────────
  # Optional change-scoped document. Teams that do not produce a design document
  # can skip it — the agent must mark it skipped explicitly. When present, tasks
  # uses it to derive the implementation breakdown; when absent, tasks derives
  # from specs alone.
  - id: design
    scope: change
    optional: true
    output: design.md
    description: Technical design with implementation decisions
    template: templates/design.md
    requires:
      - proposal
    instruction: |
      Create the design document explaining HOW to implement the change.
      Cover: approach, key decisions, trade-offs, and any alternatives considered.
      Reference the spec requirements — do not repeat them.

  # ── tasks ──────────────────────────────────────────────────────────────────
  # Change-scoped task list. Gates the implementing workflow step — the agent
  # must produce this before implementation begins. preHashCleanup normalises
  # checked boxes so that ticking a task does not invalidate the artifact hash.
  - id: tasks
    scope: change
    output: tasks.md
    description: Implementation checklist with trackable tasks
    template: templates/tasks.md
    requires:
      - specs
    instruction: |
      Create the task list breaking down the implementation work into discrete,
      trackable steps. Use markdown checkboxes (- [ ] task).
      If design.md exists, use it to inform the breakdown.
      If it does not exist, derive tasks from the specs alone.
    preHashCleanup:
      # Normalise checked boxes before hashing so that checking off a task
      # does not change the artifact's content hash and invalidate its status.
      - pattern: '^\s*-\s+\[x\]'
        replacement: '- [ ]'
    taskCompletionCheck:
      incompletePattern: '^\s*-\s+\[ \]'
      completePattern: '^\s*-\s+\[x\]'

workflow:
  # designing — always available; no artifact prerequisites
  - step: designing
    requires: []
    hooks:
      pre:
        - instruction: |
            Begin by writing the proposal document. Once approved, write the
            spec.md and verify.md files. Use delta files when modifying existing specs.

  # implementing — gated on tasks being complete
  - step: implementing
    requires: [tasks]
    hooks:
      pre:
        - instruction: |
            Read the tasks in tasks.md. Work through them one by one, marking
            each complete (- [x]) as you go. Pause and ask for guidance if you
            hit a blocker. Do not mark implementing complete while any - [ ] items remain.
      post:
        - run: 'pnpm test'
        - instruction: |
            Confirm all tests pass before marking implementing complete.

  # verifying — gated on verify.md being complete
  - step: verifying
    requires: [verify]
    hooks:
      pre:
        - instruction: |
            Run through each scenario in verify.md. For each one, confirm the
            implementation satisfies it by checking the code and running tests.
            If a scenario fails, return to implementing.

  # archiving — gated on both specs and tasks being complete
  - step: archiving
    requires: [specs, tasks]
    hooks:
      pre:
        - run: 'pnpm test'
        - instruction: |
            Review the delta files before confirming the archive. Ensure all
            modified specs accurately reflect the implementation that was built.
      post:
        - run: 'git checkout -b specd/{{change.name}}'
        - instruction: |
            Summarise what changed in this archive for the commit message.
```

## What this schema does

**Artifact dependency graph** — `proposal` has no dependencies and is always the first artifact. `specs` and `design` both require `proposal`. `verify` requires `specs`. `tasks` requires `specs`. This means:

```
proposal → specs → verify
         ↘ design   ↘ tasks (also requires specs)
```

The agent cannot produce `specs` until `proposal` is complete. It cannot produce `verify` until `specs` is complete.

**Delta support on specs and verify** — both `specs` and `verify` declare `delta: true`. When a change modifies an existing spec rather than creating a new one, the agent produces a `.delta.yaml` file instead of rewriting the file in full. SpecD applies the delta deterministically during archiving, giving a precise, reviewable record of exactly what changed.

**preHashCleanup on tasks** — checking off a task in `tasks.md` changes the file's content. Without `preHashCleanup`, that would reset the artifact's status from `complete` back to `in-progress`, requiring re-validation. The cleanup rule normalises all `[x]` checkboxes back to `[ ]` before hashing, so the hash is stable regardless of task completion state.

**taskCompletionCheck on tasks** — the `implementing → verifying` transition is blocked while any `- [ ]` item exists in `tasks.md`. The agent cannot advance to verifying until every task is checked off.

**workflow gating** — the `implementing` step requires `tasks`. The agent cannot enter the implementing phase until the task list is produced and complete. The `verifying` step requires `verify`. The `archiving` step requires both `specs` and `tasks` — ensuring the spec record and the task list are both validated before the change is permanently recorded.
