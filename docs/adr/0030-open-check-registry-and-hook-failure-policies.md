---
status: accepted
date: 2026-09-30
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0030: Open Check Registry, Unified Predicate Failures, and Resilient Hook Failure Policies

## Context and Problem Statement

SpecD lifecycle transitions were previously governed by a closed union of 15 built-in checks (`CheckId`) mapped across static applicability tables (`TRANSITION_BINDING_SPECS` and `ARCHIVE_BINDING_SPECS`), preventing plugins, extensions, and custom workflow schemas from introducing first-class verification rules. Concurrently, workflow transition hooks operated under an unyielding fail-fast policy in the `pre` phase, where any non-zero exit code immediately blocked transitions, compelling developers to resort to fragile shell constructs such as `|| true` that destroyed execution visibility and masked process exit codes. Furthermore, check bypasses relied on ad-hoc CLI flags (`--allow-out-of-scope`, `--allow-overlap`) that bled directly into use case inputs, while check failure errors were fragmented into duplicated, bespoke error classes.

We need an extensible domain model for verification checks, resilient failure policies for workflow hooks, unified error reporting with actionable repair guidance, and clean CLI bypass mechanisms.

## Decision Drivers

- Plugins and custom schemas must be able to contribute domain verification checks without modifying core engine source code.
- Plugin checks must be strictly namespaced under `@<plugin>.<id>` and confined by two-tier governance policies to protect core invariants.
- Checks must receive isolated, deep-merged cascading configuration (`ctx.config`).
- Workflow hooks must support non-fatal warning policies (`onFailure: 'warn'`) that preserve exit codes and execution logs without aborting transitions.
- Ad-hoc CLI bypass flags (`--allow-out-of-scope`, `--allow-overlap`) must be unified into a single `--skip-checks <id>` interface backed by an explicit audit matrix.
- Predicate check failures must use a unified error class (`CheckPredicateFailedError`) that integrates cleanly with the CLI Text Repair Guide.

## Considered Options

1. **Keep checks closed and implement extensions solely via shell hooks** — rejected because hooks run out-of-process, lack access to rich domain context and validity snapshots, cannot participate in pre-flight blocker checks in `GetStatus`, and cannot provide structured remediation commands.
2. **Open checks dynamically via untyped event buses** — rejected because it compromises determinism, type safety, and governance locks.
3. **Open namespaced `CheckRegistry` with two-tier governance, unified `CheckPredicateFailedError`, resilient hook policies, and `--skip-checks` CLI flag** — chosen.

## Decision Outcome

1. **`CheckRegistry` Domain Service**: An open registry cataloging built-in and plugin checks. External checks implement `CustomCheckDefinition` and are namespaced as `@<plugin>.<id>`.
2. **Two-Tier Governance & Confinement**:
   - Check-level confinement (`allowBindingOverride: false` on registration) prevents embedding custom checks into arbitrary steps in `schema.yaml`.
   - Binding-level policy lock prevents overriding `skippable` or `onFailure`.
   - Config override lock (`allowConfigOverride: false`) prevents overriding check configuration in `schema.yaml`.
   - Disablement lock (`allowDisable: false`) prevents declaring `disabled: true` in `schema.yaml`. Core protocol invariants enforce `allowDisable: false`.
   - **Three-Tier Categorization of Built-in Checks**: Built-in checks are audited into Category A (Protocol Invariants: `allowBindingOverride: false`, `allowDisable: false`, `skippable: false`), Category B (Native Step Attributes: controlled via `requires: []`, `requiresTaskCompletion`, `approvals`), and Category C (Policy & Consistency: `allowBindingOverride: true`, `allowDisable: true`, e.g. `impl.linksInScope`, `spec.overlap`, `deps.consistent`). Schema validation (`buildSchema`) evaluates check embedding strictly through these governance locks rather than ad-hoc prefix inspection.
   - **Principle of Monotonic Governance Locks**: All governance locks (`allowBindingOverride`, `allowConfigOverride`, `allowDisable`) operate strictly under monotonic restriction. Once established as locked (`false`), no schema layer merger (`merge-schema-layers`), extension layer, or identical binding redeclaration can delete, erase, or relax that lock to `true`. Schema layer mergers safely preserve `step.checks` without clobbering.
   - **Declarative Disablement vs. Runtime Bypass**: Declarative design-time disablement (`disabled: true` in step checks) cleanly omits check execution without user warnings (only permitted if `allowDisable !== false`), whereas runtime bypass (`--skip-checks`) is an operational exception requiring `skippable: true` and producing an explicit audit trail (`bypassedByUser: true`).
3. **Deep Cascading Configuration**: `ctx.config` is computed by deeply merging plugin default config, binding default config, and schema step config using `deepMergeConfig`.
4. **Resilient Hook Policies (`onFailure: 'abort' | 'warn'`)**:
   - `onFailure: 'warn'` allows transitions to advance even if a hook exits with a non-zero status code, aggregating diagnostics into `warnings[]` and logging non-fatal progress events.
   - `onFailure: 'abort'` (default) preserves fail-fast semantics.
5. **Unified `--skip-checks` and Predicate Error Hierarchy**:
   - Bespoke predicate error classes are replaced with `CheckPredicateFailedError(checkId, label, code, message, command, details)`.
   - All check bindings declare explicit `skippable: boolean` permissions. Only skippable checks (`impl.linksInScope`, `spec.overlap`, and permitted custom checks) can be bypassed via `--skip-checks`.
   - The CLI formats a structured Text Repair Guide with suggested remediation commands and bypass hints.

### Consequences

- Good, because plugins can introduce first-class domain verification rules without modifying `@specd/core`.
- Good, because developers can configure non-blocking linter or notification hooks without losing stderr visibility or masking non-zero exit codes.
- Good, because CLI bypass syntax is standardized under `--skip-checks` while preserving full backward compatibility for legacy aliases.
- Good, because two-tier governance locks protect critical workflow steps from unintended overrides.
- Bad, because custom checks run in-process within the node runtime, requiring authors to maintain pure execution discipline without unbounded resource consumption.

### Confirmation

This decision is confirmed when custom checks register cleanly via `KernelBuilder`, governance locks reject invalid schema overrides with specialized domain errors, non-blocking hook warnings allow state progression, `--skip-checks` bypasses only audited skippable checks, and the CLI renders structured Repair Guides.

## Addendum: the archive operation under the shared cascade

`changes archive` originally ran a static table of archive bindings and exposed two ad-hoc flags (`--allow-overlap`, `--allow-out-of-scope`) that the use case mapped to `spec.overlap` and `impl.linksInScope`. That left the archive operation outside the cascade this ADR introduced: a schema could not declare, configure, or disable archive checks, and `changes status` advertised `--skip-checks <id>` hints that `changes archive` rejected.

Decisions:

1. **`archiveChecks` on the `archiving` workflow row** (valid only there), the third check surface beside `checks` and `skipChecks`. Entries accept `id`, `skippable`, `disabled`, and `config`; `onFailure` is rejected because archive predicate failures have no abort/collect distinction. Rejected: a top-level `archive:` block (breaks symmetry), `scope: archive` on `checks` (ambiguous with `from`/`along`).
2. **`ArchiveChange` resolves its bindings through `resolveEffectiveBindings`** (`operation: 'archive'`) on every run, under the same governance locks, and validates the bypass list against the resolved bindings with the same rules as `TransitionChange` (`UnknownCheckError`, `CheckNotSkippableError`).
3. **Aliases live in the host.** `ArchiveChangeInput` drops `allowOverlap` and `allowOutOfScope`; the use case accepts only `skipChecks`, like `TransitionChange`. The CLI translates `--allow-overlap` and `--allow-out-of-scope` into `spec.overlap` and `impl.linksInScope`. This is a breaking change for SDK callers.
4. **Archive locks.** The set of skippable built-in archive checks does not grow: only `spec.overlap` and `impl.linksInScope`. On the archive rows, `workspace.readOnly` (a security boundary), `impl.filesResolved`, and `deps.consistent` become fully locked; their transition rows keep the Category C policy.
5. **Status and errors follow the resolved bindings.** `changes status` computes archive bypass hints from the same resolved set, so a hint always matches what `changes archive` accepts; plugin or schema-embedded archive check failures throw `CheckPredicateFailedError` with the resolved `skippable`.

## More Information

### Guides & Specifications

- [`docs/core/custom-checks.md`](../core/custom-checks.md)
- [`docs/guide/workflow.md`](../guide/workflow.md)
- [`docs/guide/schemas.md`](../guide/schemas.md)
- [`docs/guide/cli.md`](../guide/cli.md)
