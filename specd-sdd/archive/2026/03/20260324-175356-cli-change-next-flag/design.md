# Design: cli-change-next-flag

## Non-goals

- Add new lifecycle states or change the domain state machine in [`change-state.ts`](/Users/monki/Documents/Proyectos/specd/packages/core/src/domain/value-objects/change-state.ts).
- Change approval or signoff behaviour. The existing routing from `ready -> implementing` and `done -> archivable` remains owned by `TransitionChange`.
- Add automatic approval or archive execution from `--next`.
- Fix the separate validation inconsistency currently observed in the change artifact workflow. This design focuses on the product change itself.

## Affected areas

- [`transition.ts`](/Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/transition.ts): change the Commander signature from required `<step>` to optional `[step]`, add `--next`, resolve the effective target before delegating, and reject invalid combinations such as explicit `<step>` plus `--next`.
- [`change-transition.spec.ts`](/Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-transition.spec.ts): extend command tests for `--next`, mutual exclusivity, normal next-state resolution, and surfaced approval-required messages.
- [`invalid-state-transition-error.ts`](/Users/monki/Documents/Proyectos/specd/packages/core/src/domain/errors/invalid-state-transition-error.ts): extend the structured `TransitionFailureReason` union with an approval-boundary reason and generate richer human-readable messages from it.
- [`transition-change.ts`](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/transition-change.ts): add an explicit guard for `pending-spec-approval` and `pending-signoff` so the use case throws `InvalidStateTransitionError` with a structured approval-required reason before delegating to the entity.
- [`invalid-state-transition-error.spec.ts`](/Users/monki/Documents/Proyectos/specd/packages/core/test/domain/errors/invalid-state-transition-error.spec.ts): add assertions for the new reason type and message text.
- [`transition-change.spec.ts`](/Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/transition-change.spec.ts): add coverage for explicit approval-required failures and ensure `designing` remains allowed from pending approval states.
- [`docs/cli/cli-reference.md`](/Users/monki/Documents/Proyectos/specd/docs/cli/cli-reference.md): update the `change transition` section to document `--next`, the optional `[step]` shape, and the non-transitionable states where `--next` fails with explanation.
- [`docs/core/use-cases.md`](/Users/monki/Documents/Proyectos/specd/docs/core/use-cases.md): update `TransitionChange` docs to describe the new approval-required failure semantics.
- [`docs/core/errors.md`](/Users/monki/Documents/Proyectos/specd/docs/core/errors.md): update `InvalidStateTransitionError` documentation to include the new structured reason and its human-readable message behaviour.

## New constructs

- No new files or exported symbols are required.
- Two local helpers are likely useful inside [`transition.ts`](/Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/transition.ts):
  - `resolveRequestedTarget(fromState: ChangeState, step: string | undefined, useNext: boolean): ChangeState`
    - Responsibility: compute the CLI target state or raise a CLI error for unsupported `--next` states.
    - Relationships: used only by the command action before invoking `kernel.changes.transition.execute`.
  - `resolveNextTarget(fromState: ChangeState): ChangeState | null`
    - Responsibility: map forward workflow states to the next logical transitionable target.
    - Relationships: pure helper scoped to the CLI command module; does not bypass core transition semantics.

## Approach

The implementation splits cleanly between CLI target resolution and core failure semantics.

For the CLI command:

- Update Commander to accept `transition <name> [step]`.
- Add a boolean `--next` option.
- Validate the invocation shape explicitly:
  - neither `<step>` nor `--next` is allowed
  - both `<step>` and `--next` together are rejected
- Load current state through the existing `kernel.changes.status.execute({ name })` call that the command already uses for progress reporting.
- If `--next` is present, map the current state to the logical next transition target:
  - `drafting -> designing`
  - `designing -> ready`
  - `ready -> implementing`
  - `spec-approved -> implementing`
  - `implementing -> verifying`
  - `verifying -> done`
  - `done -> archivable`
- For `pending-spec-approval`, `pending-signoff`, and `archivable`, fail in the CLI with a clear `cliError(...)` message instead of inventing a synthetic target. This satisfies the new CLI spec without adding fake lifecycle transitions.
- Delegate the resolved target to `kernel.changes.transition.execute(...)` unchanged so approval routing, requires checks, hook execution, and transition output remain centralized in core.

For core transition semantics:

- Extend `TransitionFailureReason` with an approval-specific branch such as:

```ts
type TransitionFailureReason =
  | { readonly type: 'invalid-transition' }
  | { readonly type: 'incomplete-artifact'; readonly artifactId: string }
  | {
      readonly type: 'incomplete-tasks'
      readonly artifactId: string
      readonly incomplete: number
      readonly complete: number
      readonly total: number
    }
  | { readonly type: 'approval-required'; readonly gate: 'spec' | 'signoff' }
```

- Update `buildMessage(...)` so approval-boundary failures produce direct explanations:
  - `pending-spec-approval`: waiting for human spec approval
  - `pending-signoff`: waiting for human signoff
- In [`transition-change.ts`](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/transition-change.ts), add an early guard after target resolution and before `change.transition(...)`:
  - if current state is `pending-spec-approval` and target is not `designing`, throw `InvalidStateTransitionError(from, to, { type: 'approval-required', gate: 'spec' })`
  - if current state is `pending-signoff` and target is not `designing`, throw `InvalidStateTransitionError(from, to, { type: 'approval-required', gate: 'signoff' })`
- Keep `designing` allowed from those states so redesign and approval invalidation still work.

This approach covers every changed requirement and keeps responsibility boundaries intact:

- CLI owns argument parsing and `--next` resolution.
- Core owns structured transition failures.
- The domain entity still owns the actual state machine validation.

## Key decisions

- **Decision**: Resolve `--next` in the CLI instead of core.
  **Rationale**: `--next` is a command UX feature, not a domain concept. Core should continue receiving explicit target states.
  **Alternatives rejected**: Add a `next` mode to `TransitionChange`. Rejected because it would mix CLI convenience logic into the application use case.

- **Decision**: Add an `approval-required` reason to `InvalidStateTransitionError`.
  **Rationale**: the current generic invalid-transition message loses critical context in pending approval states. A structured reason lets both CLI text output and structured JSON/toon output stay precise without brittle string parsing.
  **Alternatives rejected**: hardcode special-case messages in the CLI based on current state alone. Rejected because the real failure semantics belong to core and other adapters may also need the same reason.

- **Decision**: Fail early for `--next` from `archivable` in the CLI.
  **Rationale**: archive execution is a different operation from lifecycle transition, and the spec explicitly says not to invent a transition target there.
  **Alternatives rejected**: map `archivable -> archiving` or auto-run archive. Rejected because `archiving` is not a user-driven transition command and archive work belongs to `change archive`.

- **Decision**: Preserve existing approval routing from `ready` and `done`.
  **Rationale**: the current smart routing already matches the lifecycle model and avoids duplicating gate logic in the CLI.
  **Alternatives rejected**: make `--next` detect gate-enabled states and jump directly to pending states itself. Rejected because that duplicates logic already present in `TransitionChange`.

## Trade-offs

- `[CLI and core both participate in the final UX]` -> Keep the split narrow: CLI only resolves `--next`; core only explains blocked transitions.
- `[Adding one more reason type broadens error handling surface]` -> Reuse the existing `SpecdError`/`handleError` path so no new error class or exit-code branch is introduced.
- `[Pending approval states now fail earlier in TransitionChange]` -> Preserve `designing` as an allowed escape hatch so redesign workflows still behave as before.

## Testing

**Automated tests**

- Update [`change-transition.spec.ts`](/Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-transition.spec.ts):
  - add a case for `--next` from `drafting` resolving to `designing`
  - add a case for `--next` from `ready` with `approvals.spec: true` ending in `pending-spec-approval`
  - add a case for `--next` plus explicit `<step>` returning exit code 1
  - add a case for `--next` from `pending-spec-approval` surfacing the human-approval message
  - add a case for explicit transition failure from `pending-signoff` surfacing the human-signoff message
- Update [`invalid-state-transition-error.spec.ts`](/Users/monki/Documents/Proyectos/specd/packages/core/test/domain/errors/invalid-state-transition-error.spec.ts):
  - assert the new `approval-required` reason shape
  - assert human-readable messages for both `gate: 'spec'` and `gate: 'signoff'`
- Update [`transition-change.spec.ts`](/Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/transition-change.spec.ts):
  - add a pending-spec-approval fixture and assert transition to `spec-approved` throws `approval-required/spec`
  - add a pending-signoff fixture and assert transition to `signed-off` throws `approval-required/signoff`
  - add a case proving transition to `designing` from pending approval still succeeds

Each new verify scenario maps to at least one automated test:

- `cli:cli/change-transition`
  - Command signature -> mutual exclusivity and no-step-without-`--next` cases
  - Next-transition resolution -> state mapping and routed success/failure cases
  - Invalid transition error -> surfaced approval-required stderr text
- `core:core/transition-change`
  - Human-approval pending states produce explicit transition failures -> direct use-case tests on reason payloads

**Manual / E2E verification**

- Run CLI command tests:

```bash
pnpm --filter @specd/cli test -- change-transition
```

- Run core transition/error tests:

```bash
pnpm --filter @specd/core test -- transition-change
pnpm --filter @specd/core test -- invalid-state-transition-error
```

- Manually verify command behaviour in a real change:
  - create or reuse a change in `drafting`, run `node packages/cli/dist/index.js change transition <name> --next`, expect `drafting -> designing`
  - place a change in `ready` with spec approval enabled, run `... transition <name> --next`, expect `pending-spec-approval`
  - place a change in `pending-spec-approval`, run `... transition <name> --next`, expect exit code `1` and a human-approval message
  - place a change in `archivable`, run `... transition <name> --next`, expect exit code `1` and an archive-boundary message

Linting and conventions to respect during implementation:

- no default exports
- explicit public return types
- no `any`
- keep logic in CLI adapter and core use case; do not move business rules into tests or helper scripts
- add JSDoc to any new helper functions that become non-trivial

No `docs/` updates are expected because the change is internal to change-lifecycle command behaviour and its spec coverage already carries the user-facing contract.
`docs/` updates are required because the project keeps command and core behaviour documented outside specs:

- update [`docs/cli/cli-reference.md`](/Users/monki/Documents/Proyectos/specd/docs/cli/cli-reference.md) for the command signature and `--next`
- update [`docs/core/use-cases.md`](/Users/monki/Documents/Proyectos/specd/docs/core/use-cases.md) for `TransitionChange`
- update [`docs/core/errors.md`](/Users/monki/Documents/Proyectos/specd/docs/core/errors.md) for `InvalidStateTransitionError`

## Open questions

- None for implementation. The remaining workflow issue is the unrelated `verify` artifact hash not being persisted for one delta in this change, which should be treated separately from the feature work if it blocks the transition to `ready`.
