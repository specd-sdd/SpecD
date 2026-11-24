continu# Proposal: versioned-approval-invalidation

## Motivation

Approval validity, artifact review state, and lifecycle rollback are currently coupled through invalidation events, so a drift can discard too much effective state and force a change back to `designing` even when only a narrower review is required. We need an explicit, versioned persistence model before extending workflow transitions, so approvals remain auditable, invalidation becomes predictable, and existing manifests continue to work safely.

## Current behaviour

The current manifest has no format version of its own. Its `schema.version` identifies the workflow schema used when the change was created, but it cannot distinguish revisions of the `manifest.json` persistence contract. Backward compatibility therefore depends on optional fields and implicit defaults, and there is no principled way to reject a future manifest shape that the running binary does not understand.

Spec approval and sign-off are represented as events in the append-only history. `Change.activeSpecApproval` and `Change.activeSignoff` replay that history and treat a later `invalidated` event as globally superseding both approvals; `signoff-invalidated` can clear sign-off separately. Approval events already contain artifact hashes, but approval validity is inferred from event ordering rather than persisted as an explicit current projection. There is consequently no durable distinction between an approval that is valid, stale because its reviewed inputs changed, or explicitly revoked.

The spec-approval fingerprint also does not retain the exact canonical spec scope that was approved. A later scope edit can therefore invalidate approval through a separate broad rule even when the stored artifact hashes do not expose what was added or removed. That makes it impossible to prove from the approval record alone that “what we want to do and how we want to do it” still describes the same set of specs.

Artifact validation compares current artifact hashes with the active approval and sign-off hashes. When it detects drift, `ValidateArtifacts` calls `Change.invalidate(...)`. The invalidation policy controls how far artifact review propagates (`none`, `surgical`, `downstream`, or `global`), but `Change.invalidate(...)` independently appends an invalidation and rolls every non-`designing` change back to `designing`. Thus `none` can preserve artifact completion while still forcing a lifecycle rollback, and the existing `invalidationPolicy` conflates two separate decisions: which artifacts need review and whether the workflow itself must return to design.

Manual invalidation, scope edits, direct transitions back to `designing`, and automatic artifact-drift handling all converge on the same broad invalidation mechanism. Commands guard some destructive cases with `--force`, but status output cannot explain approval validity from a materialized record or distinguish an artifact-review decision from a gate-driven workflow rollback.

Sign-off fingerprints only the change artifacts. It does not snapshot the implementation files associated with the change, so implementation drift after sign-off cannot be detected from the approval record. Conversely, using symbol-level slices or language parsers for an initial implementation fingerprint would add complexity and language-specific behaviour that is unnecessary for the common model where changes are applied individually on a branch.

Finally, invalidation is encoded as additional history events rather than deleting history, which is the correct audit direction, but the current active-approval projection still makes a broad invalidation equivalent to losing all effective approval state. That prevents the manifest from preserving both the historical decision and the precise reason it is no longer current.

## Proposed solution

Introduce manifest format version 2 and make the persistence boundary explicitly version-aware:

- New manifests are written with `manifestVersion: 2`.
- A missing version is interpreted as legacy v1.
- v1 manifests remain readable through a compatibility adapter that produces the v2 domain projection in memory.
- A repository read alone does not rewrite a legacy manifest. The next mutation, including status reconciliation that detects invalidity, may persist it as v2, preserving its complete history.
- A manifest with an unsupported future version fails with a typed error instead of being interpreted optimistically.
- Archived manifests follow the same version-aware read contract and are not rewritten merely because they are inspected.

Materialize current approval projections in v2 manifests while retaining history as an immutable audit log. Spec approval and sign-off records will explicitly represent `valid`, `stale`, or `revoked`; absence means that the gate has never been approved and is not a fourth status. Each record retains the approval identity, rationale, time, and the fingerprint of what was reviewed. New invalidations update the materialized projection and append an explanatory event; they never delete or rewrite earlier approval events.

Make the spec-approval fingerprint explicitly scope-aware. It snapshots both the deterministic non-task artifact fingerprint and the exact sorted, deduplicated canonical `specIds` present at approval time. The same complete snapshot is stored in the current approval projection and in every new spec-approval audit event, so renewing approval never destroys evidence of the earlier scope. Equality requires both the artifact fingerprint and the spec set to match; reordering alone is immaterial, while additions and removals produce explicit scope differences and stale the approval through the normal fingerprint comparison. Scope drift is therefore not a separate unconditional invalidation path.

Legacy approvals that lack an approved scope cannot authorize a current gate: v1 records, and transitional v2 records written before this complete snapshot existed, remain readable but project scope freshness as legacy/unknown until renewed. New v2 approval writes require the complete scope-aware snapshot. This compatibility rule avoids inventing a historical scope from whatever happens to be present when an old manifest is read.

Keep legacy `pending-spec-approval` and `pending-signoff` states as a one-way compatibility drain only. Existing manifests in those states can complete approval into `spec-approved` or `signed-off`, but new v2 workflows never enter either pending state: current approvals are granted while the change remains in `ready` or `done` and unlock the existing delivery edge.

Materialize verification validity separately from human approvals and lifecycle position. For native v2 changes, absence of a completed verification record means verification has never completed; legacy history without fingerprints is represented as historical evidence of unknown freshness. Verification can be started and completed from any lifecycle state of an active change. Entering or leaving a phase does not itself start or complete verification, and moving to an earlier phase alone does not invalidate unchanged verification evidence.

Expose three explicit CLI operations backed by application use cases:

- `changes verification start <name>` refreshes implementation tracking and link resolution, executes the registered `impl.filesResolved` and `impl.linksInScope` input checks, and captures a baseline over non-task artifacts and the complete linked implementation file set. A failed check prevents creation of the attempt. Running `start` again supersedes the active attempt with a new one and preserves its history; it does not require a lifecycle transition or a separate restart flag.
- `changes verification complete <name>` requires an active attempt and compares its baseline with fresh inputs through the shared fingerprint-validity evaluator. On success it records the skill's declaration of successful verification, with actor, completion time, and fingerprint. It does not execute tests itself. If the baseline differs or inputs cannot be resolved, completion fails without replacing the baseline or recording successful evidence.
- `changes verification invalidate <name> --reason <text>` withdraws an existing completed verification while preserving its fingerprint and audit evidence. It does not start another attempt.

Implementation readiness remains checked in two deliberately overlapping lifecycle locations: on every forward exit from `implementing`, and on every entry into `verifying`. A transition that matches both bindings, such as `implementing → verifying`, executes each registered check ID only once. This duplication is intentional preparation for future schemas that may skip either phase: whichever boundary remains still protects verification inputs. `changes verification start` executes the same `impl.filesResolved` and `impl.linksInScope` checks independently of lifecycle state, because reports may be run from any active phase. If a future workflow can cross both boundaries without visiting either phase, its compiled transition metadata must preserve the crossed-boundary applicability rather than relying on the endpoints alone.

The registered predicate for `verifying → done` requires an already successfully completed verification whose fingerprint is still current. It shares the fingerprint-validity evaluator with `verification complete`, but never calls that mutating use case or completes an unfinished attempt. The same predicate is available to `GetStatus` for transition guidance. Recheck fresh inputs after mutation-capable hooks before authorizing the transition. Missing, stale, or unprovable evidence blocks exit; fingerprint mismatch alone does not force a return to implementation or require leaving and re-entering `verifying`. Approval-driven recovery and the configured artifact workflow policy continue to apply independently through the central reconciler.

The verification predicate is fail-closed: it skips only when the canonical verdict explicitly says verification is `not-required`. A missing verdict is an unavailable validity decision and blocks with a typed diagnostic; it must not be interpreted as permission to advance. Status keeps active attempts and completed evidence as separate simultaneous projections, because starting a new attempt does not erase the last completed historical result.

Later artifact or implementation drift, or explicit verification invalidation, makes completed evidence stale without deleting its fingerprint or history. Revalidating an artifact does not restore verification; the skill must perform and complete a new verification attempt.

### Verification skill and report protocol

Updating both `specd-verify` and `specd-compliance`, together with their source templates, is required implementation scope. When invoked independently for an active change, each skill supports verification from any lifecycle state without requiring entry to `verifying` merely to produce evidence. It reads canonical status, respects mandatory approval recovery, resolves implementation-input blockers, and calls `changes verification start <name>` before running its verification work. It then performs the checks, produces its findings/report, and calls `changes verification complete <name>` only when those checks succeeded. Report generation and applicable hooks happen before completion so any changes they make to fingerprinted inputs are detected. Compliance modes without a concrete active change, such as project-wide or diff audits, continue producing reports without recording change verification.

`specd-verify` owns the outer attempt when it optionally invokes `specd-compliance` in full mode. It starts that attempt before checking scenarios and explicitly passes the active attempt context to compliance. In this delegated mode, compliance participates in the existing attempt, produces its report, and returns its result without calling `start` or `complete`. Only verify completes the attempt after both scenario verification and the optional compliance audit succeed. Its simple mode uses the same start/complete protocol without invoking compliance. Compliance must not infer delegated participation merely from the existence of an active attempt: independent invocations create their own attempt.

This ordering keeps one baseline across the complete full-mode verification. A nested audit cannot replace the baseline after scenario checks or mark the outer attempt complete prematurely. An audit failure or interruption prevents successful completion of the outer attempt. Independent sequential runs of the two skills may each start and complete their own attempt, retaining the earlier audit history.

If inputs change during verification, the skill inspects the differences, resolves the cause, runs `start` again, and repeats the required verification work before calling `complete`. It must never reset the baseline after testing and immediately complete using results collected for the superseded baseline. Failed tests or an interrupted session do not create completed evidence. A blocked exit from `verifying` uses this same in-place recovery protocol; no self-transition or automatic rollback is needed to restart an attempt.

Skills consume CLI results and canonical recovery guidance rather than calculate fingerprints or edit manifests. Shared instructions, verification/report instructions, lifecycle callers, and generated/installed skill copies must all describe the same protocol, with generated copies refreshed through the normal build/sync path. `changes status` distinguishes the active attempt from completed evidence and its freshness.

Separate invalidation into two persisted policies under configuration and on each change:

```yaml
invalidation:
  artifacts: downstream
  workflow: preserve
```

`invalidation.artifacts` retains the existing `none | surgical | downstream | global` semantics for reopening artifact files. `invalidation.workflow` introduces `preserve | redesign` to decide whether artifact drift by itself preserves the current lifecycle position or returns the change to `designing`. The defaults for newly created changes are `{ artifacts: downstream, workflow: preserve }`.

`preserve` retains the lifecycle position for artifact review when no required approval recovery overrides it. Without a spec gate, artifact drift during `implementing` can be reviewed and validated in place before forward progress resumes. With an enabled spec gate, a stale spec approval withdraws authorization to continue implementation: recovery through `designing → ready → spec approval → implementing → verifying` is mandatory. Spec approval is granted only in `ready`, after all required artifacts are validated and neither drift nor pending review remains. Revalidation alone cannot discharge this recovery obligation. Existing code is retained but must be reassessed against the newly approved plan. Gate recovery takes precedence over `preserve`; it does not erase history or automatically reopen every artifact regardless of the artifact policy.

When only required sign-off is invalidated, reconciliation immediately returns a change beyond `done` to `done`; verification is repeated when stale before human sign-off can be renewed there. When required spec approval is invalidated, the immediate return is to `designing`. If both gates are invalidated, spec-gate recovery takes priority. These returns never advance a change already in an earlier phase. Detection and the required return are committed together, including when detection occurs in `GetStatus`; no pending recovery is left for the next command. Lifecycle skills stop implementation work while required spec consent is stale.

Legacy `invalidationPolicy` configuration and v1 manifest values are adapted to `invalidation.artifacts` with their current value and `invalidation.workflow: redesign`, preserving existing change behaviour. A v1 manifest without the old field maps to `{ artifacts: downstream, workflow: redesign }`. The old configuration key remains temporarily readable as a deprecated alias, but supplying both old and new shapes is rejected as ambiguous. New v2 manifests persist only the structured policy. Creation and editing commands accept the structured policy without making transition topology configurable.

Define fingerprints by gate responsibility:

- Spec approval fingerprints the exact canonical spec scope together with the relevant change artifacts using the existing schema-defined pre-hash cleanup rules.
- Sign-off fingerprints the same artifact view plus an implementation snapshot.
- Artifacts whose schema type declares `hasTasks: true` are excluded from both approval fingerprints and from content-drift invalidation. The marker, rather than an artifact ID or filename, identifies operational task state.
- The implementation snapshot is a deterministic map of deduplicated project-relative file paths to hashes. Its file set comes from confirmed, in-scope implementation links after implementation tracking and link resolution are refreshed.
- Version 1 of the implementation fingerprint hashes the complete linked file, not individual symbols. Symbol ranges remain useful attribution metadata but do not narrow the signed content.
- An empty implementation map is a valid current snapshot when the change legitimately has no linked implementation files. A missing or `null` implementation snapshot denotes legacy sign-off data whose implementation validity cannot be proven by the new mechanism.

Fingerprint comparison includes the complete path set: added, removed, renamed, and unlinked files change the snapshot. Missing or unreadable linked files produce an explicit failure instead of being silently omitted. Text normalization uses a persisted `text-v1` algorithm identifier; binary files are hashed as bytes with an explicit algorithm identifier. Artifact drift compares current content with `validatedHash` even without approval or verification records. Verification and each approval compare against their own independent baselines. Once staleness is recorded, restoring the original bytes does not automatically restore validity; verification or approval must be renewed, and revocation never heals through hash equality.

Use conservative text normalization before hashing implementation files: remove an initial UTF-8 BOM, normalize CRLF/CR to LF, remove trailing horizontal whitespace, normalize whitespace-only lines to empty lines, and normalize the final newline. Do not parse source languages, format code, strip meaningful internal whitespace, or perform symbol-aware canonicalization. This prevents line-ending changes and formatting-only trailing whitespace from invalidating sign-off without pretending that semantically equivalent programs can be recognized in a language-neutral way.

Treat `hasTasks` artifacts as mutable operational progress rather than approved normative content. Completing, adding, removing, or rewriting tasks does not create artifact drift, propagate artifact review, invalidate an approval, or trigger workflow routing. These artifacts remain subject to structural validation and live task counting. Incomplete tasks block applicable forward transitions and must also be rechecked during archive preflight, so excluding task content from fingerprints cannot permit archiving unfinished work. Schemas that need approval over narrative content and mutable task state should model them as separate artifacts rather than combining both concerns under `hasTasks`.

This exception also excludes task artifacts from automatic review propagation originating in parent artifacts. Explicitly requested task review remains possible. A missing, unreadable, or structurally invalid required task artifact is a blocker, not evidence of zero incomplete tasks.

Centralize validity decisions so entry points cannot disagree. A shared validity evaluator computes artifact review state, approval and verification fingerprint verdicts, blockers, current-state validity, and required recovery without side effects. The reconciliation operation atomically materializes artifact, approval, and verification changes together with any required gate return or policy-driven redesign and their audit events. `GetStatus`, artifact validation, both approval use cases, transitions, archive, scope edits, and manual invalidation use this same complete reconciliation for active changes. No entry point persists a newly invalidated gate while deferring its required return to another command. Reconciliation is idempotent: repeated observation of the same invalidity neither appends duplicate events nor repeatedly returns a change already progressing through recovery. Progress-authorizing checks use fresh inputs after hooks that may modify files and before committing the operation. A cache keyed only by manifest modification time cannot establish freshness of externally edited files.

`GetStatus` reconciles active changes before returning the canonical projection of gate state, fingerprint drift, blockers, and the next valid action. It may persist both invalidation and automatic lifecycle recovery; returned state and guidance always describe the committed result. Under `preserve`, ungated artifact review remains in place; required gate recovery overrides preservation, while `redesign` applies its configured return at detection time. Forward transitions and archive perform the same reconciliation rather than trusting an earlier status result. If recovery makes the requested operation inapplicable, they stop and report the persisted recovery state instead of continuing with the original request. CLI output and skills consume that result and make the automatic return visible.

The canonical status contract is a rich validity projection, not the evaluator's raw verdict. It combines the aggregate's committed state, current approval and verification records, active attempt, completed evidence, drift differences, blockers, projection changes, and next action. Mutation results that can change validity—scope edit, manual invalidation, verification invalidation, transition recovery, and archive preflight—return the same actionable blocker and recovery metadata so CLI handlers never reconstruct policy or issue a second, potentially divergent status decision.

### Single owner of validity reconciliation

Centralization is an architectural requirement, not merely a shared utility recommendation. One application-level reconciler owns the complete operation: acquiring fresh change and file facts, comparing baselines, evaluating configuration and schema policy, deciding artifact review and approval/verification invalidation, selecting any automatic return, and atomically persisting the resulting projection and append-only events. Pure domain evaluation and aggregate methods may implement its rules and invariants, but there is only one orchestration path for applying them.

`GetStatus`, `ValidateArtifacts`, `ApproveSpec`, `ApproveSignoff`, `TransitionChange`, `ArchiveChange`, `EditChange`, and `InvalidateChange` must delegate to that reconciler. Repository hydration, individual checks, CLI handlers, and skills must not independently invalidate approvals, infer gate recovery, select automatic return targets, or append recovery transitions. They consume the canonical reconciliation result: the reconciled change, validity verdict, affected inputs, reasons, and any committed return.

That delegation is mandatory for every dependency construction path. Direct dependency overloads cannot silently fall back to `Change.invalidate(...)` when the reconciler is absent, because that would retain two mutation semantics depending on how the use case was instantiated. Composition and kernel factories supply the reconciler; any temporarily retained legacy overload must fail explicitly rather than perform the old broad invalidation.

Operations that change inputs, such as scope editing or artifact validation, integrate reconciliation into the same serialized mutation so baseline updates cannot erase drift evidence before invalidation is evaluated. The concrete transaction interface belongs in design; it must preserve a single rule owner and atomic persistence rather than introduce nested independent mutations. Status projection and transition/archive checks use the same verdict for the same input snapshot. If hooks or other work change those inputs, the caller requests a fresh reconciliation instead of locally patching validity or reusing stale results.

Verification must include cross-entry-point tests showing that identical facts, configuration, and schema yield identical invalidation and recovery decisions through status, validation, transitions, and archive. Repeated reconciliation must be idempotent, and a failed progress operation must not undo an already committed invalidation or automatic return.

### Existing use-case signatures and composition

Every new use case introduced by this change follows the existing composition contracts in `core:composition` and `core:composition-resolver`. Public use-case factories expose both established signatures: `createX(deps: XDeps)` as the canonical construction path and `createX(config: SpecdConfig, options?: CompositionResolutionOptions)` as the convenience bootstrap path. Each supplies its typed `XDeps` contract and `resolveXDeps(resolver)` helper. The config overload uses the shared `CompositionResolver` and delegates to canonical dependency-based construction; it does not duplicate filesystem wiring or initialize an entire kernel merely to obtain one use case.

Factories reuse `normalizeCompositionFactoryArgs` and the existing `InvalidCompositionFactoryArgumentsError` behaviour, including rejection of composition options with the deps overload. Execution uses typed input/result contracts in the established `execute(...)` style. Public or kernel-mounted additions expose the required use-case types, input/result types, and factories through the existing export surfaces. Internal collaborators retain the existing internal visibility conventions. The central reconciler and manual verification-invalidation use case must follow these patterns; this change introduces no alternative factory-signature or dependency-resolution system. Tests cover both public construction signatures and their behavioural equivalence. These are existing architectural constraints being applied, not changes to the composition contract itself.

`StartVerificationDeps` includes the schema provider needed to construct the registered-check context; this is part of its public dependency contract rather than incidental composition wiring. Independent verification start uses an operation-specific check context and must not fabricate a lifecycle self-transition merely to reuse transition machinery. The same check registry and IDs are reused, with applicability evaluated for the verification operation and duplicate IDs executed once.

Verification and sign-off failures retain semantic error distinctions. No completed verification produces a not-found error; an active attempt without completion produces an in-progress error; stale or legacy-unknown evidence produces a stale/not-current error with `/specd-verify` recovery; and current evidence with a different supplied fingerprint produces a fingerprint-mismatch error. A stale sign-off must never be collapsed into `VerificationNotFoundError`.

CLI commands render Core-owned facts. `changes edit` distinguishes a scope edit from an actual validity change and warns only for projection changes committed by reconciliation. `changes invalidate` and verification invalidation include blockers, next action, affected gates, and persisted reason in structured output. Repair commands interpolate the real change name, never a literal placeholder. If transition or archive hooks mutate inputs, the operation refreshes tracking and reconciles again before its final checks; if that committed recovery makes the requested operation inapplicable, the failure reports the committed blockers and next action rather than masquerading as an invalid protocol edge.

Make artifact review and revalidation a cross-cutting workflow capability rather than an operation owned by the design phase. With `workflow: preserve` and no required spec-gate recovery, the active lifecycle skill may inspect drifted artifacts, review their semantic consistency and affected descendants, run structural validation to establish a new baseline, and then continue in the same lifecycle state, subject to verification and sign-off validity. A successful `changes validate` never substitutes for cognitive content review. The active skill redirects to `specd-design` when authoring, correction, redesign, or mandatory spec-gate recovery is necessary. In-place revalidation cannot bypass renewed consent.

Forward progress remains blocked while any non-`hasTasks` artifact has unresolved drift or pending review, even when the spec approval gate is disabled and even when `invalidation.artifacts` is `none`. Backward and recovery transitions remain available. `invalidation.artifacts` controls which artifact states are reopened and how review propagates; it does not waive the freshness invariant. `invalidation.workflow` controls automatic lifecycle movement; it does not grant permission to advance.

Verification staleness is interpreted relative to the current workflow position. In `designing`, `ready`, or `implementing`, it is durable context but does not override the phase's normal next action or block entry into `verifying`. At verification-requiring boundaries, it blocks forward progress and recommends running the verification/report skill, which can renew evidence in the current state. Archive preflight enforces the same evidence requirement. `GetStatus` derives applicability from the schema workflow rather than allowing a stale record to dominate every earlier phase. Valid evidence produced earlier remains reusable while its inputs match.

This change deliberately does not introduce skippable `implementing` or `verifying` workflow steps, schema `when` expressions, or configurable backward transitions. Those lifecycle changes will be designed separately after invalidation and approval semantics are stable.

The verification model must nevertheless accommodate future phase skipping: completed verification and verification not required by the workflow are distinct facts. A later legitimate skip must not fabricate valid evidence or be defeated by unconditional verification requirements in sign-off or archive. Those consumers must share the central decision about whether evidence is required when skip support is introduced.

## Required test coverage and edge cases

The implementation is not complete merely when its happy-path use cases pass. The following behaviours form the minimum regression contract across domain, application, persistence, composition, CLI, and skill-template suites.

### Manifest versions and compatibility

- Read a versionless v1 active or archived manifest without rewriting it, adapt its legacy invalidation policy to `{ artifacts: <legacy-or-downstream>, workflow: redesign }`, preserve every history event, and expose unknown legacy freshness where evidence is incomplete.
- Persist `manifestVersion: 2` only after a real mutation or reconciliation change, and serialize only the structured invalidation policy and materialized projections.
- Round-trip native v2 manifests without losing approval identity, actor name/email, reason, timestamps, scope, fingerprints, verification attempt/evidence, invalidation reason, or history.
- Reject unsupported future manifest versions with the typed version error and no partial mutation.
- Treat v1 and transitional v2 spec approvals without an approved scope as legacy/unknown; never synthesize the past scope from current `specIds`.
- Preserve archive reads as observational: no migration write, reconciliation write, or lifecycle transition occurs while inspecting historical evidence.

### Scope-aware spec approval

- Persist the sorted, deduplicated canonical `specIds` together with the artifact fingerprint in both the current approval projection and every new spec-approval event.
- Prove that spec-ID reordering or duplicate input normalization does not stale approval.
- Prove that adding or removing a spec stales approval even when artifact hashes are otherwise unchanged, with explicit `spec-added` or `spec-removed` differences and `scope-change` attribution.
- Prove that an edit with no effective scope difference does not stale approval or emit a false invalidation warning.
- Renew approval without rewriting or deleting the earlier approval event or its earlier scope snapshot.
- Preserve actor resolution through the existing approval decorator so persisted and rendered approver name and email retain the current privacy and fallback behaviour.

### Approval gates and legacy pending states

- Reject new spec approval outside `ready`, and reject approval in `ready` while required non-task artifacts have drift, pending review, or structural failure.
- Keep a native v2 change in `ready` after spec approval and in `done` after sign-off; approval unlocks the existing delivery edge rather than entering a pending state.
- Permit only the compatibility drain `pending-spec-approval → spec-approved` and `pending-signoff → signed-off` for legacy manifests; prove that no new workflow path enters either pending state.
- When required spec consent becomes stale, atomically return a later change to `designing`; when only required sign-off becomes stale beyond `done`, atomically return it to `done`; when both are stale, spec recovery wins.
- Never advance an earlier lifecycle state to a recovery target, and prove that `workflow: preserve` cannot override required gate recovery.

### Central reconciliation and artifact policy

- Feed identical facts through status, validation, scope edit, manual invalidation, transition, approval, and archive and assert identical validity, affected inputs, blockers, projection changes, recovery target, and next action.
- Run reconciliation repeatedly over already-stale or already-revoked evidence and assert idempotence: no duplicate event, no repeated transition, no reason replacement, while fresh observation still occurs.
- Exercise every `invalidation.artifacts` value with both workflow policies and with gates enabled/disabled, including `none`: artifact reopening differs by policy, but unresolved non-task drift always blocks applicable forward progress.
- Confirm that `hasTasks: true`, not filename or artifact ID, excludes task content from approval fingerprints, automatic drift invalidation, and propagated review while preserving structural validation and live task-completion checks.
- Cover mixed and malformed task cases: missing, unreadable, or structurally invalid required task artifacts block; an empty valid task artifact counts as zero; tasks added after sign-off are re-counted at archive.
- Prove that mutation-capable transition/archive hooks are followed by refreshed implementation tracking and reconciliation, and that a committed recovery failure reports validity blockers and next action rather than a protocol-edge error.
- Assert direct dependency construction without the mandatory reconciler fails explicitly instead of falling back to the old `Change.invalidate(...)` path; assert kernel and config/deps factory overloads resolve the same behaviour.

### Fingerprints and implementation inputs

- Produce deterministic fingerprints independent of map insertion order, link order, duplicate links, spec-ID order, and platform path separators; persist algorithm/version identifiers.
- Detect added, removed, renamed, unlinked, missing, and unreadable implementation files instead of silently omitting them.
- Distinguish a legitimate observed-empty implementation snapshot from a missing legacy snapshot.
- Confirm text-v1 equivalence for UTF-8 BOM, CRLF/CR versus LF, trailing horizontal whitespace, whitespace-only lines, and final-newline differences.
- Confirm text-v1 still detects internal whitespace, token, string-content, line-count, and other meaningful byte changes; hash binary inputs byte-for-byte.
- Prove a file change outside a linked symbol range still changes the whole-file fingerprint, and that no parser, formatter, AST normalization, or repository-wide unrelated file participates.
- Restore original bytes after staleness and assert that approval or verification remains stale until explicitly renewed.

### Check registry and future-skippable boundaries

- Bind `impl.filesResolved` and `impl.linksInScope` to every forward exit from `implementing` and every entry into `verifying`, while retaining archive-specific applicability.
- For `implementing → verifying`, assert each check ID executes exactly once despite matching both bindings; cover pass, fail, and skip outcomes deterministically.
- Cover entry into `verifying` from another permitted state and forward exit from `implementing` to another permitted state so each independent binding is proven.
- Execute the same readiness checks from `verification start` in every active lifecycle state using operation context, without fabricating `verifying → verifying` or another fake transition.
- Reserve a contract test for compiled crossed-boundary metadata so a future transition that skips one phase retains the remaining guard; if both phases can be skipped, require explicit crossed-boundary applicability before enabling that workflow.
- Treat `verification.current` as skip only for an explicit `not-required` verdict; missing or unavailable verdict fails closed with a typed blocker.

### Verification lifecycle

- Start from every active lifecycle state after refreshed tracking and successful readiness checks; a failed readiness check creates no attempt.
- Starting with an active attempt supersedes it, preserves history, and captures a fresh baseline; starting does not erase completed evidence.
- Complete only an active attempt whose freshly recomputed fingerprint equals its baseline; missing attempt, changed inputs, unresolved links, and unreadable files do not record successful evidence.
- Distinguish no completed evidence, active-only work, stale/legacy-unknown evidence, and valid-but-mismatched supplied fingerprint through separate typed errors and recovery metadata.
- Invalidate completed verification from any active state without moving lifecycle, preserve its fingerprint/history, persist the first reason, and return that original reason on idempotent repeats.
- Keep stale verification contextual before `verifying`; at a verification-requiring boundary and archive preflight, block and recommend in-place `/specd-verify` without forcing `implementing` or a self-transition.
- On fingerprint mismatch during a skill run, require a new start and complete rerun of the affected verification work; resetting the baseline after tests and immediately completing is forbidden.
- Cover independent `specd-verify` and `specd-compliance` runs, delegated full-mode ownership by verify, simple mode, compliance without an active change, audit failure, interruption, report mutation before completion, and sequential independent attempts.

### Status and CLI contracts

- Project active attempt and completed evidence simultaneously, including each fingerprint and freshness, through the rich `ValidityStatusProjection`.
- Render committed state, projection changes, affected artifacts, blockers, and next action consistently in text, JSON, and TOON.
- Make `changes edit` report `scopeChanged` independently from actual validity changes; warn about invalidated approvals only when reconciliation changed a projection, and show resulting blockers/next action.
- Make `changes invalidate` render the exact affected gates and Core-selected recovery target; force errors must not hard-code `designing` when sign-off recovery is `done` or no return applies.
- Make `changes verification invalidate` include the persisted reason in every format and retain the original reason on repeated calls.
- Interpolate the actual change name into every repair command and assert that no literal `<name>` placeholder escapes.

### Error, atomicity, and audit invariants

- Simulate repository write failure after evaluation and assert that projections, events, and lifecycle return are not partially committed.
- Simulate reconciliation that commits invalidation/recovery before a requested transition or archive becomes inapplicable; assert the committed recovery remains and the operation reports it accurately.
- Preserve complete append-only audit history across renewal, supersession, invalidation, migration-on-mutation, and archive.
- Verify every new error extends the canonical Specd error base, carries a stable uppercase code and actionable message, and exposes structured recovery metadata where applicable.
- Verify new use cases and the reconciler through both established factory signatures, composition-option rejection for deps overloads, kernel exposure, and public/internal export boundaries.

## Specs affected

### New specs

- `core:invalidate-verification`: explicitly mark existing completed verification stale while preserving its fingerprint and audit history, then apply phase-aware canonical recovery.
  - Depends on: core:change, core:change-repository-port, core:transition-checks, core:composition-resolver
- `cli:change-verification`: expose `changes verification start`, `complete`, and `invalidate` from any active lifecycle state; delegate to application use cases and report attempt, evidence, freshness, persisted invalidation reason, and recovery results consistently in text, JSON, and TOON. Repeated invalidation retains and reports the original persisted reason.
  - Depends on: cli:entrypoint, core:invalidate-verification, core:get-status, core:change, core:transition-checks

### Modified specs

- `core:create-change`: persist the resolved structured invalidation policy and new-change defaults in a v2 manifest.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-create`: expose structured policy inputs, resolve configuration defaults, and handle legacy policy compatibility when creating changes.
  - Depends on (added): core:create-change, core:config
  - Depends on (removed): none
- `cli:change-edit`: expose structured policy editing and accurately report approval invalidation and gate-recovery consequences.
  - Depends on (added): core:edit-change, core:config
  - Depends on (removed): none
- `core:change`: replace history-replay-only active approvals with explicit approval projections; define state-independent verification attempts and completed evidence, including start, supersession, completion, and invalidation contracts; separate artifact invalidation from workflow rollback and preserve append-only history and gate-safe lifecycle behaviour.
  - Depends on (added): none
  - Depends on (removed): none
- `core:change-manifest`: introduce `manifestVersion: 2`, v1 compatibility, typed rejection of future versions, structured invalidation policy, materialized approvals, scope-aware spec-approval fingerprints, and verification/sign-off fingerprints; treat approval records without scope as legacy/unknown rather than synthesizing history.
  - Depends on (added): none
  - Depends on (removed): none
- `core:schema-format`: define `hasTasks: true` as the schema-level marker for operational task artifacts excluded from approval fingerprints and drift invalidation while remaining subject to task-completion checks.
  - Depends on (added): none
  - Depends on (removed): none
- `core:transition-checks`: own the shared validity verdict contract and its gate-recovery priority; require all consumers to delegate invalidation and automatic returns to the single application reconciler; fail closed when a verification verdict is unavailable; deduplicate check IDs across overlapping bindings; and enforce implementation readiness, artifact freshness, phase-aware verification validity, and task completion at applicable forward boundaries and archive preflight.
  - Depends on (added): none
  - Depends on (removed): none
- `core:change-repository-port`: expose persistence semantics needed to load legacy manifests, persist v2 approval and verification projections atomically, and read implementation files used by fingerprints without coupling use cases to filesystem details.
  - Depends on (added): none
  - Depends on (removed): none
- `core:config`: replace the single artifact-only invalidation setting with structured artifact and workflow policies while adapting the legacy configuration shape.
  - Depends on (added): none
  - Depends on (removed): none
- `core:approve-spec`: grant or renew consent only in `ready` after required artifact validation with no drift or pending review, then persist the valid scope-aware approval fingerprint in both the current projection and audit event; retain legacy pending-state completion only as a compatibility drain.
  - Depends on (added): none
  - Depends on (removed): none
- `core:approve-signoff`: refresh implementation tracking and links, compute normalized whole-file hashes for linked files, persist the resulting implementation snapshot with the sign-off fingerprint, retain legacy pending-state completion only as a compatibility drain, and distinguish missing, active, stale, and mismatched verification evidence.
  - Depends on (added): none
  - Depends on (removed): none
- `core:validate-artifacts`: compare artifacts and canonical scope against materialized approval and verification fingerprints, mark affected projections stale through mandatory reconciliation, and route artifact and workflow invalidation independently.
  - Depends on (added): none
  - Depends on (removed): none
- `core:invalidate-change`: apply explicit artifact and workflow policies, preserve approval history, and require force or gate-safe handling where manual invalidation affects a valid approval.
  - Depends on (added): none
  - Depends on (removed): none
- `core:edit-change`: persist the structured invalidation policy; compare scope through the scope-aware spec-approval fingerprint; and report only validity changes actually committed by reconciliation, together with blockers and next action.
  - Depends on (added): none
  - Depends on (removed): none
- `core:transition-change`: consume materialized gate and verification validity; run implementation readiness on forward exit from `implementing` and entry to `verifying` with per-check deduplication; refresh and reconcile after mutation-capable hooks; check already-completed current verification before `verifying → done`; neither capture baselines nor complete verification; reject `verifying → verifying` without requiring self-transitions or leave/re-enter cycles to renew evidence.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-status`: return the rich canonical validity projection over the committed aggregate, report active verification attempts independently from completed evidence, apply phase-aware blocker priority, expose fingerprint drift reasons, and return the correct next action after independent artifact and workflow invalidation decisions.
  - Depends on (added): none
  - Depends on (removed): none
- `core:archive-change`: enforce current gate and verification validity at archive time and preserve the versioned manifest, materialized approvals, verification evidence, fingerprints, and append-only history in archived changes.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-status`: render approval and verification state plus automatic returns committed by `GetStatus` reconciliation, including the resulting lifecycle state and phase-aware next action.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-invalidate`: accept and explain independent artifact/workflow invalidation choices while retaining the approval safety guard; render the exact affected gates, blockers, and recovery target returned by Core instead of hard-coding a return to `designing`.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-approve`: surface approval fingerprint creation and the resulting materialized gate status for spec approval and sign-off.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-transition`: use fresh `GetStatus` output to render repair guidance when a stale or revoked approval or stale verification changes the permissible target or next action; it exposes neither verification restart nor lifecycle self-transition.
  - Depends on (added): none
  - Depends on (removed): none
- `skills:workflow-automation`: define in-place artifact review as a cross-skill preflight; require independent start/checks/complete operation for both verify and compliance, with explicit shared-attempt participation and outer completion when verify delegates to compliance; require fresh verification work after restarting a mismatched attempt; redirect to design when artifact authoring, redesign, or required spec-gate recovery is necessary.
  - Depends on (added): core:get-status, core:validate-artifacts, core:transition-checks
  - Depends on (removed): none
- `skills:skill-templates-source`: update shared instructions and both `specd-verify` and `specd-compliance` templates with the state-independent CLI protocol and explicit standalone/delegated attempt ownership; distinguish report completion from lifecycle transitions and regenerate installed copies through build/sync; all skills consume the same drift-review protocol and `GetStatus` guidance.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

The central domain changes are concentrated in `packages/core/src/domain/entities/change.ts` and the invalidation-policy value objects. `Change` currently owns history, active-approval replay, artifact invalidation, lifecycle rollback, implementation links, and persistence-facing state, so the new materialized projection must avoid duplicating competing sources of truth inside the aggregate.

The persistence boundary changes in `packages/core/src/infrastructure/fs/manifest.ts`, `manifest-change-loader.ts`, and `change-repository.ts`. These areas must discriminate manifest versions before validating version-specific shapes, adapt v1 data in memory, serialize v2 consistently, retain atomic writes, and preserve all historical events. Archive readers and writers must use the same version contract.

Approval, verification, and invalidation orchestration changes in `packages/core/src/application/use-cases/approve-spec.ts`, `approve-signoff.ts`, `validate-artifacts.ts`, `invalidate-change.ts`, `invalidate-verification.ts`, `edit-change.ts`, `transition-change.ts`, `get-status.ts`, and `archive-change.ts`. The existing shared artifact hashing and schema cleanup mechanisms should remain the basis of artifact fingerprints. Shared validity evaluation and reconciliation prevent status, validation, transitions, and archive from deriving different answers. A shared fingerprint service centralizes artifact selection, implementation file-set selection, conservative text normalization, deterministic hashing, and comparison for verification and sign-off.

Schema interpretation, configuration parsing, and defaults change around `ArtifactType.hasTasks`, `packages/core/src/application/ports/config-schema.ts`, `specd-config.ts`, and `packages/core/src/infrastructure/fs/config-loader.ts`. The workflow check registry must bind task completion to archive as well as forward transitions. CLI changes are limited to the existing change command modules under `packages/cli/src/commands/change/`, primarily `status.ts`, `invalidate.ts`, `approve.ts`, `transition.ts`, and the create/edit option mapping that persists invalidation policy. Agent behaviour changes in `packages/skills/templates/shared/shared.md.tpl` and the lifecycle templates for design, implement, verify, and archive; generated or installed copies are refreshed through the existing skills build/sync path rather than edited as independent sources.

Graph analysis classifies the `Change` aggregate as a CRITICAL hotspot, with 345 callers and 78 importing files in the current index. This makes compatibility at the aggregate API and manifest adapter boundaries preferable to a broad signature rewrite. Tests must cover domain projection, v1/v2 repository round trips, unknown versions, configuration adaptation, artifact and implementation drift, each gate state, CLI structured output, and archive preservation.

The active `implementation-snapshot` change also targets `core:change`. This proposal does not absorb that change, but implementation must coordinate any shared entity fields and history semantics rather than overwrite or duplicate concurrent work. No new external runtime dependency or language parser is required.

## Technical context

The manifest version is independent of the workflow schema identity already stored as `schema.name` and `schema.version`: the former versions persistence layout, while the latter records which artifact/workflow schema governed the change at creation.

History remains append-only. The materialized approval fields are a current projection optimized for correctness and direct inspection, while events retain the complete audit trail. Invalidation changes projection status and appends evidence; it never erases an approval event. The model intentionally uses `valid`, `stale`, and `revoked`: `stale` means the approved fingerprint no longer matches relevant inputs, whereas `revoked` means an explicit operation withdrew consent. No record means no approval was granted.

Legacy compatibility is read-through rather than eager migration. A v1 repository load derives the best available approval projection from history and existing artifact hashes. Because old sign-offs do not contain implementation hashes, their implementation fingerprint is represented as legacy/unknown rather than fabricated. A later mutation writes the complete v2 shape. Repository reads and archive inspection do not rewrite merely to migrate versions; an operational reconciliation writes only when it has newly observed state to materialize.

The legacy invalidation policy maps conservatively to `{ artifacts: <legacy value>, workflow: redesign }`, preserving the old workflow policy for existing changes. Newly created changes default to `{ artifacts: downstream, workflow: preserve }`. Required approval recovery overrides preservation: invalidated spec consent immediately returns the change to design before approval again in `ready`; invalidated sign-off returns a later change to `done`, with verification recovery when needed. `GetStatus` applies these returns through the same atomic reconciliation as other entry points. Repository hydration and historical archive inspection remain read-only; observing active validity through status is an operational reconciliation.

Legacy verification and sign-off whose implementation evidence cannot be proven are not treated as current valid evidence. Active changes must repeat verification and required sign-off before progressing beyond the relevant boundary or archiving. Historical records are retained with unknown freshness; current files are never used to invent a past fingerprint. Archived changes remain readable historical evidence without repair or migration writes.

Validity is not represented as one boolean. A change may preserve its current lifecycle state while requiring artifact review, having a stale approval, and being blocked only from particular forward transitions. The central projection therefore carries artifact review, spec-approval and sign-off status, transition blockers, current-state validity, and a recommended recovery independently.

Artifact revalidation is state-independent, but permission to resume work also depends on approval and verification validity. Under `preserve`, an implementation or verification session may review an already-modified artifact in place when spec-gate recovery is not required. Contradictions, required corrections, new design decisions, or stale required spec consent route to `specd-design`. Skills cannot use validation to replace human approval or bypass the mandatory return through `ready`.

Implementation fingerprints intentionally trade semantic precision for predictable cross-language behaviour. Confirmed in-scope implementation links identify the files, but the entire content of each unique linked file is signed. This means a meaningful change anywhere in such a file invalidates sign-off, which is acceptable for the initial model and consistent with changes normally being isolated on a branch. Symbol-level hashing, parser-based normalization, AST comparison, repository-wide diffs, and formatter execution were considered too complex and fragile for this version.

`hasTasks` is a semantic boundary, not a naming convention. Task-bearing artifacts are excluded wholesale from approval fingerprinting and drift invalidation because their contents are expected to evolve throughout implementation. Their correctness is enforced through structural validation and `workflow.taskCompletion`; archive repeats that live check so tasks added after sign-off cannot bypass completion requirements. A mixed document should not use `hasTasks` when its non-task content needs approval protection.

Whitespace normalization is deliberately narrow. It tolerates encoding markers, line-ending conversions, trailing whitespace, whitespace on otherwise blank lines, and final-newline differences. It does not remove all whitespace or reformat code, because those transformations could collapse implementation-significant changes in languages where spacing or string contents matter.

This is an explicitly accepted textual tolerance, not semantic equivalence: trailing whitespace can be meaningful inside multiline literals. It also does not guarantee that every Prettier run leaves the fingerprint unchanged.

An empty implementation fingerprint is valid after tracking and link resolution have run and found no linked files. It is distinct from a legacy missing fingerprint. Fingerprint entries use stable project-relative paths, deterministic ordering, and the existing content-hash format so comparisons and serialized output remain reproducible.

Verification and sign-off are distinct projections over compatible evidence. Verification records that the implementation was checked against a specific artifact and implementation baseline; sign-off records human consent over a current baseline. Both reuse the shared fingerprint calculation, but one does not imply the other. Drift may make both stale. An active attempt and a completed verification are separate records: starting work is not evidence that it passed. `StartVerification`, `CompleteVerification`, and `InvalidateVerification` follow the established use-case factory signatures and central reconciliation rules. The completion use case and the transition predicate reuse the same freshness evaluator, while only explicit completion records success. State-independent verification can be renewed without moving the change; required spec-gate recovery remains higher priority. Unchanged completed evidence survives phase movement and can be reused at a later required boundary.

Workflow phase skipping, schema-level `when` checks, and revised backward-transition topology remain deferred. Stabilizing invalidation and approval validity first prevents those later routing decisions from being built on the current globally invalidating behaviour.

## Open questions

None. The policy split, v1/v2 compatibility strategy, approval states, implementation file selection, and normalization boundary are resolved for this change.
