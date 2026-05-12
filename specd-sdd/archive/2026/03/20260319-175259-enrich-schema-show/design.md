# Design: Enrich schema show, artifact-instruction, and fix implementing requires

## Affected areas

### 1. `packages/cli/src/commands/schema/show.ts` — `registerSchemaShow` (line 11)

Add `description`, `output`, and `hasTaskCompletionCheck` to both the JSON and text formatters. The data is already available on `ArtifactType` — just not being serialised.

### 2. `packages/core/src/application/use-cases/get-artifact-instruction.ts` — `GetArtifactInstructionResult` (line 32) and `execute()` (line 97)

Add `template` field to the result interface and populate it from `artifactType.template`. The template content is already loaded as a string by `buildSchema` — no file I/O needed.

### 3. `packages/cli/src/commands/change/artifact-instruction.ts` — `registerChangeArtifactInstruction` (line 11)

Pass through the new `template` field in both JSON and text output.

### 4. `packages/schema-std/schema.yaml` — `design` artifact (line 229)

Change `requires: [proposal]` to `requires: [proposal, specs, verify]`. The design artifact must be written after specs and verify are complete — it needs to reference the final specification and verification scenarios to produce a concrete implementation plan. Update the artifact instruction to explicitly tell the agent to read proposal, specs (and deltas), and verify (and deltas) before writing design.md.

### 5. `packages/schema-std/schema.yaml` — `implementing` step (line 504)

Change `requires: [tasks]` to `requires: [proposal, specs, verify, design, tasks]` for two reasons: (1) defensive gate — if any artifact is deleted mid-implementation, the step blocks until it's restored; (2) the hook instruction is updated to tell the agent to read all change artifacts from disk. Note: `CompileContext` does NOT include change artifact content in its output — it only uses `requires` to evaluate step availability. The agent must read the artifact files directly.

## Approach

**Step 1 — Enrich `schema show` output.**

In `show.ts`, the JSON branch (line 49–56) maps each artifact to a plain object. Add three fields:

```typescript
artifacts: schema.artifacts().map((a) => ({
  id: a.id,
  scope: a.scope,
  optional: a.optional,
  requires: [...a.requires],
  format: a.format,
  delta: a.delta,
  description: a.description ?? null,
  output: a.output,
  hasTaskCompletionCheck: a.taskCompletionCheck !== undefined,
})),
```

For the text branch (line 25–29), append `output=<pattern>` always and `[<description>]` when present:

```typescript
const artifactLines = schema.artifacts().map((a) => {
  const label = a.optional ? 'optional' : 'required'
  const requires = a.requires
  const reqStr = requires.length > 0 ? `  requires=[${requires.join(',')}]` : ''
  const outStr = `  output=${a.output}`
  const descStr = a.description !== undefined ? `  [${a.description}]` : ''
  return `  ${a.id}  ${a.scope}  ${label}${reqStr}${outStr}${descStr}`
})
```

**Step 2 — Add `template` to `GetArtifactInstruction`.**

In `get-artifact-instruction.ts`:

1. Add `template` to `GetArtifactInstructionResult`:

   ```typescript
   readonly template: string | null
   ```

2. In `execute()`, after resolving `instruction` (line 131–134), resolve template:

   ```typescript
   const template =
     artifactType.template !== undefined
       ? this._templates.expand(artifactType.template, contextVars)
       : null
   ```

3. Include `template` in the return object (line 176–182):
   ```typescript
   return {
     artifactId: resolvedId,
     rulesPre,
     instruction,
     template,
     delta,
     rulesPost,
   }
   ```

**Step 3 — Pass through `template` in CLI artifact-instruction.**

In `artifact-instruction.ts`:

1. Text format: add a `[template]` section after `[instruction]` (after line 53):

   ```typescript
   if (result.template !== null) {
     sections.push(`[template]\n${result.template}`)
   }
   ```

2. Update `hasContent` check (line 35–39) to include `result.template !== null`.

3. JSON format: add `template: result.template` to the output object (after line 81).

**Step 4 — Update design artifact requires and instruction in schema-std.**

In `schema.yaml` line 229–247, change `requires: [proposal]` to `requires: [proposal, specs, verify]` and prepend the instruction with guidance to read all upstream artifacts:

```yaml
- id: design
  scope: change
  optional: false
  output: design.md
  description: Implementation analysis — what needs to change and how
  template: templates/design.md
  requires:
    - proposal
    - specs
    - verify
  instruction: |
    Read the upstream artifacts before writing:
    - proposal.md — the problem, motivation, and scope
    - specs (spec.md and deltas) — the final requirements the implementation must satisfy
    - verify (verify.md and deltas) — the verification scenarios the implementation must pass

    Create the design document that explains HOW to implement the change.
    ...
```

The rest of the instruction remains unchanged.

**Step 5 — Fix implementing requires in schema-std.**

In `schema.yaml` line 504–512, change:

```yaml
- step: implementing
  requires: [proposal, specs, verify, design, tasks]
  hooks:
    pre:
      - id: implementing-guidance
        instruction: |
          Read all change artifacts before starting:
          - proposal.md — the problem being solved and why
          - specs (spec.md deltas) — the final specification of what the system should do
          - verify (verify.md deltas) — the verification scenarios that the
            implementation must satisfy
          - design.md — the implementation approach, key decisions, affected areas,
            and code snippets. This is the primary technical reference.
          - tasks.md — the progress checklist
          Work through tasks one by one in order. Use design.md as the technical
          reference for how to implement each task, specs for what the system should
          do, verify for the scenarios the implementation must pass, and proposal.md
          for the motivation behind decisions. Mark each task
          complete (- [x]) as you go. Pause and ask for guidance if you hit a blocker
          or the task is ambiguous. Do not advance to verifying while any - [ ]
          items remain.
    post:
      - id: run-tests
        run: 'pnpm test'
      - id: confirm-tests
        instruction: |
          Confirm all tests pass before marking implementing complete.
```

### 6. `packages/schema-std/schema.yaml` — `tasks` artifact instruction (line 345) and `packages/schema-std/templates/tasks.md`

The tasks instruction and template don't encourage including design decisions in each task. The current format is:

```
- [ ] 1.1 Short description
      `path/to/file.ts`: `SymbolName` — what to change and why
      (Req: requirement name)
```

This produces vague tasks. Update the format to include the concrete approach/decision from design.md:

```
- [ ] 1.1 Short description
      `path/to/file.ts`: `SymbolName` — what to change and why
      Approach: <concrete implementation detail from design.md — the specific
      technique, algorithm, signature, or code pattern to use>
      (Req: requirement name)
```

Changes:

- **Instruction** (line 345–387): update format section to include `Approach:` line, update the example to show it in practice
- **Template** (`templates/tasks.md`): add `Approach:` placeholder in the task format

## Key decisions

**Decision: `ArtifactType.template` already holds resolved content, not a file path.**
`buildSchema` reads the template file and passes the content string into `ArtifactType`. The getter returns the content directly. No additional file I/O is needed in `GetArtifactInstruction` — just access `artifactType.template` and expand variables.

**Decision: Template expansion uses the same `contextVars` as instruction.**
The template content may contain `{{change.name}}` and similar variables. Applying `TemplateExpander.expand()` keeps it consistent with how `instruction` is handled.

**Decision: implementing requires all artifacts as a defensive gate.**
`CompileContext` does NOT inject change artifact content into its output — `requires` only controls step availability (whether the step is blocked). Requiring all artifacts ensures that if any artifact is deleted or corrupted mid-implementation, the step blocks until it's restored. The agent reads artifact files directly from disk, guided by the hook instruction.

**Decision: implementing-guidance hook still references design.md and tasks.md by name.**
The hook is schema-specific content inside schema-std — it's allowed to know its own artifact names. Skills should be agnostic; the schema's own hooks are not.

## Testing

### Automated tests

**File:** `packages/cli/test/commands/schema/show.spec.ts`

- Test: JSON output includes `description`, `output`, `hasTaskCompletionCheck` for each artifact
- Test: `hasTaskCompletionCheck` is `true` for `tasks`, `false` for `proposal`
- Test: `description` is `null` when not declared
- Test: text output includes `output=` and `[description]` when present

**File:** `packages/core/test/application/use-cases/get-artifact-instruction.spec.ts`

- Test: `template` is returned when artifact has template
- Test: `template` is `null` when artifact has no template
- Test: template variables are expanded
- Test: `template` coexists with `delta` (both populated)

**File:** `packages/cli/test/commands/change/artifact-instruction.spec.ts`

- Test: JSON output includes `template` field
- Test: text output includes `[template]` section
- Test: `hasContent` is true when only template is present

### Manual verification

```bash
# Verify schema show includes new fields
node packages/cli/dist/index.js schema show --format json | python3 -c "import json,sys; d=json.load(sys.stdin); a=d['artifacts'][0]; print(a.get('description'), a.get('output'), a.get('hasTaskCompletionCheck'))"

# Verify artifact-instruction includes template
node packages/cli/dist/index.js change artifact-instruction enrich-schema-show proposal --format json | python3 -c "import json,sys; d=json.load(sys.stdin); print('template' in d, type(d.get('template')))"

# Verify implementing requires all artifacts
node packages/cli/dist/index.js schema show --format json | python3 -c "import json,sys; d=json.load(sys.stdin); impl=[s for s in d['workflow'] if s['step']=='implementing'][0]; print(impl['requires'])"
```

## Open questions

None.
