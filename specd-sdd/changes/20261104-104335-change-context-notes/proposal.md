# Proposal: change-context-notes

## Motivation

A failed verification audit can send a change back to implementation or design without preserving actionable context for the next agent session. Persist current notes independently of audit history so the next session can discover what needs repair and why automatic recovery occurred.

## Current behaviour

`TransitionedEvent` records actor, timestamp, source, and destination but has no reason. `Change` and the manifest have no current notes collection; GetStatus therefore cannot expose one. Existing computed review and validity diagnostics do not replace a durable user-selected repair summary or audit reference.

The aggregate has two lifecycle mutation paths: `transition()` for ordinary edges and `recover()` for recovery-only edges. `TransitionChange` reconciles before authorization, executes effects, reconciles again, and eventually invokes the aggregate within repository mutation. `ReconcileChangeValidity.persistConsequences()` applies new review/invalidation consequences and recovery inside a serialized mutation. Archive also calls `transition()` directly. A fix placed only in CLI or TransitionChange would miss other paths.

## Proposed solution

Persist a `notes` array directly on Change and its manifest. Each note has an automatically generated UUID v4, creation timestamp, existing ActorIdentity, text, and an optional automatic removal policy. GetStatus reads this collection directly, never reconstructing it from historical events.

Provide application use cases to add a note and remove one by ID, with complete CLI access. Notes can always be removed explicitly, even when they have an automatic policy. CLI removal accepts a unique UUID prefix for convenience; ambiguous or missing matches never remove an arbitrary note.

Separately add optional `reason` to transition input and the transitioned event. A reason alone is historical audit data. A separate CLI option requests creating a visible note from that reason, with its removal policy. Verification/compliance skills will deliberately request both when preserving repair context.

Automatic recovery also records its explanation and creates the appropriate current note. Centralize policy evaluation at actual aggregate lifecycle mutations, sharing the same logic across ordinary transition and recovery. No change to legal lifecycle edges, approval authority, verification attempt ownership, or hook sequencing is intended.

Simplify `review` to `{ required, affectedArtifacts }`, derived from current artifact facts. Move explanatory context to persisted notes and remove `review.reason`, `message`, `route`, and `overlapDetail`. Blockers and nextAction remain authoritative Core projections based on current validity, gates, topology, and policy; deleting notes never resolves review or changes permissions.

## Specs affected

### New specs

The user confirmed the following capability split and workspace placement. All listed specs are registered for the authorized design-to-ready execution.

- `core:note-auto-removal-policy`: own the typed automatic-removal policy, closed textual grammar, pure parser and shared runtime validation. Specify accepted rules/defaults, canonical policy comparison, typed errors, and reuse by CLI and direct use-case input validation.
  - Depends on: `core:change`, `core:workflow-topology`, `default:_global/error-handling-conventions`.
- `core:add-change-note`: add a validated note to an active change through serialized mutation, resolving the decorated actor and generating identity/time outside domain I/O.
  - Depends on: `core:change`, `core:note-auto-removal-policy`, `core:change-repository-port`, `core:actor-resolver-port`, `default:_global/architecture`.
- `core:remove-change-note`: resolve an exact ID or unambiguous prefix and remove the matching note atomically from an active change; define typed missing/ambiguous failures.
  - Depends on: `core:change`, `core:change-repository-port`, `default:_global/error-handling-conventions`.
- `core:list-change-notes`: ListChangeNotes returns current notes from the persisted change snapshot without history reconstruction or note mutation.
  - Depends on: `core:change`, `core:change-repository-port`.
- `core:get-change-note`: GetChangeNote selects a current note by exact ID or unambiguous prefix, with typed missing/ambiguous errors and no note mutation.
  - Depends on: `core:change`, `core:change-repository-port`, `default:_global/error-handling-conventions`.
- `cli:change-notes`: add/remove/list/show commands, policy input, note IDs and actionable errors; business rules delegated to Core. List exposes IDs for discovery and show exposes full note details, separately from text-only status notes.
  - Depends on: `core:add-change-note`, `core:remove-change-note`, `core:list-change-notes`, `core:get-change-note`, `core:note-auto-removal-policy`, `cli:entrypoint`, `cli:command-resource-naming`.

### Modified specs

- `core:actor-resolver-port`: add a stable pre-privacy actor ID to the resolved identity contract, so consumers compare actor IDs rather than provider-specific or masked fields.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:actor-resolver-privacy`: generate/preserve actor ID before obfuscation and retain it in hash, mask, anonymous and excluded-actor paths. Distinguish this ID derivation from existing configured-salt email hashing.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:actor-resolver`: ensure the composed resolution path supplies the same actor ID with or without privacy, independently of the active provider.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:change`: note shape and aggregate invariants, explicit add/remove, effective-hop cleanup, optional transitioned reason, shared handling for transition/recover.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:change-manifest`: notes snapshot and reason serialization, ISO timestamps, backward-compatible absent fields, preservation across restart and storage moves.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:transition-change`: optional reason and separately requested note; commit event, cleanup, and newly created note together only on successful hop.
  - Depends on (added): `core:note-auto-removal-policy`.
  - Depends on (removed): none.
- `core:transition-checks`: canonical reconciliation owns recovery explanations/notes, including new same-state findings, with idempotent persisted consequences.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:get-status`: expose text-only notes from the committed snapshot and the reduced review projection, independently of calculated blockers and routing; remove historical overlap detail reconstruction. Do not include note IDs, timestamps, actor or removal policies in the public status note projection.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:kernel`: expose and compose note mutation use cases through the standard Kernel entry point.
  - Depends on (added): `core:add-change-note`, `core:remove-change-note`, `core:list-change-notes`, `core:get-change-note` (placement confirmed; registration pending).
  - Depends on (removed): none.
- `core:lifecycle-engine`: reduce review to required/affectedArtifacts from present artifact states; remove event-derived explanations and cause-based routing/blocker branches. Derive routing and blockers from current validity facts instead of note presence or historical prose.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:archive-change`: pass structured overlap context to reconciliation so peer notes can be written without parsing historical messages; preserve the separate live archive overlap predicate.
  - Depends on (added): none.
  - Depends on (removed): none.
- `core:archive-repository-port`: commit the success-cleaned note snapshot and note audit in the staged archive manifest, restoring the original active snapshot on pre-commit failure and returning matching archived detail.
  - Depends on (added): none.
  - Depends on (removed): none.
- `cli:change-transition`: reason-only audit option and separate note creation/policy options; reject invalid combinations before mutation.
  - Depends on (added): `core:note-auto-removal-policy`.
  - Depends on (removed): none.
- `cli:change-status`: render only current note text in text, JSON and TOON output. IDs, timestamps, actor and removal policy belong in dedicated notes list/show commands, not status.
  - Depends on (added): none.
  - Depends on (removed): none.
- `skills:workflow-automation`: write audit/repair context when authorized to return from verification, read notes during orientation, preserve all existing user decision points.
  - Depends on (added): none.
  - Depends on (removed): none.
- `skills:skill-templates-source`: update actual source templates for verify/compliance producers and design/implement consumers, plus shared guidance and contracts.
  - Depends on (added): none.
  - Depends on (removed): none.

All sixteen modified specs and six new specs are registered. The pre-existing overlap on `core:change` with `implementation-snapshot` was explicitly accepted by the user. New-spec dependencies and additions for transition, CLI transition and Kernel are registered before spec authoring. Archive repository scope was added during design because its existing staged implementation reloads the disk manifest rather than serializing the supplied aggregate; archive-success cleanup must therefore be part of that repository commit contract.

The actor-ID agreement includes the three existing actor specifications listed above. Existing core:change and core:change-manifest scope also covers the domain/persisted actor shape. All relevant documentation is implementation scope under these capability contracts and the unchanged default:\_global/docs conventions; no new documentation-behavior capability is introduced. Reuse the shared input helper if the independently active CLI input work has already supplied it; do not undo that work or duplicate its implementation.

## Impact

### Measured reach

Graph queries on 2026-11-04 report:

| Target                         | Risk     | Direct dependents | Affected files |
| ------------------------------ | -------- | ----------------- | -------------- |
| `Change`                       | CRITICAL | 441               | 368            |
| `ReconcileChangeValidity` file | CRITICAL | 60                | 247            |

`Change` also has 2,257 indirect dependents and a hotspot score of 1,021. These are graph reach estimates, not an edit count. Preserve compatible optional inputs and defaults to avoid forcing changes throughout unrelated callers and fixtures.

The graph was reindexed before the final impact queries. It still reports CONTENT_KNOWN_STALE after indexing; `core:config` cannot materialize because adding a curated dependency would require force. Counts are advisory and were corroborated with targeted source inspection; do not overwrite that unrelated configuration metadata to implement notes.

### Minimum implementation surfaces

| Concern                      | Existing location                                                                                                                            | Required change                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain snapshot              | `packages/core/src/domain/entities/change.ts` (`ChangeProps`, constructor, getter, mutations)                                                | Store/copy notes; validate note data; expose safe reads; update `updatedAt` on real note mutations.                                                                                                                                                                                                                                                                                            |
| Transition audit and cleanup | Same file, `TransitionedEvent`, `transition()` around line 935, `recover()` around line 974                                                  | Add optional reason; share one effective-hop cleanup function; append new transition note after old-note cleanup.                                                                                                                                                                                                                                                                              |
| Manifest types/parser        | `packages/core/src/infrastructure/fs/manifest.ts`                                                                                            | Add note JSON shape, policy validation and optional reason in transitioned schema. Missing notes hydrate as empty.                                                                                                                                                                                                                                                                             |
| Hydration                    | `packages/core/src/infrastructure/fs/manifest-change-loader.ts`, plus aggregate construction in `change-repository.ts` around line 1467      | Carry notes through every construction path and deserialize optional reason.                                                                                                                                                                                                                                                                                                                   |
| Serialization                | `packages/core/src/infrastructure/fs/change-repository.ts`, `changeToManifest()`, `serializeEvent()`                                         | Persist current notes and event reason; explicit Date/ISO conversion.                                                                                                                                                                                                                                                                                                                          |
| Explicit transition          | `packages/core/src/application/use-cases/transition-change.ts`, final mutation around line 415                                               | Pass reason/note request through final successful commit; never add them during preflight.                                                                                                                                                                                                                                                                                                     |
| Automatic context            | `packages/core/src/application/use-cases/reconcile-change-validity.ts`, currently integrated through `persistConsequences()` around line 623 | Isolate note creation behind a dedicated operation called within the same consequence/recovery transaction; do not couple its contract to this helper or repeat notes on every observation.                                                                                                                                                                                                    |
| Add/remove API               | New use cases under `packages/core/src/application/use-cases/`                                                                               | Active-change-only serialized mutations, typed errors, actor/UUID/time dependencies as appropriate; matching public factories.                                                                                                                                                                                                                                                                 |
| Composition                  | `packages/core/src/composition/kernel.ts`, composition factories/resolver and export barrels                                                 | Mount both use cases using existing DI patterns; no second repository or actor-resolution path.                                                                                                                                                                                                                                                                                                |
| Status delivery              | `packages/core/src/application/use-cases/get-status.ts`, `packages/cli/src/commands/change/status.ts`                                        | Project only note text in public status output, including JSON/TOON; keep technical details in notes list/show and preserve computed review separately.                                                                                                                                                                                                                                        |
| CLI writes                   | `packages/cli/src/commands/change/transition.ts`, new notes command and command registration                                                 | Parse input and delegate; no manifest edits or local lifecycle decisions.                                                                                                                                                                                                                                                                                                                      |
| Skill behavior               | `packages/skills/templates/skills/specd-{new,verify,compliance,design,implement,archive}/SKILL.md.tpl`, shared template                      | Preserve user-decision stop points and terminal handoffs listed below. Replace review-derived routing/stopping with blockers and nextAction, keeping legal-target checks. Read notes for context. Edit source templates rather than installed skill copies.                                                                                                                                    |
| User documentation           | CLI help and all relevant existing CLI, Core/API, guide and skill documentation sources                                                      | Update every affected contract/example: actor IDs/privacy/legacy comparison, note commands and status projections, reason versus note, file/stdin input, policy grammar/validation, add deduplication, removal audit, no-op errors and recovery lifetimes. Discover covering existing specs and register required scope before downstream authoring; documentation is mandatory, not optional. |

Archive calls ordinary aggregate transitions at `archive-change.ts:526` (enter archiving) and `:1059` (restore archivable after failure). They inherit cleanup from the aggregate without a parallel cleanup implementation. Whether failed-archive recovery also produces a new note is a producer-policy question below.

Repository `mutate()` locks, loads fresh state, runs callback, compares `changeMutationStamp()`, persists when changed, and returns reconciled state. The stamp already serializes the entire manifest through `changeToManifest()`; including notes there makes note-only changes detectable. Preserve this property rather than depending on history length.

No external package is needed solely for UUID v4: composition can supply a standard platform UUID generator while the domain receives values and remains free of I/O. Exact dependency abstraction follows existing project conventions and belongs in design.

## Technical context

### Agreed model

```typescript
type NoteAutoRemoveRule =
  | {
      readonly on: 'enter-state' | 'leave-state'
      readonly states: 'all' | readonly ChangeState[]
      readonly direction?: 'forward' | 'backward' | 'redesign' | 'recovery' | 'any'
    }
  | {
      readonly on: 'operation-success'
      readonly operation: 'archive'
    }

interface NoteAutoRemoval {
  readonly anyOf: readonly NoteAutoRemoveRule[]
}

interface ChangeNote {
  readonly id: string // automatically generated UUID v4
  readonly at: Date // ISO 8601 in manifest JSON
  readonly by: ActorIdentity
  readonly text: string
  readonly autoRemove?: NoteAutoRemoval
}
```

The current collection is named `notes`. No existing field by that name was found in the aggregate or manifest. Existing actor identity is reused, including SYSTEM_ACTOR. UUID v7 and counters provide no necessary advantage here; timestamp is explicit. Removal accepts the full UUID or a unique prefix, never an ambiguous choice.

Without `autoRemove`, a note persists until explicitly removed. Automatic rules compare a real hop's destination (`enter-state`) or source (`leave-state`) against the configured states. Either manual or automatic transitions can trigger the rule. Origin filters, expiration clocks, first-entry special meaning, and history reconstruction are unnecessary for the agreed examples.

`autoRemove.anyOf` is a non-empty list of alternative conditions. A note is removed when any condition matches; multiple matches remove it once and append exactly one note-removed event. State rules accept `states: 'all'` instead of an explicit state array. For example, `autoRemove: { anyOf: [{ on: 'leave-state', states: 'all' }] }` removes the note on the next effective state transition. With all and the same direction filter, enter-state and leave-state have the same effect. The literal all cannot appear inside or be mixed with an explicit state array.

An omitted direction means any. Direction uses the existing workflow transition classification, never a guessed numeric ordering of states, and is independent of whether a human or an automatic operation triggered the hop. A forward-only rule does not match backward, redesign, or recovery edges. Failed transitions and no-ops never trigger state rules, and notes created by the transition are added after existing-note cleanup.

`operation-success: archive` matches successful archive completion, not entry into archiving, a retry, or rollback. This is an operation condition because successful archive is not a transition to a later lifecycle state. Apply cleanup and its audit events to the manifest snapshot committed to archived storage at the successful archive boundary; failed publication/archive or an incomplete restore must not consume this condition. Post-commit metadata/hook warnings do not undo an already completed archive. The implementation must preserve the existing commit/restore protocol and avoid a separate best-effort cleanup after moving the change.

### Where and when deletion happens

1. The use case validates its complete input before reconciliation, hooks, or any other effect, then authorizes the operation through existing lifecycle checks and hooks.
2. Inside the repository's serialized aggregate mutation, `transition()` or `recover()` first validates the actual edge. A rejected edge makes no note changes.
3. Shared domain logic evaluates the existing notes against the effective `from` and `to`, removing only matching policies. A self-transition/no-op performs no automatic removal.
4. Append the transitioned event, including optional reason; add any newly requested note after evaluating old notes. Use the same operation timestamp/actor where the note represents that operation.
5. Persist event and resulting notes in the same manifest write. Do not create a note in a separate follow-up AddChangeNote call after committing the transition.

A transition note is added only after an effective transition has succeeded in the aggregate, never before it or during preflight, hooks, rejected transitions, or application no-ops. Perform existing-note cleanup first, then add/deduplicate the requested transition note against the surviving collection. Persist all of this together: successful aggregate mutation alone must not leave a separately committed note if persistence of the transition fails. An independently committed automatic recovery may create its own note even when the subsequently requested transition fails; that failed request must not create its requested note.

The internal ordering is an implementation outline, not permission to weaken atomicity: invalid note input must be validated before any observable mutation, and failures must not persist partial cleanup. Both aggregate entry points must share the policy evaluator. Explicit RemoveChangeNote always bypasses retention restrictions because retention is an automatic-cleanup rule, not a deletion prohibition.

### Mandatory use-case input validation

All input entering a use case must be validated at the application boundary, regardless of whether the caller is CLI, SDK, MCP, another application operation, or a test. TypeScript types and CLI parsing do not replace runtime validation. This change applies that rule to the complete inputs of TransitionChange, AddChangeNote, and RemoveChangeNote, including existing transition fields and the new reason/note options. It does not expand this change into a repository-wide retrofit of unrelated use cases.

Validation runs before reconciliation (which can persist recovery), implementation-tracking refresh, hooks, actor resolution, or any mutation. Invalid input produces a typed, actionable error without side effects. Validate shape, field types, required values, supported values, unknown properties, and cross-field combinations. Domain entities additionally enforce their own invariants; application validation does not make direct aggregate calls exempt from validation.

The agreed transition input separates the historical reason from the optional request to create a note:

```typescript
{
  name: 'example-change',
  to: 'implementing',
  reason: 'Repair the issue documented in the audit',
  note: {
    autoRemove: {
      anyOf: [
        { on: 'leave-state', states: ['implementing'], direction: 'forward' },
        { on: 'enter-state', states: ['verifying', 'done', 'archivable'], direction: 'forward' },
      ],
    },
  },
}
```

- An absent `note` stores the reason only in the transitioned event.
- `note: {}` also creates a note with no automatic removal.
- `note: { autoRemove: ... }` creates a note with the specified policy.
- A supplied `note` requires a supplied string `reason` containing non-whitespace text. The note text comes from that reason; no independent transition-note text is accepted.
- A supplied `reason` must contain non-whitespace text after trimming, even when no note is requested.
- The user confirmed multiline note text is allowed, with outer trim and rejection of blank content, and no arbitrary 500-character cap. Preserve internal spaces and line breaks in storage, display and exact-text deduplication. Do not flatten notes to one line or introduce additional whitespace normalization.
- A supplied `autoRemove` must contain a non-empty anyOf array. Validate every rule by its on discriminator: state rules require states equal to the literal all or a non-empty, duplicate-free array of valid ChangeState values, and permit only the documented direction values; operation-success requires operation equal to archive. Reject arrays containing all, unknown properties, empty anyOf, and fields from another rule variant. Optional direction defaults to any.
- Independent AddChangeNote validates its complete input, including non-blank text and the same optional policy. UUID and creation timestamp are generated by the application rather than accepted as caller-controlled note identity.
- RemoveChangeNote validates its complete input, including the change name and a non-empty, syntactically valid UUID or supported UUID prefix. Unique-match resolution happens against fresh notes inside the serialized mutation; missing or ambiguous matches never delete anything.

CLI syntax and multiline text behavior are agreed below; independent note add reuses the same Core policy grammar. None can weaken the use-case boundary. Verify invalid inputs through direct use-case calls, not only CLI tests, and assert that reconciliation, hooks, refresh, and persistence are not invoked.

### Agreed transition CLI syntax

`changes transition <change> <target> --reason "..."` records only the historical reason. Add `--note` to also create a note using that reason. With no removal flag, `--note` maps to `note: {}` and has no automatic cleanup.

Use `--note-remove-on-enter verifying` or `--note-remove-on-leave designing` for a simple state rule; both accept all and require --note. Each simple flag maps to a rule inside autoRemove.anyOf; --note still requires a non-blank --reason. The later agreement on alternative conditions supersedes the earlier mutual-exclusion constraint as a model limitation. Combined policies use the repeatable syntax below. Parsing delegates to the same validated use-case input rather than introducing CLI-only business rules.

The user confirmed a repeatable `--note-remove` flag for combined policies. Each occurrence appends one alternative to anyOf:

```bash
--note-remove 'leave-state:designing,implementing:forward'
--note-remove 'enter-state:ready,verifying,done,archivable:forward'
--note-remove 'operation-success:archive'
```

State selectors accept a comma-separated list or the exclusive literal all; the optional direction segment defaults to any. Existing --note-remove-on-enter and --note-remove-on-leave remain equivalent single-rule shortcuts and may contribute alternatives to the same policy. Reject malformed rules, unknown states/directions/operations, empty components and mixtures of all with explicit states before use-case effects. All transition note-removal flags require --note and therefore a non-blank --reason. The same policy encoding is intended for independent note-add commands; exact add/remove command arguments and spelling of an optional manual removal reason remain to be settled.

#### Core-owned rule syntax and validation

The user explicitly requires the textual rule parser/validator to live in Core and be reused by CLI. CLI collects option values and calls that Core capability; it must not define a separate grammar, duplicate validation, or pass unchecked text for ad hoc interpretation. The pure Core parser has no shell/Commander dependency and returns typed NoteAutoRemoveRule values or typed, actionable syntax errors. Other adapters can reuse it.

The closed grammar is:

```text
enter-state:<states>[:<direction>]
leave-state:<states>[:<direction>]
operation-success:archive
```

States are valid ChangeState tokens separated by commas or the exclusive literal all. Direction is forward, backward, redesign, recovery or any; omission means any. Reject empty components, duplicate concrete states, unsupported tokens, additional segments, and all mixed with concrete states. Operation-success accepts only archive and no state or direction segment. For example, reject leave-state::forward, enter-state:all,ready, operation-success:archive:forward, and enter-state:verifying:invented. Each valid repeated flag produces one alternative in anyOf. Simple shortcuts must produce rules through the same Core validation contract.

This textual validation does not replace use-case boundary validation. Use cases independently validate the complete typed input, rule variants and cross-field constraints before any effects, including for callers that construct objects directly. Implement shared Core validation so the parser and object-input paths cannot diverge. Cover accepted grammar, rejected examples and zero effects on invalid input. The user requires this capability to have its own Core spec: core:note-auto-removal-policy, listed above. Core:change retains aggregate integration and lifecycle mutation invariants; CLI specs require delegation to the Core parser. Registration and dependencies must be completed before authoring the new spec, outside this proposal-only revision.

#### Note text from a file or stdin

The user confirmed the explicit input pattern already used by specs optimizations set:

```bash
changes notes add <change> --text "Note content"
changes notes add <change> --input note.md
cat note.md | changes notes add <change> --input -

changes transition <change> implementing --reason-input note.md --note
cat note.md | changes transition <change> implementing --reason-input - --note
```

Independent note add requires exactly one of --text and --input. Transition --reason and --reason-input are mutually exclusive; neither is required when no note is requested. With --note, the selected reason source must produce non-blank text. Reason-input without --note records only the historical reason. Read files/stdin as UTF-8 plain text, preserving multiline content, not as JSON/YAML payloads. Require explicit input selection rather than implicitly waiting for stdin.

Reuse helpers/read-stdin.ts:readStdin(). commands/spec/optimizations.ts:readInput() already maps '-' to that helper and other paths to readFile(path, 'utf8'); extract/reuse a shared CLI file-or-stdin reader instead of duplicating it. Do not adopt project update-metadata's implicit stdin selection or change its behavior here.

CLI owns source selection and I/O. Reject conflicting sources before reading; read failures must not invoke a mutating use case. Core validates the resulting text and policy before effects regardless of source. Policy parsing stays in Core; file/stdin I/O stays in the adapter. Cover files, stdin, multiline/empty content, conflicting sources and read errors. The earlier proposed --file/--stdin and --reason-file/--reason-stdin spellings are superseded by --input/--reason-input with '-' for stdin.

### Agreed note mutation audit

The user confirmed removal command syntax and the same reason-input convention as transitions:

```bash
changes notes remove <change> <id-or-unique-prefix>
changes notes remove <change> <id-or-unique-prefix> --reason "Captured in tasks"
changes notes remove <change> <id-or-unique-prefix> --reason-input removal-reason.md
cat removal-reason.md | changes notes remove <change> <id-or-unique-prefix> --reason-input -
```

--reason and --reason-input are mutually exclusive. Both are optional; omit them to generate the agreed manual-removal explanation. A supplied source must yield non-blank text. Reuse the same UTF-8 file/stdin reader, explicit '-' convention, conflict/read-error handling, and Core content validation as transition reasons. Validate and resolve the full ID or unambiguous prefix; ambiguous/missing matches remove nothing. The optional reason is audit context, not a modification to the note being removed.

Adding or removing a note appends an audit event in the same persisted mutation as the snapshot update:

- `note-added`: the complete note, operation actor, and timestamp.
- `note-removed`: note ID, operation actor, timestamp, removal kind (`manual` or `automatic`), and a human-readable reason. Both explicit removal and automatic cleanup are audited.

For explicit removal, RemoveChangeNote accepts an optional reason. If supplied, it must be a non-blank string after trimming and is validated before any effects; otherwise generate a description such as "Explicitly removed by actor". Automatic removal generates its explanation from the matched condition: source-state exit, destination-state entry (including direction when filtered), or successful archive completion. When multiple rules match, emit one removal event; its explanation may mention the matching conditions. Do not infer removal kind from prose or use these events for note reconstruction or deduplication. Manual CLI reason sources use the confirmed syntax above.

The persisted notes collection remains the sole source of current notes. Never replay these events or scan them to reconstruct notes for GetStatus. A transition that creates a note retains its transitioned reason and also records note-added; automatic cleanup records note-removed for each removed note. Exact event representation follows these agreed payloads in the downstream spec/design work.

### Agreed status and dedicated note inspection

The user confirmed status is a context surface for the agent: expose only the text of each current note, preserving multiline content. This applies equally to text, JSON and TOON status output. Do not expose note ID, timestamp, actor or autoRemove there. The full note remains persisted and available for deduplication and explicit inspection; omitting fields from status does not remove or change them in the aggregate/manifest.

Provide dedicated commands:

```bash
changes notes list <change>
changes notes show <change> <id-or-unique-prefix>
```

List lets users and agents discover the IDs needed for show/remove, with note text to identify entries and by containing the actor's name and email. Use the stored privacy-processed values, never the original hidden identity. Show exposes the complete selected note: ID, timestamp, actor (the stored privacy-processed identity, including actor ID), text and optional autoRemove. Resolve exact IDs or unambiguous prefixes and report missing/ambiguous selections rather than choosing arbitrarily. These are inspection commands, not note mutations; they must not create/remove notes or rebuild them from events.

The user confirmed two Core query use cases with dedicated specs: ListChangeNotes (core:list-change-notes) returns current notes from the persisted snapshot; GetChangeNote (core:get-change-note) selects one by exact ID or unambiguous prefix, failing on missing/ambiguous selection. CLI list/show delegates to them and only presents the result, with no manifest I/O or business logic in CLI. Validate complete query inputs at the application boundary and wire/export both through the standard composition/Kernel path. This proposal-only update adds no code or spec registrations.

### Agreed note actor attribution

- A note explicitly requested through CLI/use case uses the operation's resolved, privacy-decorated actor.
- Notes generated automatically for drift, overlap, recovery, or archive failure use SYSTEM_ACTOR, even when a human operation triggered detection.
- Explicit removal by ID attributes note-removed to the requesting operation actor.
- Automatic cleanup attributes note-removed to SYSTEM_ACTOR, even when a human requested the triggering transition.

The note's by field identifies its author; a removal event identifies the actor performing removal. Transition events retain their own actor independently. Do not overwrite a transition actor to match automatic note attribution, or modify the original note author when removing it.

### Autonomous notes and implicit add deduplication

Once created, a note is autonomous. It has no functional links to artifacts, invalidations, fingerprints, attempts, producer occurrences, or their changing values. References in text are only text. Resolving or changing a source problem does not update or remove a note; only explicit removal or its own autoRemove policy does so. Do not add occurrence keys, notification ledgers, or source references to the note model for deduplication.

The aggregate add-note operation compares the validated, trimmed text, author identity, and autoRemove policy against notes currently present in the collection:

- If all three match, return the existing note unchanged: preserve ID, timestamp, author, text and removal policy; do not touch updatedAt solely for this request and do not append another note-added event.
- If any of the three differs, create a distinct note with its own UUID, timestamp and lifecycle. Different removal policies are intentionally independent even for identical text and author.
- ID and creation timestamp do not participate in duplicate matching. Text comparison after trim remains exact: do not normalize casing or internal whitespace.
- Compare policy meaning rather than serialization order: anyOf rule order and state-array order are irrelevant; omitted direction equals any. Absent autoRemove is distinct from a supplied removal policy. Implement comparison consistently for every producer and the explicit add use case.
- For identities carrying the agreed stable pre-privacy ID, compare author IDs rather than display fields, metadata, or resolver/provider calls. Legacy identities without that ID require the explicit compatibility decision below; do not silently invent or derive an original ID from already-obfuscated values.

Deduplication examines only current notes, never audit events. After explicit or automatic deletion, a later genuine add request can create a new note with the same text/author/policy. No permanent suppression is retained. Recovery producers request notes only for an effective successful recovery, which cannot repeat at the same destination. Non-transition producers (new overlap consequences, new drift detection, or a newly failed archive attempt) may request notes for new facts; repeated status observation is not itself a request to add a note. This producer discipline does not link existing notes back to those facts.

### Stable actor ID before privacy

The user selected a deterministic ID computed from the original ActorIdentity before privacy transforms its visible fields. Keep ActorIdentity a serializable data contract with a dedicated id field; do not put this ID in metadata (which is filtered) or providerId (which privacy removes). Author comparison can then use the stored ID without reversing masking, consulting a provider, or adding methods to persisted actor objects. This is actor identity data, not a functional link from notes to their originating problems.

The agreed derivation is HMAC-SHA256 over a canonical representation of the original actor fields, using a canonical representation of the original name/email as the derived key. Include name, email, provider, providerId and metadata in the payload, excluding the newly derived id itself. Property order, including metadata keys, must not affect canonicalization. Changing any included field changes this representation ID; it identifies the full original actor representation, not necessarily a person whose profile changes. Formal canonical encoding, absent-field treatment and algorithm-version representation belong in the downstream contract and remain to be specified explicitly.

Canonicalization is mandatory for both the original actor payload and the derived name/email key used for ID generation, and for the legacy comparison fallback below. Sort object keys recursively, including metadata keys, so equivalent objects with different insertion order produce identical canonical bytes, derived keys and IDs. Plain JSON.stringify on an arbitrary input object is not sufficient. The user confirmed absent properties and properties with undefined values are equivalent: omit undefined-valued object properties recursively before canonical encoding. This preserves equality across JSON round trips. Use the same defined canonicalization contract across these paths; its exact implementation and algorithm-version representation still need to be specified. Tests must reorder top-level identity fields/nested metadata and compare absent-versus-undefined properties, asserting identical results.

For legacy persisted actors without id, the agreed fallback is SHA-256 of the canonical actor fields actually available in the manifest. Do not pretend this is the missing original pre-privacy ID or write it back into historical events. When both actors have IDs, compare those IDs. When either lacks an ID, compare canonical hashes of their persisted identity fields excluding id. This fallback compares available representations only: distinct actors whose legacy anonymous/masked fields are identical cannot be distinguished. Its result must not be used to infer or overwrite an original actor ID.

The user confirmed id is mandatory for every newly produced actor identity, including SYSTEM_ACTOR. Only legacy persisted identities may omit it. Resolution/finalization and new write paths must supply/preserve IDs consistently; hydration accepts historical missing IDs without fabricating pre-privacy identity or rewriting old events. The canonical persisted-field hash fallback is compatibility behavior, not permission to produce new actors without IDs.

The user confirmed the actor ID format `v1:<digest>`, where digest is the hexadecimal HMAC-SHA256 output. The v1 prefix identifies the canonicalization and derivation contract as a whole, not just the hash function. Preserve and compare the full versioned string. The legacy SHA-256 comparison fallback is not a generated v1 actor ID and must not be persisted as one. Freeze the exact canonical byte encoding in the downstream specification; no further choice of public ID format is pending.

No configured privacy.salt is required for this ID. Existing privacy.mode hash email transformation remains HMAC-SHA256 with its configured secret salt, as currently specified; do not replace that email-privacy mechanism with the new ID algorithm. The derived name/email key is private original input, not a random secret. Persisting the ID intentionally permits correlation of the same original representation even when displayed identity fields are anonymous; the user explicitly chose this behavior to avoid merging different original actors whose masked values coincide.

Verified current code/spec integration points:

- `packages/core/src/domain/entities/change.ts:ActorIdentity` currently requires name/email and has optional provider/providerId/metadata, with no ID. `core:actor-resolver-port` additionally permits empty email for providers without an email source; canonical derivation must support that valid input rather than requiring a configured email universally.
- `packages/core/src/composition/privacy-actor-resolver.ts:identity()` obtains raw identity from the inner resolver. ID derivation/preservation must occur before exclusion, anonymous return, masking, providerId removal or metadata filtering. Excluded actors retain their original identity fields, but the existing spec's raw-verbatim rule needs to accommodate the additional derived ID. Anonymous output must retain ID instead of returning only the static name/email.
- `packages/core/src/composition/composition-resolver.ts:getActorResolver()` currently wraps with PrivacyActorResolver only when privacy is configured. ID production must also cover the unwrapped path. Use a shared identity-finalization/derivation operation in composition; exact wiring must ensure one canonical algorithm for both paths without inventing a default privacy mode. Preserve a precomputed ID from this trusted finalization through privacy; do not recompute from masked output.
- `packages/core/src/infrastructure/vcs-actor-resolver.ts` currently projects the adapter identity to name/email/provider. Finalize the actual raw ActorIdentity returned by the actor resolution contract before privacy, and audit projection/copy paths so none silently discard the new ID. External provider and SYSTEM_ACTOR behavior must be covered; do not assume the privacy decorator is their only entry point.
- `packages/core/src/infrastructure/fs/manifest.ts:ManifestActorIdentity` and actorIdentitySchema currently enumerate the five actor fields. Add the dedicated id to both or Zod parsing may strip it. `manifest-change-loader.ts` generally forwards by/startedBy/completedBy objects; `change-repository.ts` serializes actor objects directly, and archive-repository.ts persists archivedBy. Verify all these round trips, including new notes and note audit events, preserve ID.
- `ArchiveChange._recordArchiveFailure()` currently constructs an actor containing only name/email. Audit and correct such narrowing copies where they would lose the actor ID, without changing the agreed SYSTEM_ACTOR attribution of automatically generated notes.

The actor resolver privacy specification currently requires providerId removal, metadata filtering, deterministic salted email hashing, static anonymous presentation, and excluded actors returned verbatim. The new dedicated ID must be explicitly reflected in those requirements rather than smuggled into optional metadata. No data migration may rewrite historical actors/events to fabricate pre-privacy identity.

Impact query for privacy-actor-resolver.ts reports CRITICAL risk, 14 direct dependents and 145 affected files (251 transitive dependents). This is reach rather than an edit count; the graph reported stale health, so treat these counts as advisory. Verify privacy, excluded/system identities, no-privacy composition, stable canonicalization, distinct raw actors with identical masked output, profile-field changes, and manifest/archive round trips. Only this proposal has been edited; implementation and scope registration remain pending.

For canonical recovery, the current `persistConsequences()` integration has the evaluated cause, review targets, actor and recovery. Invoke an isolated note-creation operation in that transaction after the effective hop, without making its contract depend on that particular helper. A recovery committed before a requested transition fails must retain its note. Newly detected same-state drift may add a note without calling `transition()`; existing applied-consequence checks are integration evidence, not the definition of note occurrence or deduplication. Deleting a note must not manufacture lifecycle movement or invalidate approvals/verification by itself.

### Required example

| Effective hop                                       | Verification repair note                                                                         | Drift note                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| verifying to implementing                           | Create, remove on forward exit from implementing or forward entry into verifying/done/archivable | Absent                                      |
| implementing to designing, automatic drift recovery | Preserve                                                                                         | Create, remove on forward design completion |
| designing to ready                                  | Preserve                                                                                         | Remove                                      |
| ready to implementing                               | Preserve                                                                                         | Absent                                      |
| implementing to verifying                           | Remove                                                                                           | Absent                                      |

The repair note contains audit path and actionable summary. The drift note explains the affected artifact/cause. Either can be removed by ID at any earlier point. Removal means a phase has consumed the context and addressed it or recorded the necessary artifacts/tasks, not proof that a subsequent verification or archive will succeed. A later failure creates a new occurrence and note. Optional implementing/verifying steps must not prevent cleanup: entry alternatives cover their advertised forward bypasses. No successful-verification trigger is introduced here.

### Agreed automatic recovery note policies

Use alternative exit and entry rules, even when redundant, so cleanup does not depend on visiting an optional phase. The following policy sets describe the current canonical lifecycle; evaluate actual hops with the change's sovereign topology/classification. Disabled states need not be visited for an entry alternative to match. Legacy drain states and enabled shortcuts must be covered by their advertised forward exits, without inventing intermediate transitions. All notes remain explicitly removable by ID.

For compactness, D denotes these OR conditions: forward leave designing; forward enter ready, implementing, verifying, done, or archivable. I denotes: forward leave implementing; forward enter verifying, done, or archivable. S denotes: forward leave done; forward enter archivable. These are explanatory shorthands for explicit anyOf rules, not new persisted policy identifiers. Add operation-success archive as a final alternative to each automatic policy so a permitted bypass through archive cannot strand a note.

| Producer / recovery                                                                        | Removal alternatives                                                                                                     | Context handoff                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artifact drift/review returning to designing                                               | D, or archive success                                                                                                    | Design captures the needed review/repair in artifacts and tasks before advancing.                                                                                                                                                                                            |
| Peer overlap returning to designing                                                        | D, or archive success                                                                                                    | Design incorporates the changed shared-spec context.                                                                                                                                                                                                                         |
| Stale/revoked spec approval returning to designing                                         | D, or archive success                                                                                                    | Design captures required revisions; approval eligibility remains enforced independently by the gate.                                                                                                                                                                         |
| Stale/revoked signoff returning to done                                                    | S, D, I, or archive success                                                                                              | Normal renewal advances from done; a detour into design/implementation can consume and hand off the repair context instead.                                                                                                                                                  |
| Failed archive, restored to archivable                                                     | D, I, or archive success                                                                                                 | Keep the note across archivable-to-archiving retries. A repair phase can consume it before the next attempt.                                                                                                                                                                 |
| Failed archive without a state change, including incomplete restore remaining in archiving | D, I, or archive success                                                                                                 | Preserve through retry/rollback and session restart; repair completion or successful archive consumes it.                                                                                                                                                                    |
| New drift/review/overlap consequence handled in place under preserve                       | Forward leave the phase handling the review, plus forward entry into its later completion boundaries, or archive success | Use the current handling phase: designing uses D; implementing uses I; verifying uses forward leave verifying or forward enter done/archivable; done uses S; archivable/archiving retain through the archive attempt unless D/I repair completion or archive success occurs. |

The same forward-only guards protect notes on automatic backwards recovery: moving to designing, done, or archivable is not completion merely because that destination appears in an entry rule. Evaluate existing notes before adding the new recovery/failure note. A commit failure with successful restore records a new failure note after recovery; a failed retry does not erase the prior note just by entering archiving. Distinct failures request notes, but matching text/author/policy reuses a currently present note under the implicit deduplication rule; different inputs or a previously removed note permit creation. Never infer this by scanning history.

### Compatibility and boundaries

#### Agreed review simplification and overlap migration

The user explicitly approved reducing review to `required` and `affectedArtifacts`. Notes carry explanatory context and concrete work for the LLM; blockers and nextAction remain machine-authoritative. Remove the public review fields reason, message, route and overlapDetail and update consumers, tests, help and skill templates together. This is a public projection shape change, not just a presentation cleanup.

`packages/core/src/domain/services/lifecycle-verdict.ts:deriveReview()` currently scans history twice: it finds the last invalidated event to narrow affected artifacts, and calls `collectUnhandledOverlaps()` to reconstruct overlap details. Replace both with present artifact facts and list all outstanding review artifacts. Delete `collectUnhandledOverlaps()`, which currently extracts archived change names/spec IDs using regex over event messages and stops at a transition whose destination is not designing. No history backfill or equivalent scan through notes is introduced.

`reviewBlockersFromSummary()` currently switches on review.reason, including an overlap-specific absence of review blockers. Rework it against current drift/review facts and shared validity checks; retain the distinction from the live `spec.overlap` archive predicate. `resolveLifecycleNextHop()` currently has a special overlap branch and reads review.route/message: remove that dependency and preserve policy-aware routing through current validity, including preserve-in-place versus redesign. In `packages/core/src/application/services/lifecycle-guidance.ts`, review.required remains an existing operational signal in this change. Introduce no new dependency on review.required for routing or stopping, in Core, CLI, skills, or other consumers. In particular, do not replace removed review.reason branches with new review.required branches. Skill routing and routing-related stops use canonical blockers and nextAction; legal-target checks still use lifecycle.availableTransitions. Cause explanation belongs in notes.

`GetStatus._projectReview()` and CLI status must stop copying/rendering removed fields. CLI currently filters OVERLAP_CONFLICT when review.reason is spec-overlap-conflict: remove that local reinterpretation and render Core blockers directly. Live archive overlap remains an independent check; a peer invalidation note is not a bypassable archive blocker. Update specd-new, design, implement, verify, archive and shared instructions that currently inspect review.reason or review.route to read notes as context and use nextAction for routing.

Archive `_invalidateOverlappingChanges()` already has structured causative change name and shared spec IDs but flattens them into intent.reason. Carry these data to reconciliation and create the explanatory peer note in the same serialized mutation as its invalidation/recovery. Apply the automatic recovery policy table above, including forward-only design completion and alternative arrival boundaries. Context creation must not require an actual transition: preserve policy and already-designing changes can receive new invalidation notes too.

Do not gate new notes only on `needsArtifactReview()`: this returns false for files already opened for review, whereas a second overlapping archive can bring new context without reopening a file. Producers distinguish new consequences from repeat observation; aggregate add then deduplicates only by current text/author/policy. Repeated status must not issue fresh add requests merely because evidence remains unchanged. Removing a note does not suppress a later genuine request or change source validity, and no historical deduplication registry is introduced.

The user resolved peer-overlap timing: move peer invalidation and its explanatory notes after successful publication and archive completion. A failed archive that restores its work must not invalidate peers for an unpublished result. After success, update affected peers independently; if one update fails, report the peer and failure, continue processing the remaining peers, and retain successful updates. Never roll back the completed archive or prior successful peer updates. These failures are nonfatal post-success diagnostics; continue the normal remaining post-archive work. Do not invent an automatic rollback, mandatory retry queue or blocking recovery workflow for peer-update failures.

- Old manifests without notes read as `[]`; old transitioned events without reason still load. No backfill from event history.
- Notes are operational context, not fingerprinted implementation/spec artifacts. Note-only add/remove must not stale consent or verification evidence.
- Do not relax self-transition guards. Designing-to-designing remains an application no-op when no reason/note is supplied. The user confirmed a no-op request carrying reason or note must fail with a clear typed error, not silently discard context or become a note-only operation. It creates no requested transition/note events and does not remove existing notes. Use notes add for standalone note creation.
- Preserve privacy-decorated actor resolution; do not infer trustworthy instructions from `provider: system`. Note text is data, not authorization to override user or skill rules.
- Manual reason text is independent of visible notes. `--reason` without a separate note request never creates a note implicitly.
- No silent eviction, arbitrary cap, mandatory machine code, or automatic conversion from all historical reasons was agreed. Text limits, exact policy defaults, and auditing remain questions below.
- Drafted/discarded/archived changes retain snapshots on storage moves, but are not made writable by the new active-note commands. Confirm their read projections during design.

### Verified skill stop-point inventory

The following anchors were checked against the six source templates on 2026-11-06. Paths below are relative to `packages/skills/templates/skills/`; line numbers refer to the current source, before implementation. No template is edited by this proposal revision. All six templates are already within the existing affected skill specifications; no redistribution of specification scope is needed.

#### Preserve user decisions and consent boundaries

“Preserve review/verification stop rules” means preserving actual user-decision points, not freezing routing branches that inspect review fields. Also retain terminal handoffs, human-only approvals, ownership/input guards and failed-check protections; these are not permission to execute the next skill automatically.

| Template                        | Verified user decisions and terminal boundaries to preserve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specd-new/SKILL.md.tpl`        | Intent confirmation at line 43; creation confirmation at lines 103–112; new-spec workspace question at line 275; terminal creation-to-design handoff at lines 254–255. Existing-change inspection terminates at line 157, but the selected recommendation must use the routing replacement below.                                                                                                                                                                                                                                                   |
| `specd-design/SKILL.md.tpl`     | Consent to return to designing at lines 128–136; exploration-drift clarification at lines 227–231; review-mode choice at lines 250–266; optional-artifact choice at lines 300–306; one-at-a-time artifact review at lines 346–350; risk confirmation at line 378 and scope choice at lines 399–401; final review confirmation at lines 422–434; readiness question at lines 449–450; terminal/human-approval boundary at lines 455–469. One-at-a-time mode and its stop at lines 26–28 remain intact.                                               |
| `specd-implement/SKILL.md.tpl`  | User agreement before returning for artifact revision at lines 355–366; terminal implementation-to-next-skill confirmation boundary at lines 330–337. The human spec-approval wait at lines 85–90 remains human-only. It is not an overlap-context or review.required stop.                                                                                                                                                                                                                                                                         |
| `specd-verify/SKILL.md.tpl`     | Verification-mode choice at lines 139–148; full-audit findings decision (Update Specs / Fix Implementation / Both / Proceed) and clean-audit Proceed / Review Results choice at lines 287–305; user agreement to revise artifacts at lines 456–467; human signoff and terminal confirmation boundary at lines 422–428. After an authorized repair choice, the selected transition is where the new --reason and separate note request preserve the audit path and chosen repair. The existing template does not yet pass transition --reason there. |
| `specd-archive/SKILL.md.tpl`    | Explicit archive consent at lines 85–92; live-overlap proceed/abort choice at lines 212–224; explicit confirmation for out-of-scope sidecar maintenance at lines 233–237; agreement to return for artifact revision at lines 295–306; terminal handoff at lines 278–279. These consent boundaries are distinct from automatic review-based redirects.                                                                                                                                                                                               |
| `specd-compliance/SKILL.md.tpl` | Change selection at line 25 and lines 196–198. There is no post-audit Update Specs / Fix Implementation / Both / Proceed choice or lifecycle-transition branch in this template. That user choice belongs to specd-verify when compliance is delegated. Preserve standalone/delegated/report-only ownership at lines 98–140; invalid invocation and missing-spec stops at lines 55 and 163 are validation guards, not user decisions. Do not invent a new compliance decision/transition flow.                                                      |

#### Replace review-derived routing with blockers and nextAction

These are routing conditions or work-selection conditions, not independent user consent. Remove the review.reason/review.route dependencies and the review.required-only routing/stopping branches. Read notes to understand the issue; use current blockers and nextAction to determine the canonical response, respecting advertised legal targets. Preserve a terminal stop after an appropriate redirect without preserving its obsolete review-based trigger.

| Template                        | Verified routing/work-selection sites to update                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specd-new/SKILL.md.tpl`        | Overlap redirect at lines 136–138 and unconditional review.required-to-design branch at lines 140–144. Both existing-change paths must select their recommendation from blockers/nextAction, rather than checking review.required first. Retain the inspection terminal boundary at line 157.                                                                                                       |
| `specd-design/SKILL.md.tpl`     | Overlap redirect at lines 46–47; review-mode selection and reason-dependent inspection at lines 79–89 and 234. Select work from canonical blockers/nextAction and current affected artifact facts, with notes supplying context. The in-place review routing at lines 124–126 remains policy-aware; the separate consent question at lines 128–136 is preserved.                                    |
| `specd-implement/SKILL.md.tpl`  | Overlap redirect at lines 25–26 and review.required guardrail at lines 375–378. Follow canonical blockers/nextAction for preserve-in-place versus design recovery, not a blanket design redirect or a new review.required branch. Existing wrong-skill/gate and failed-transition redirects at lines 80–90 and 346–351 remain bounded by their actual blockers.                                     |
| `specd-verify/SKILL.md.tpl`     | Overlap redirect at lines 25–27, review.required recovery branch at lines 71–78, and guardrail at lines 473–475. Failure routing at lines 312–343 still reloads status and follows canonical recovery/advertised targets; it must not infer a design hop from review fields. Keep the user choice at lines 287–305 before acting and the no-successful-completion-on-failure rule at lines 345–346. |
| `specd-archive/SKILL.md.tpl`    | Overlap-cause redirect at lines 30–31, blanket review.required stop at lines 62–66, and duplicate guardrail at lines 312–313. Replace these triggers with canonical blockers/nextAction, preserving archive eligibility and the consent points above.                                                                                                                                               |
| `specd-compliance/SKILL.md.tpl` | No review.reason or review.required routing branch exists. The stale-consent redirect at lines 119–121 follows canonical status; keep that authority and do not add review-derived routing or a new post-audit consent flow.                                                                                                                                                                        |

### Future work boundary

This change is implemented before a later checks cleanup and retains its full current scope, including the reduced review shape and removal of historical explanation reconstruction. The later cleanup will make review.required informational only, with step blocking decided by workflow.requires, and will represent notes as a reconcile consequence type (for example ctx.apply.addNote). Do not design or implement that cleanup here. Avoid decisions that obstruct it: keep note creation isolated from the particular persistConsequences helper while preserving atomic application with the current reconcile transaction.

### Verification focus

The user confirmed all relevant documentation must be updated. Review CLI help, CLI command pages, Core/API and actor/privacy documentation, changes/workflow guides, and source skill/shared instructions for affected contracts and examples. Cover add/remove/list/show, text-only status, direct/file/stdin sources, policy grammar and anyOf/direction/archive-success semantics, deduplication, actor ID generation/legacy behavior, audit events and no-op rejection. Locate the existing specs governing affected documentation and add only the necessary scope before authoring; this is a required implementation/design follow-up, not an unresolved product choice. Keep generated documentation aligned through the normal generation workflow rather than editing generated outputs as independent truth.

Exercise the complete agreed sequence across process reloads; reason-only versus reason-plus-note; manual removal for both retention modes; prefix ambiguity/missing ID; real versus no-op/failed edges; every aggregate lifecycle entry point; simultaneous cleanup and new-note insertion; same-state drift idempotence; recovery committed before requested-hop failure; old-manifest round trips; note-only writes detected by the mutation stamp; concurrent add/remove under repository lock; and unchanged approval/verification fingerprints. Add CLI integration and rendered skill-contract coverage at the relevant layers.

Cover states all for both state-rule variants and direction filtering; non-empty anyOf and rule-variant validation; one removal/event when multiple rules match; optional implementing/verifying bypasses; backward/redesign/recovery preservation; successful archive snapshot cleanup versus failed archive/restore preservation; and newly added-note preservation. Include manifest round trips and invalid arrays containing all.

Verify implicit deduplication across explicit and automatic producers: matching text/author/policy returns the same ID with no note-added event or note-only updatedAt change; different authors or policies create separate notes; reordered policy rules/states and omitted-versus-any direction match; removal permits subsequent recreation. Verify successful-transition cleanup precedes lookup/add, a failed/no-op transition creates no requested note, and persistence failures do not commit a detached note. Existing recovery notes remain committed when a subsequent requested hop fails.

## Open questions

The resolved items below record decisions already supplied by the user; they are not new questions or permission to advance. The remaining open items require resolution before writing specs/design/tasks. This revision changes only the proposal and leaves lifecycle, registrations, templates, specs and code untouched.

### Resolved by the current clarification

- Peer overlap timing is resolved: invalidate/note affected peers only after archive success; report individual update failures, continue with remaining peers and normal post-archive work, and never roll back the completed archive or successful peer updates.
- Status presentation is resolved: only note text appears in text/JSON/TOON status, with no note ID, timestamp, author or autoRemove. Dedicated changes notes list shows IDs/text and by with stored actor name/email; changes notes show exposes the full stored note. Actor data remains privacy-processed and persisted for comparison, audit and detail inspection.
- Actor identity decisions are resolved: pre-privacy derivation, v1:<hexadecimal HMAC-SHA256 digest> format, mandatory IDs on new actors including SYSTEM_ACTOR, legacy missing-ID canonical-hash comparison, recursive key-order independence, and absent/undefined equivalence. Freeze exact canonical byte encoding downstream and register the three affected actor specs before downstream authoring. Do not fabricate original IDs for historical masked actors.
- Question 4 (automatic producer set, retention, attribution and deduplication) is resolved as specified above. Aggregate add deduplicates by exact trimmed text, author and semantically equal autoRemove among current notes; no event scan, occurrence linkage or permanent notification ledger. Transition-note creation happens only after successful effective transition/cleanup in the same atomic commit. Actor comparison uses the versioned ID and agreed legacy fallback.
- Question 3 (note mutation auditing) is resolved: note-added includes complete note/actor/time; note-removed includes ID/actor/time, manual-or-automatic removal kind, and a human-readable reason. Explicit removal accepts an optional validated reason with a generated default; automatic removal explains the matched condition. Record events atomically with the snapshot; do not reconstruct notes or deduplicate from events.
- Question 2 (CLI syntax and default retention) is resolved: --reason/--reason-input, separate --note, simple --note-remove-on-enter/--note-remove-on-leave shortcuts, repeatable --note-remove for alternative conditions, and no automatic removal by default. Independent add uses --text/--input and the same policy grammar; removal accepts an ID/prefix and optional --reason/--reason-input. The subsequent anyOf agreement supersedes the earlier mutual exclusion of enter/leave rules.
- Question 1 (new spec placement) is resolved: the user confirmed `core:add-change-note`, `core:remove-change-note`, and `cli:change-notes`. Register these specs, their listed dependencies, and the two new dependencies on core:kernel before downstream authoring; do not perform those writes during proposal-only revisions.
- Scope and sequencing are settled: keep the current affected-specification distribution and the complete review simplification, including deletion of collectUnhandledOverlaps() and removal of review.reason/message/route/overlapDetail.
- Stop-point ambiguity is resolved by the verified inventory above: preserve user decisions, consent and terminal boundaries; replace review-derived routing/stopping with blockers/nextAction. The full-audit user choice is in specd-verify, not specd-compliance.
- review.required remains an existing operational lifecycle-guidance signal for this change; no new routing or stop dependencies may be introduced on it.
- The future-work boundary is explicit above and is not an implementation requirement for this change.

### Still open

No user-facing product questions remain from this review. Required follow-up before downstream authoring is mechanical scope/dependency registration and formalizing implementation details consistently with the decisions above; it does not authorize writing further artifacts or advancing lifecycle during this proposal-only revision.
