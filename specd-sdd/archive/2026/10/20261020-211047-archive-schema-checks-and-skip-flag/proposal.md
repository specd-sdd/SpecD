# Proposal: archive-schema-checks-and-skip-flag

## Motivation

`changes archive` is the only lifecycle operation that does not resolve its checks through the shared cascade. A schema cannot declare, configure or disable checks for the archive operation, `changes archive` does not accept the `--skip-checks <id>` flag that `changes status` advertises for archive blockers, and skippability is hard-wired to two bespoke flags. Hosts and schema authors therefore cannot extend archive the way they extend transitions, and the CLI and status output disagree about what archive accepts.

## Current behaviour

- Schema workflow rows support `checks` (evaluated when entering a step, `scope: 'transition'`) and `skipChecks` (evaluated when bypassing an optional step, `scope: 'step-skip'`). There is no declaration for the archive operation (`scope: 'archive'`).
- `ArchiveChange` (`packages/core/src/application/use-cases/archive-change.ts`) executes the static `_archiveBindings` built from `ARCHIVE_BINDING_SPECS` (`packages/core/src/domain/services/check-bindings.ts`) directly. It never calls `resolveEffectiveBindings`, so schema overlays and governance locks (`allowBindingOverride`, `allowConfigOverride`, `allowDisable`) do not apply.
- Plugin bindings with `scope: 'archive'` are already appended at composition (`composition/use-cases/workflow-check-registry.ts`), but a schema cannot configure or disable them.
- `changes archive` only exposes `--allow-overlap` and `--allow-out-of-scope`; `ArchiveChangeInput` carries them as `allowOverlap` and `allowOutOfScope` and core maps them to `spec.overlap` and `impl.linksInScope`, unlike `TransitionChange`, whose input accepts only `skipChecks` while the CLI translates the aliases. Its error text says "Use --allow-overlap to proceed despite overlap."
- `changes status` advertises `--skip-checks <id>` for archive blockers (`get-status.ts`), which `changes archive` rejects. `changes transition` validates `--skip-checks` against resolved-binding skippability; archive does not.

## Proposed solution

Make archive a first-class consumer of the existing check cascade, with no new built-in skippable check.

1. **Schema grammar.** Add `archiveChecks` to the workflow row `step: archiving`, sibling of `checks` and `skipChecks`. Each entry has `id`, `skippable`, `disabled` and `config`; there is no `onFailure`, because archive predicates have no abort/collect distinction today (every predicate is evaluated and the first failure is thrown). It is valid only on `archiving`; on any other step it fails with `SchemaValidationError`. Schema merge, `schemaOverrides` and governance validation in `build-schema.ts` treat it like `skipChecks`.
2. **Resolution.** `resolveEffectiveBindings` gains an archive overlay (`operation: 'archive'`) that applies `archiveChecks` to `scope: 'archive'` bindings and synthesizes bindings for plugin checks embedded by the schema. The three overlays (`checks`, `skipChecks`, `archiveChecks`) share one parameterized helper. `ArchiveChange` resolves its bindings through it on every run, with the check registry.
3. **Generic skip.** `ArchiveChangeInput` gains `skipChecks`. `changes archive --skip-checks <id>` (repeatable or comma-separated) is validated against the resolved bindings exactly as in `transition`: an unregistered id raises `UnknownCheckError`, and a non-skippable or effect (hook) id raises `CheckNotSkippableError`, both with the same exit code as in `transition`.
4. **Aliases live in the host.** `ArchiveChangeInput` drops `allowOverlap` and `allowOutOfScope`, exactly as `TransitionChange` already does: the use case accepts only `skipChecks`. The CLI, as host, keeps `--allow-overlap` and `--allow-out-of-scope` and translates them into the ids `spec.overlap` and `impl.linksInScope` before calling the use case. They are strict: if the resolved binding is not skippable they fail with `CheckNotSkippableError` instead of silently skipping. Overlap invalidation of peer changes runs when `spec.overlap` is effectively skipped, so `--skip-checks spec.overlap` equals `--allow-overlap`.
5. **Governance of built-in archive checks.** The skippable set does not grow: only `spec.overlap` and `impl.linksInScope` are skippable by default. On archive rows, `workspace.readOnly`, `impl.filesResolved` and `deps.consistent` become fully locked (`allowBindingOverride: false`, `allowConfigOverride: false`, `allowDisable: false`, `skippable: false`), joining `schema.nameMatch`, `archive.archivable`, `workflow.taskCompletion`, `verification.current`, `hook.pre` and `hook.post`. `readOnly` is a security boundary, resolved implementation is required for a valid archive, and inconsistent dependencies would leave an invalid spec. Only `spec.overlap`, `impl.linksInScope` and plugin checks can be configured or disabled by a schema on archive. Transition rows keep their current locks.
6. **Status and messages.** `changes status` computes archive bypass hints from the same resolved bindings and offers `--skip-checks <id>` only for skippable ones, so the hint always matches what `changes archive` accepts. CLI error text changes to "Use --skip-checks spec.overlap".
7. **Hosts.** No new API: a host registers an archive check with `registerCheck(..., [{ scope: 'archive', skippable: true }], governance)`, and a schema can tune or embed it through `archiveChecks`. See **Usage examples** below.

## Usage examples

### A. Host registers a custom archive check (TypeScript)

```ts
const kernel = await createKernelBuilder(config)
  .registerCheck('security', securityScanCheck, [{ scope: 'archive', skippable: true }], {
    allowBindingOverride: true,
    allowConfigOverride: true,
    allowDisable: true,
    defaultConfig: { minSeverity: 'high' },
  })
  .build()
```

Equivalent via `createKernel` options:

```ts
const kernel = await createKernel(config, {
  checks: [
    {
      pluginName: 'security',
      check: securityScanCheck,
      defaultBindings: [
        {
          id: '@security.code-scan',
          applicability: [{ scope: 'archive' }],
          skippable: true,
        },
      ],
    },
  ],
})
```

### B. Schema tunes or embeds custom checks on archive

`archiveChecks` lives on the `step: archiving` row, next to `checks` and `skipChecks`:

```yaml
workflow:
  - step: archiving
    archiveChecks:
      - id: '@security.code-scan' # registered by the host (example A)
        skippable: true
        config:
          minSeverity: critical # deep-merged over defaultConfig
      - id: '@qa.extended-lint'
        disabled: true # removed from archive when allowDisable permits
```

The same block works from a project override:

```yaml
schemaOverrides:
  append:
    workflow:
      - step: archiving
        archiveChecks:
          - id: '@security.code-scan'
            config:
              minSeverity: medium
```

### C. Schema tunes core archive checks

Only the two unlocked core checks accept changes:

```yaml
workflow:
  - step: archiving
    archiveChecks:
      - id: spec.overlap
        skippable: false # this project never archives over live overlap
      - id: impl.linksInScope
        disabled: true # this project never archives out-of-scope links
```

### D. Rejected declarations (locked core checks)

```yaml
workflow:
  - step: archiving
    archiveChecks:
      - id: workspace.readOnly
        disabled: true # CheckDisableForbiddenError
      - id: impl.filesResolved
        skippable: true # CheckBindingOverrideForbiddenError
      - id: deps.consistent
        skippable: true # CheckBindingOverrideForbiddenError
  - step: implementing
    archiveChecks: # SchemaValidationError: only valid on `archiving`
      - id: spec.overlap
```

### E. CLI

```bash
# Generic skip, validated against resolved bindings
specd changes archive my-change --skip-checks spec.overlap
specd changes archive my-change --skip-checks spec.overlap,impl.linksInScope
specd changes archive my-change --skip-checks spec.overlap --skip-checks '@security.code-scan'

# Aliases (strict): identical to the two commands above
specd changes archive my-change --allow-overlap          # == --skip-checks spec.overlap
specd changes archive my-change --allow-out-of-scope     # == --skip-checks impl.linksInScope

# Rejected: CheckNotSkippableError (same exit code as transition)
specd changes archive my-change --skip-checks workspace.readOnly
```

Status hint, derived from the resolved bindings. The blocker's bypass flag is only the flag (`--skip-checks spec.overlap`), and it appears only for skippable ids; the next-action reason reads "<message> Use --skip-checks spec.overlap to archive anyway." When the resolved binding is not skippable (for example `skippable: false` on `spec.overlap` in the schema), no bypass flag is offered.

## Specs affected

### New specs

None.

### Modified specs

- `core:archive-change`: archive resolves bindings through `resolveEffectiveBindings`; `skipChecks` input validated against resolved skippability; `allowOverlap` and `allowOutOfScope` are removed from the input (breaking for SDK callers, same contract as `TransitionChange`); overlap invalidation keyed on `spec.overlap` being skipped.
  - Depends on (added): core:check-registry
  - Depends on (removed): none
- `core:check-registry`: archive scope in the overlay and governance model; archive-row locks for `workspace.readOnly`, `impl.filesResolved`, `deps.consistent`; host registration of `scope: 'archive'` bindings is tunable by schema.
  - Depends on (added): core:schema-format
  - Depends on (removed): none
- `core:schema-format`: complete the list of options a `workflow` row accepts (`optional`, `disabled`, `checks`, `skipChecks`, which the spec did not list) and add `archiveChecks` (only on `archiving`, no `onFailure`, strict keys). Option grammar only; check behaviour stays in the workflow and check specs.
  - Depends on (added): none
  - Depends on (removed): none
- `core:workflow-model`: `archiveChecks` joins `checks` and `skipChecks` as a workflow step declaration (only on `archiving`, no `onFailure`); existence, coordinate uniqueness, governance-lock and archive-step-only validation rules cover it.
  - Depends on (added): none
  - Depends on (removed): none
- `core:transition-checks`: archive operation evaluation uses the shared cascade; projections of archive bypass come from resolved bindings.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-archive`: `--skip-checks <id>`; the CLI host translates `--allow-overlap` and `--allow-out-of-scope` into `skipChecks` ids (strict); updated error text and exit codes.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-status`: archive bypass hints derived from resolved bindings, only for skippable checks.
  - Depends on (added): none
  - Depends on (removed): none

- `core:kernel`: the per-call override table lists `skipChecks` for `ArchiveChange` and `TransitionChange` and drops `allowOverlap` and `allowOutOfScope`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-status`: for `archivable` changes, archive predicates come from the effective archive bindings (schema `archiveChecks` included), and `bypassFlag` appears only for skippable resolved bindings.
  - Depends on (added): none
  - Depends on (removed): none
- `core:lifecycle-engine`: verify only; the bypass scenario names `skipChecks` instead of the `--allow-overlap` flag.
  - Depends on (added): none
  - Depends on (removed): none
- `core:change`: the `spec-overlap-conflict` reason no longer cites `allowOverlap: true`; it says `spec.overlap` was bypassed.
  - Depends on (added): none
  - Depends on (removed): none
- `skills:skill-templates-source`: the archive skill teaches the canonical `--skip-checks <checkId>` shown by status, with `--allow-*` only as aliases, and names the never-bypassable archive checks.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Core:** `domain/services/transition-checks.ts` (`resolveEffectiveBindings`, input type), `domain/services/check-bindings.ts` (`ARCHIVE_BINDING_SPECS` locks), `domain/value-objects/workflow-step.ts` (new declaration type and `archiveChecks`), `domain/services/build-schema.ts` (governance validation next to lines 843 and 912), `infrastructure/schema-yaml-parser.ts` (Zod schema), schema merge, `application/use-cases/archive-change.ts` and its composition (registry injection, as in `TransitionChange`), `application/use-cases/get-status.ts` (archive hints, ~L971-1030).
- **CLI:** `packages/cli/src/commands/change/archive.ts` (flags, error text).
- **Docs and guides:** `docs/schemas/schema-format.md`, `docs/core/custom-checks.md`, `docs/guide/custom-schemas.md`, `docs/guide/workflow.md`, `docs/cli/cli-reference.md`, addendum to `docs/adr/0030-open-check-registry-and-hook-failure-policies.md`, regenerated `packages/guide` content, `packages/skills/templates/skills/specd-archive/SKILL.md.tpl` (and other templates mentioning `--allow-*`).
- **Release:** changeset, minor for `@specd/core` and `@specd/cli`. `@specd/schema-std` is unchanged (grammar addition, no default `archiveChecks`).
- **Breaking change:** `ArchiveChangeInput.allowOverlap` and `allowOutOfScope` are removed. Known callers: `packages/cli/src/commands/change/archive.ts`; the SDK and MCP packages do not reference them. The changeset for `@specd/core` records the removal.
- **Compatibility:** no live schema or config in the repo relaxes the locked checks on archive (the only matches are archived deltas). Tightening is therefore safe here, but external schemas that disable or make those checks skippable on archive would start failing schema build with `CheckDisableForbiddenError` or `CheckBindingOverrideForbiddenError`.
- **Overlap with peers:** `report-overlap-dependency-changes` (designing) touches `core:archive-change`, `cli:change-archive`, `cli:change-status`, `core:get-status`, `core:lifecycle-engine`, `core:change`; `fingerprint-issues-non-blocking` (drafting) touches `cli:change-status`, `core:get-status`, `core:change`; `implementation-snapshot` (designing) touches `core:change`. This change keeps the overlap reporting contract intact and only alters how the skip is decided. Delta conflicts are possible; archive order or `--allow-overlap` will need coordination.

## Technical context

Decisions agreed with the user:

- One single change, not a bugfix plus a feature: `--skip-checks` only makes sense once skippability comes from resolved bindings.
- Syntax: `archiveChecks` on the `archiving` row (rejected: a top-level `archive:` block, which breaks symmetry with `checks`/`skipChecks`). Rejected also: `scope: archive` on `checks`, ambiguous with `from`/`along`.
- Aliases are strict and live in the CLI host. The use case input drops `allowOverlap` and `allowOutOfScope` (decided with the user: "lo que hagamos lo hacemos bien"), matching `TransitionChange`, whose spec already forbids ad-hoc bypass booleans.
- Documentation goes in an addendum to ADR 0030, not a new ADR.
- The set of skippable built-in checks does not grow. `workspace.readOnly` is a security boundary and cannot be skipped or disabled on archive; `impl.filesResolved` and `deps.consistent` must hold for a valid archive and are locked too. `impl.linksInScope` stays skippable via `--allow-out-of-scope`.
- Checks on the `archiving` step's `checks` apply to entering `archiving`, not to the archive operation; this remains true.

Constraints found: governance locks are monotonic (schema layers can never relax a lock), plugin archive bindings are already composed, and `resolveEffectiveBindings` is the only place step declarations are applied.

## Open questions

None. All design decisions were settled with the user before writing.
