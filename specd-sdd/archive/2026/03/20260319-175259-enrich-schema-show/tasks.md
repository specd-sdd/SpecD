# Tasks: Enrich schema show, artifact-instruction, and fix implementing requires

## 1. Schema show — enrich JSON output

- [x] 1.1 Add `description`, `output`, `hasTaskCompletionCheck` to JSON formatter
      `packages/cli/src/commands/schema/show.ts`: JSON branch (line 49–56) —
      add three fields to the artifact map object.
      Approach: `description: a.description ?? null`, `output: a.output`,
      `hasTaskCompletionCheck: a.taskCompletionCheck !== undefined`. All three
      getters already exist on `ArtifactType` — no domain changes needed.
      (Req: Output format)

- [x] 1.2 Add `output` and `[description]` to text formatter
      `packages/cli/src/commands/schema/show.ts`: text branch (line 25–29) —
      append `output=<pattern>` always and `[<description>]` when present.
      Approach: build `outStr = \` output=${a.output}\`` and
      `descStr = a.description !== undefined ? \`  [${a.description}]\` : ''`,
    append both to the return string after `reqStr`.
      (Req: Output format)

## 2. GetArtifactInstruction — add template to response

- [x] 2.1 Add `template` field to `GetArtifactInstructionResult`
      `packages/core/src/application/use-cases/get-artifact-instruction.ts`:
      `GetArtifactInstructionResult` interface (line 32) —
      add `readonly template: string | null` between `instruction` and `delta`.
      Approach: pure interface change, no logic.
      (Req: Result shape)

- [x] 2.2 Resolve template content in `execute()`
      `packages/core/src/application/use-cases/get-artifact-instruction.ts`:
      `execute()` after instruction resolution (line 134) —
      Approach: `artifactType.template` already holds the resolved file content
      (loaded by `buildSchema`), not a file path. Just expand variables:
      `typescript
    const template =
      artifactType.template !== undefined
        ? this._templates.expand(artifactType.template, contextVars)
        : null
    `
      Same `contextVars` and `TemplateExpander` used for `instruction`.
      (Req: Instruction resolution)

- [x] 2.3 Include `template` in return object
      `packages/core/src/application/use-cases/get-artifact-instruction.ts`:
      return statement (line 176) — add `template` between `instruction` and `delta`.
      Approach: single line addition to the return object literal.
      (Req: Result shape)

## 3. CLI artifact-instruction — pass through template

- [x] 3.1 Add `template` to `hasContent` check
      `packages/cli/src/commands/change/artifact-instruction.ts`: line 35–39 —
      Approach: add `result.template !== null` to the `hasContent` disjunction.
      This ensures `no instructions` is not printed when only a template exists.
      (Req: Text output format)

- [x] 3.2 Add `[template]` section to text output
      `packages/cli/src/commands/change/artifact-instruction.ts`: after the
      `[instruction]` section push (line 53) —
      Approach: add `if (result.template !== null) { sections.push(\`[template]\n${result.template}\`) }`
      before the delta section. Follows the same pattern as instruction/delta.
      (Req: Text output format)

- [x] 3.3 Add `template` to JSON output
      `packages/cli/src/commands/change/artifact-instruction.ts`: JSON output
      object (line 77–84) —
      Approach: add `template: result.template` after `instruction` in the
      output object literal. The field passes through directly from the use case result.
      (Req: JSON output format)

## 4. Schema-std — update design artifact

- [x] 4.1 Change design `requires` to `[proposal, specs, verify]`
      `packages/schema-std/schema.yaml`: `design` artifact (line 235–236) —
      Approach: add `- specs` and `- verify` to the requires array. This ensures
      design cannot be written until specs and verify are complete, so the agent
      has the full specification and verification scenarios before designing.
      (Req: Workflow — design needs full spec context)

- [x] 4.2 Update design instruction to reference upstream artifacts
      `packages/schema-std/schema.yaml`: `design` artifact instruction (line 237) —
      Approach: prepend to the existing instruction:
      `     Read the upstream artifacts before writing:
    - proposal.md — the problem, motivation, and scope
    - specs (spec.md and deltas) — the final requirements the implementation must satisfy
    - verify (verify.md and deltas) — the verification scenarios the implementation must pass
    `
      The rest of the instruction (sections, depth guidance, etc.) stays unchanged.
      (Req: Workflow — design needs full spec context)

## 5. Schema-std — enrich tasks artifact format

- [x] 5.1 Update tasks instruction to include Approach line in format
      `packages/schema-std/schema.yaml`: `tasks` artifact instruction (line 345–387) —
      Approach: update the format spec to add an `Approach:` line after the file/symbol line:
      `     - [ ] <n>.<m> <short description>
          <file>: <symbol> — <what to change and why>
          Approach: <concrete implementation detail from design.md>
          (Req: requirement name)
    `
      Update the example to show it in practice, e.g.:
      ``     - [ ] 1.1 Add optional `artifactId` field to input interface
          `packages/core/src/application/use-cases/validate-artifacts.ts`:
          `ValidateArtifactsInput` — add `artifactId?: string` property
          Approach: add as optional field; when present, `execute()` filters
          the schema artifacts array to only the matching ID before validation
          (Req: Input)
    ``
      (Req: tasks derived from design)

- [x] 5.2 Update tasks template to include Approach placeholder
      `packages/schema-std/templates/tasks.md` —
      Approach: add `<!-- Approach: concrete implementation detail from design.md -->`
      to the task format placeholder, between the file/symbol line and the Req line.
      (Req: tasks derived from design)

## 6. Schema-std — fix implementing step

- [x] 6.1 Change implementing `requires` to all artifacts
      `packages/schema-std/schema.yaml`: `implementing` step (line 504–505) —
      Approach: change `requires: [tasks]` to
      `requires: [proposal, specs, verify, design, tasks]`. This is a defensive
      gate — if any artifact is deleted mid-implementation, the step blocks.
      `CompileContext` does NOT inject artifact content; it only evaluates availability.
      (Req: Workflow — defensive gate)

- [x] 6.2 Update implementing-guidance hook instruction
      `packages/schema-std/schema.yaml`: `implementing-guidance` hook (line 508–512) —
      Approach: rewrite the instruction to list all five artifacts the agent must read
      from disk with their roles: - proposal.md — the problem and why - specs/deltas — the final specification - verify/deltas — the verification scenarios - design.md — the implementation approach, key decisions, code snippets - tasks.md — the progress checklist
      Then the existing "work through tasks one by one" guidance, updated to reference
      design.md as technical reference and specs for what the system should do.
      (Req: Workflow — agent needs full context)

## 7. Tests

- [x] 7.1 Add schema show tests for new fields
      `packages/cli/test/commands/schema/show.spec.ts` —
      Approach: add tests verifying JSON output includes `description` (string|null),
      `output` (string), `hasTaskCompletionCheck` (true for tasks, false for proposal).
      Add text output test verifying `output=` and `[description]` when present.
      (Req: Output format)

- [x] 7.2 Add get-artifact-instruction tests for template
      `packages/core/test/application/use-cases/get-artifact-instruction.spec.ts` —
      Approach: add tests: (1) template returned with expanded variables when artifact
      has template; (2) template is null when artifact has no template; (3) template
      coexists with delta (both populated for delta-capable artifact with template).
      (Req: Instruction resolution, Result shape)

- [x] 7.3 Add CLI artifact-instruction tests for template
      `packages/cli/test/commands/change/artifact-instruction.spec.ts` —
      Approach: add tests: (1) JSON output includes `template` field; (2) text output
      includes `[template]` section; (3) `hasContent` is true when only template present.
      (Req: Text output format, JSON output format)

## 8. Build and verify

- [x] 8.1 Build and run full test suite
      `pnpm build && pnpm test`

## 9. Manual verification

- [x] 9.1 Verify schema show output
      `node packages/cli/dist/index.js schema show --format json` — check
      each artifact has `description`, `output`, `hasTaskCompletionCheck`

- [x] 9.2 Verify artifact-instruction output
      `node packages/cli/dist/index.js change artifact-instruction enrich-schema-show proposal --format json` —
      check `template` field contains resolved proposal template content

- [x] 9.3 Verify implementing requires
      `node packages/cli/dist/index.js schema show --format json` — check
      implementing step requires `[proposal, specs, verify, design, tasks]`
