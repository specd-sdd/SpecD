# Tasks: pluralize-cli-resource-commands

## 1. CLI Command Tree Canonicalization

- [x] 1.1 Register plural canonical groups at root
      `packages/cli/src/index.ts`: command registration root — make `changes`, `specs`, `archives`, and `drafts` canonical groups.
      Approach: register plural groups as primary commander nodes and keep old singular roots as aliases to same subcommand handlers.
      (Req: Canonical plural groups)

- [x] 1.2 Preserve singular aliases with equivalent behavior
      `packages/cli/src/index.ts`: alias wiring for `change`, `spec`, `archive`, `draft`.
      Approach: alias maps to canonical group handlers, not duplicate business logic; keep output/error flow unchanged.
      (Req: Singular aliases, Behavioral equivalence)

## 2. Command Modules and Help Surface

- [x] 2.1 Update change-group command signatures/help text
      `packages/cli/src/commands/change/draft.ts`, `packages/cli/src/commands/change/list.ts`, `packages/cli/src/commands/change/archive.ts`: registration/help strings.
      Approach: help shows `changes ...` canonical forms; expose singular forms as aliases only.
      (Req: Help and docs canonical display)

- [x] 2.2 Update specs and drafts group command signatures/help text
      `packages/cli/src/commands/spec/list.ts`, `packages/cli/src/commands/drafts/list.ts`, `packages/cli/src/commands/drafts/show.ts`, `packages/cli/src/commands/drafts/restore.ts`.
      Approach: keep canonical group labels plural and allow singular alias invocation paths.
      (Req: Canonical plural groups, Singular aliases)

- [x] 2.3 Update archives group command signatures/help text
      `packages/cli/src/commands/archive/list.ts`, `packages/cli/src/commands/archive/show.ts`.
      Approach: present `archives` as canonical namespace and keep `archive` as alias for compatibility.
      (Req: Canonical plural groups, Singular aliases)

## 3. Documentation and Skills

- [x] 3.1 Normalize docs command examples to plural canonical forms
      `docs/cli/**` and affected command snippets under `docs/**`.
      Approach: replace primary examples with plural canonical groups; singular forms only as alias notes when needed.
      (Req: Help and docs canonical display)

- [x] 3.2 Normalize skill command references
      `.codex/skills/**/SKILL.md` and `.codex/skills/**/shared.md` command examples.
      Approach: align agent-facing command examples to plural canonical groups and keep singular mentions explicitly as aliases.
      (Req: Canonical Command References)

## 4. Tests and Verification

- [x] 4.1 Add/adjust command-discovery tests for canonical groups and aliases
      `packages/cli/test/commands/list-commands.spec.ts` and entrypoint-level coverage.
      Approach: assert canonical groups are discoverable and singular aliases resolve to same command tree targets.
      (Req: Canonical plural groups, Singular aliases)

- [x] 4.2 Add alias-equivalence tests for affected commands
      `packages/cli/test/commands/change-list.spec.ts`, `change-draft.spec.ts`, `change-archive.spec.ts`, `spec-list.spec.ts`, `drafts-*.spec.ts`, `archive-list.spec.ts`, `archive-show.spec.ts`.
      Approach: for each pair canonical vs alias, assert equivalent exit code and output model for same arguments.
      (Req: Behavioral equivalence)

- [x] 4.3 Manual E2E verification of canonical and alias invocations
      CLI runtime checks with `specd changes/specs/archives/drafts ...` and singular aliases.
      Approach: run the canonical and alias command pairs from design.md and confirm same behavior, while docs/help present canonical forms first.
      (Req: Help and docs canonical display, Behavioral equivalence)
