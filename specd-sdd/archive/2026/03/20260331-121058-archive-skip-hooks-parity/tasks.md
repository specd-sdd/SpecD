# Tasks: archive-skip-hooks-parity

## 1. Core hook-phase model

- [x] 1.1 Replace boolean archive hook skipping with selectors
      `packages/core/src/application/use-cases/archive-change.ts`: `ArchiveChangeInput` and `ArchiveChange.execute()` — replace `skipHooks?: boolean` with `skipHookPhases?: ReadonlySet<ArchiveHookPhaseSelector>` and gate `pre` / `post` hook execution independently.
      Approach: add `ArchiveHookPhaseSelector = 'pre' | 'post' | 'all'`; compute one selector set per execution and branch pre/post hook calls on membership.
      (Req: Input, Req: Pre-archive hooks, Req: Post-archive hooks)
- [x] 1.2 Re-export the archive hook selector type
      `packages/core/src/application/use-cases/index.ts`: export `ArchiveHookPhaseSelector` so the CLI can type its option parsing against core contracts.
      Approach: extend the existing archive-change export block instead of defining duplicate CLI-local string unions.
      (Req: Input)

## 2. CLI archive command

- [x] 2.1 Replace `--no-hooks` with `--skip-hooks <phases>`
      `packages/cli/src/commands/change/archive.ts`: `registerChangeArchive()` — change the option, reuse comma-separated parsing, and forward selector sets to the use case.
      Approach: mirror `change transition` parsing with a local valid-value set of `pre`, `post`, `all`, defaulting to `new Set()`.
      (Req: Command signature, Req: Hook execution)
- [x] 2.2 Preserve archive result handling and overlap errors
      `packages/cli/src/commands/change/archive.ts`: action handler — keep success output and `SpecOverlapError` formatting unchanged while swapping only the hook-skip contract.
      Approach: limit the edit surface to option parsing and use-case input so behavior outside hooks does not regress.
      (Req: Behaviour, Req: Post-archive hooks, Req: Output on success, Req: Error cases)

## 3. Tests

- [x] 3.1 Update CLI archive command tests
      `packages/cli/test/commands/change-archive.spec.ts`: existing archive option tests — assert `--skip-hooks all`, `--skip-hooks pre`, and default empty set; remove `--no-hooks` expectations.
      Approach: follow the `change-transition` test style and inspect the mocked use-case call payload.
      (Req: Command signature, scenario: Skip hooks accepts archive phases, scenario: Skip all archive hooks, scenario: Skip only pre-archive hooks, scenario: Skip only post-archive hooks)
- [x] 3.2 Update ArchiveChange use-case tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`: skip-hook describe block — cover selector sets for `pre`, `post`, and `all` while keeping merge/archive assertions.
      Approach: reuse the existing `RunStepHooks` spy setup and assert which phases are or are not invoked.
      (Req: Pre-archive hooks, Req: Post-archive hooks, scenario: skipHookPhases pre skips only pre hooks, scenario: skipHookPhases post skips only post hooks, scenario: skipHookPhases all skips all archive hooks)

## 4. Documentation

- [x] 4.1 Update CLI and workflow docs for the new flag
      `docs/cli/cli-reference.md`, `docs/guide/workflow.md`, `docs/guide/getting-started.md`, `packages/cli/README.md`: command examples and option tables — replace `--no-hooks` with `--skip-hooks`.
      Approach: keep wording aligned with the updated CLI spec and use `--skip-hooks all` for full skip examples.
      (Req: Command signature, Req: Hook execution)
- [x] 4.2 Remove stale `--no-hooks` references from hook-model documentation
      `docs` references found by search and spec-linked examples — ensure manual hook control text matches the new archive contract.
      Approach: run a repo-wide search for `--no-hooks` after code edits and clear any remaining user-facing mentions unless they are historical.
      (Req: Hook execution)
