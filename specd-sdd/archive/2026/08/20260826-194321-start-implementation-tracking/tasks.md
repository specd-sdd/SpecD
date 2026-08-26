# Tasks: start-implementation-tracking

## 1. Domain Model (`@specd/core`)

- [x] 1.1 Extend `ChangeProps` and `Change` entity with tracking fields and getters
      `packages/core/src/domain/entities/change.ts`: `ChangeProps`, `Change` — add `implementationTrackingStartedAt` property, private field, and getters
      Approach: add `readonly implementationTrackingStartedAt?: Date | null` to `ChangeProps`; add private `_implementationTrackingStartedAt: Date | null`; expose getters `get implementationTrackingStartedAt(): Date | null` and `get isImplementationTrackingActive(): boolean` returning `this._implementationTrackingStartedAt !== null`
      (Req: Explicit implementation tracking activation)
- [x] 1.2 Implement `startImplementationTracking` domain method on `Change`
      `packages/core/src/domain/entities/change.ts`: `Change.startImplementationTracking(at?: Date)` — domain mutation method
      Approach: accept optional `at: Date = new Date()`; if `this._implementationTrackingStartedAt === null`, assign `new Date(at.getTime())` and call `this._touch()`; if already non-null, no-op to guarantee idempotency
      (Req: Explicit implementation tracking activation)
- [x] 1.3 Add legacy hydration fallback in `Change` constructor
      `packages/core/src/domain/entities/change.ts`: `Change.constructor` — constructor hydration and backward compatibility
      Approach: if `props.implementationTrackingStartedAt !== undefined`, set `this._implementationTrackingStartedAt` from props; if undefined (legacy manifest), fallback to `this.getHistoricalImplementationAt()`
      (Req: Explicit implementation tracking activation, Requirement: Manifest structure)
- [x] 1.4 Add unit tests for `Change` implementation tracking methods and legacy hydration
      `packages/core/test/domain/entities/change.spec.ts`: describe block 'implementation tracking activation'
      Approach: assert initial inactive state, activation via `startImplementationTracking`, idempotency on duplicate calls, and automatic initialization from historical `implementing` transitions on legacy hydration
      (Req: Explicit implementation tracking activation)

## 2. Manifest Schema & Repository Persistence (`@specd/core`)

- [x] 2.1 Update manifest interface and Zod schema
      `packages/core/src/infrastructure/fs/manifest.ts`: `ChangeManifest`, `changeManifestSchema` — add tracking field
      Approach: add `readonly implementationTrackingStartedAt?: string | null` to `ChangeManifest`; add `implementationTrackingStartedAt: z.string().datetime().optional().nullable()` to `changeManifestSchema`
      (Req: Manifest structure)
- [x] 2.2 Update `FsChangeRepository` manifest serialization and deserialization
      `packages/core/src/infrastructure/fs/change-repository.ts`: `changeToManifest()`, `_manifestToChange()`
      Approach: in `changeToManifest`, map `change.implementationTrackingStartedAt?.toISOString() ?? undefined`; in `_manifestToChange`, parse ISO string to `Date` and pass into `ChangeProps`
      (Req: Manifest structure)
- [x] 2.3 Add persistence round-trip and legacy migration tests
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: describe block 'implementation tracking persistence'
      Approach: save and load change with active tracking asserting ISO string round-trip; load legacy manifest without field asserting historical fallback
      (Req: Manifest structure)

## 3. Application Use Cases & Infrastructure (`@specd/core`)

- [x] 3.1 Extend `UpdateImplementationTrackingAction` and `UpdateImplementationTrackingInput`
      `packages/core/src/application/use-cases/update-implementation-tracking.ts`: `UpdateImplementationTrackingAction`, `UpdateImplementationTrackingInput`
      Approach: add `'start'` to `UpdateImplementationTrackingAction` union; make `readonly file?: string` optional in `UpdateImplementationTrackingInput`
      (Req: Input contract)
- [x] 3.2 Implement `'start'` mutation in `UpdateImplementationTracking.execute()`
      `packages/core/src/application/use-cases/update-implementation-tracking.ts`: `UpdateImplementationTracking.execute()`
      Approach: when `input.action === 'start'`, call `change.startImplementationTracking()`, bypass file existence validation, and return `{ implementationTracking: projectImplementationTracking(change) }` inside `_changes.mutate`
      (Req: Start mutation activates implementation tracking)
- [x] 3.3 Add unit tests for `UpdateImplementationTracking` start action
      `packages/core/test/application/use-cases/update-implementation-tracking.spec.ts`: describe block 'start action'
      Approach: test executing with `action: 'start'` activates tracking on change, does not require `file`, and preserves idempotency on repeated calls
      (Req: Start mutation activates implementation tracking)
- [x] 3.4 Auto-activate implementation tracking in `TransitionChange`
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange.execute()`
      Approach: within `_changes.mutate` block, when `effectiveTarget === 'implementing'` and `!change.isImplementationTrackingActive`, invoke `change.startImplementationTracking(new Date())`
      (Req: Automatic implementation tracking activation on transition to implementing)
- [x] 3.5 Add unit tests for `TransitionChange` tracking auto-activation
      `packages/core/test/application/use-cases/transition-change.spec.ts`: test transition to `implementing`
      Approach: transition an inactive change to `implementing` and verify `isImplementationTrackingActive` becomes `true` with transition timestamp; verify pre-existing timestamp is preserved
      (Req: Automatic implementation tracking activation on transition to implementing)
- [x] 3.6 Guard candidate detection in `RefreshImplementationTracking`
      `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`: `RefreshImplementationTracking.execute()`
      Approach: replace `if (freshChange.getHistoricalImplementationAt() !== null)` with `if (freshChange.isImplementationTrackingActive)`
      (Req: Implementation tracking active guard)
- [x] 3.7 Update `VcsImplementationDetector` baseline resolution
      `packages/core/src/infrastructure/vcs/vcs-implementation-detector.ts`: `VcsImplementationDetector.detectModifiedFiles()`
      Approach: read `const startedAt = change.implementationTrackingStartedAt`; if `null`, return `[]`; pass `startedAt` to `this._resolveBaseRef(vcs, startedAt)`
      (Req: Implementation tracking active guard)
- [x] 3.8 Add unit tests for `RefreshImplementationTracking` and `VcsImplementationDetector`
      `packages/core/test/application/use-cases/refresh-implementation-tracking.spec.ts`: test active tracking guard
      Approach: assert detection runs when `isImplementationTrackingActive` is true and is bypassed when false
      (Req: Implementation tracking active guard)

## 4. CLI Delivery Layer (`@specd/cli`)

- [x] 4.1 Register `specd changes implementation start <name>` subcommand
      `packages/cli/src/commands/change/implementation.ts`: `registerChangeImplementation()`
      Approach: register `command.command('start <name>')` with `--format` and `--config` options, invoking `mutateImplementationTracking(name, { action: 'start', format: opts.format, ... })`
      (Req: Start subcommand)
- [x] 4.2 Add text, toon, and json formatting for `start` subcommand
      `packages/cli/src/commands/change/implementation.ts`: output formatting in `mutateImplementationTracking`
      Approach: text mode renders `✓ Implementation tracking is active for '<name>' (started at <timestamp>).`; toon mode renders `result: ok`, `name: <name>`, `trackingActive: true`, `startedAt: <timestamp>`
      (Req: Start subcommand)
- [x] 4.3 Add CLI integration tests for `changes implementation start`
      `packages/cli/test/commands/change/implementation.spec.ts`: test `start` subcommand
      Approach: execute `changes implementation start <name>` across text and toon formats, verifying stdout output and persisted manifest state
      (Req: Start subcommand)

## 5. Documentation

- [x] 5.1 Update CLI reference documentation in `docs/cli/cli-reference.md`
      `docs/cli/cli-reference.md`: section `specd changes implementation`
      Approach: document `specd changes implementation start <name>` usage, options, examples, and lifecycle interaction
      (Req: Start subcommand)
