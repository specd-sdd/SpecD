# Tasks: versioned-approval-invalidation

## 1. Domain policy and fingerprint primitives

- [x] 1.1 Replace the scalar invalidation policy with independent artifact and workflow dimensions
      `packages/core/src/domain/value-objects/invalidation-policy.ts`: `InvalidationPolicy`, `InvalidationPolicyOverride` — define the structured types and the four artifact plus two workflow values.
      Approach: expose immutable `{ artifacts, workflow }` values; do not encode gate recovery in either dimension.
      (Req: Invalidation policy configuration, Policy-aware invalidation)
- [x] 1.2 Add new and legacy invalidation defaults
      `packages/core/src/domain/value-objects/invalidation-policy.ts`: `DEFAULT_INVALIDATION_POLICY`, `LEGACY_DEFAULT_INVALIDATION_POLICY` — make new changes preserve lifecycle while legacy absent/scalar configuration retains redesign semantics.
      Approach: use `{downstream,preserve}` for native configuration and `{downstream,redesign}` for legacy absence.
      (Req: Invalidation policy configuration, Initial invalidation policy)
- [x] 1.3 Implement partial policy overlay
      `packages/core/src/domain/value-objects/invalidation-policy.ts`: `resolveInvalidationPolicy` — overlay only supplied dimensions without mutating the base value.
      Approach: resolve artifact and workflow keys independently so command-scoped overrides remain transient.
      (Req: Effective policy resolution, Invalidation policy edits)
- [x] 1.4 Define versioned artifact and implementation fingerprint types
      `packages/core/src/domain/value-objects/validity-fingerprint.ts`: fingerprint interfaces and algorithm literals — represent artifact hashes, per-file implementation hashes, failures, and the combined validity fingerprint.
      Approach: include version and normalization algorithms in equality and distinguish concrete empty maps from `null` legacy evidence.
      (Req: Validity fingerprint scope, Fingerprint serialization)
- [x] 1.5 Implement conservative text and binary normalization
      `packages/core/src/domain/value-objects/validity-fingerprint.ts`: normalization helpers — normalize BOM, line endings, trailing horizontal whitespace, blank lines, and final newline while preserving internal whitespace; keep binary bytes unchanged.
      Approach: classify content once, apply `text-v1` only to text and `bytes-v1` to binary, without language parsers or formatters.
      (Req: Validity fingerprint scope)
- [x] 1.6 Implement deterministic fingerprint comparison
      `packages/core/src/domain/value-objects/validity-fingerprint.ts`: `compareValidityFingerprints` — compare algorithms, complete lexically ordered path sets, and hashes and return structured differences.
      Approach: treat path addition, removal, rename, algorithm change, and unreadable input as non-equality; never authorize a partial fingerprint.
      (Req: Validity fingerprint scope)
- [x] 1.7 Export policy and fingerprint value objects
      `packages/core/src/domain/value-objects/index.ts`: curated exports — expose the new structured policy and fingerprint contracts to Core internals.
      Approach: use named strict-ESM exports and retain only the compatibility aliases documented by the design.
      (Req: Invalidation policy configuration, Validity fingerprint scope)
- [x] 1.8 Make schema metadata the only task-artifact classifier
      `packages/core/src/domain/value-objects/artifact-type.ts`: `hasTasks` semantics — preserve the existing type contract and make downstream validity code consume this marker instead of artifact IDs or filenames.
      Approach: centralize classification at schema resolution so fingerprinting, propagation, task counting, and validation share the same fact.
      (Req: Task artifact validity semantics, Task completion scope)

## 2. Aggregate projections and audit history

- [x] 2.1 Add approval projection models to the Change aggregate
      `packages/core/src/domain/entities/change.ts`: `ChangeProps`, spec approval and sign-off getters — store status, actor, reason, timestamps, fingerprints, invalidation data, and sign-off verification identity.
      Approach: make materialized projections the v2 source of current validity while retaining compatibility getters over them.
      (Req: Materialized approval and verification projections, Spec approval gate, Signoff gate)
- [x] 2.2 Add verification attempt and completed-evidence models
      `packages/core/src/domain/entities/change.ts`: verification projection methods — distinguish an active attempt baseline from completed evidence and preserve superseded attempt history.
      Approach: start and completion are separate aggregate operations; lifecycle movement cannot create either record.
      (Req: Materialized approval and verification projections, State-independent verification operations and audit)
- [x] 2.3 Add focused validity audit events
      `packages/core/src/domain/entities/change.ts`: history event union — add approval invalidation, verification attempt started, verification completed, and verification invalidated events.
      Approach: events contain identifiers, decorated actor, time, cause/reason, and algorithm metadata but never source bytes.
      (Req: History and event sourcing, Verification attempt event serialization)
- [x] 2.4 Implement projection renewal operations
      `packages/core/src/domain/entities/change.ts`: spec approval, sign-off, and verification completion methods — atomically replace the current projection and append the matching audit event.
      Approach: require application-supplied facts and reuse the same `ActorIdentity` for projection and event.
      (Req: Approval recording and state transition, Signoff recording and state transition, Materialized approval and verification projections)
- [x] 2.5 Implement stale and revoked projection mutations
      `packages/core/src/domain/entities/change.ts`: projection invalidators — preserve original evidence, record a focused cause once, and never heal stale/revoked state from later hash equality.
      Approach: compare status and invalidation identity before appending; repeated application is an idempotent no-op.
      (Req: Policy-aware invalidation, Preserve evidence and mark stale)
- [x] 2.6 Refactor aggregate artifact invalidation around structured policy
      `packages/core/src/domain/entities/change.ts`: `invalidate` — accept cause, message, affected artifacts, structured policy, and schema DAG.
      Approach: implement none/surgical/downstream/global expansion, exclude `hasTasks` artifacts from drift-driven propagation, and leave gate recovery to the reconciler.
      (Req: Policy-aware invalidation, Artifacts, Task completion scope)
- [x] 2.7 Preserve evidence across lifecycle movement
      `packages/core/src/domain/entities/change.ts`: transition-related aggregate rules — remove broad approval/verification clearing and reject self-transitions.
      Approach: movement alone preserves matching evidence; explicit focused redesign and movement below sign-off retain only their documented revocation rules.
      (Req: Implementation and verification loop, No lifecycle self-transition)
- [x] 2.8 Add aggregate tests for projections, events, policies, and attempts
      `packages/core/test/domain/entities/change.spec.ts`: focused unit cases — cover projection/history independence, renewal, stale versus revoked, policy expansion, task exclusion, supersession, completion, idempotence, gates, and self-transition rejection.
      Approach: assert exact projection status and event counts rather than snapshots.
      (Req: Materialized approval and verification projections, Policy-aware invalidation, State-independent verification operations and audit)
- [x] 2.9 Add value-object tests for normalization and equality
      `packages/core/test/domain/value-objects/validity-fingerprint.spec.ts`: algorithm cases — exercise BOM, CRLF/CR, trailing whitespace, whitespace-only lines, final newline, internal whitespace, binary bytes, empty maps, path sets, and algorithm changes.
      Approach: use explicit byte/text fixtures and order-independent maps.
      (Req: Validity fingerprint scope)

## 3. Versioned manifest and repository compatibility

- [x] 3.1 Define discriminated v1 and v2 manifest schemas
      `packages/core/src/infrastructure/fs/manifest.ts`: raw manifest types and validators — retain the legacy reader and add `manifestVersion: 2`, structured policy, artifact array, projections, attempts, fingerprints, and new events.
      Approach: dispatch by explicit version, treat absent version as v1, and reject unsupported future versions with a typed error.
      (Req: Manifest format compatibility, Manifest structure)
- [x] 3.2 Serialize all v2 fingerprint and event variants
      `packages/core/src/infrastructure/fs/manifest.ts`: raw fingerprint/projection/history schemas — preserve algorithm metadata, concrete empty maps, nullable legacy evidence, attempt state, and invalidation cause.
      Approach: validate every event variant explicitly and never persist file contents.
      (Req: Fingerprint serialization, Verification attempt event serialization)
- [x] 3.3 Implement the side-effect-free v1 adapter
      `packages/core/src/infrastructure/fs/manifest-change-loader.ts`: legacy adapter — replay legacy history once in memory to derive approval/sign-off projections and mark unknown evidence non-authoritative.
      Approach: a later broad invalidation yields stale legacy-unknown, signoff-invalidated yields revoked, and current files never invent a historical baseline.
      (Req: Manifest format compatibility, Materialized approval and verification projections)
- [x] 3.4 Implement native v2 aggregate hydration
      `packages/core/src/infrastructure/fs/manifest-change-loader.ts`: v2 loader — hydrate projections, attempts, structured policy, artifacts, and append-only history without evaluating freshness.
      Approach: preserve absent projection versus `null` legacy fingerprint semantics exactly.
      (Req: Manifest structure, Hydration reports fresh file facts without deciding validity)
- [x] 3.5 Make repository reads validity-neutral
      `packages/core/src/infrastructure/fs/change-repository.ts`: `get` and hydration path — remove read-time `Change.invalidate` and report fresh file facts without mutating or migrating storage.
      Approach: validity decisions belong only to `ReconcileChangeValidity`; reads of v1 and v2 remain side-effect-free.
      (Req: Auto-invalidation on get when artifact files drift, Hydration reports fresh file facts without deciding validity)
- [x] 3.6 Add safe whole-file implementation reads
      `packages/core/src/application/ports/change-repository.ts`, `packages/core/src/infrastructure/fs/change-repository.ts`: `implementationFile` — return bytes plus typed missing, unreadable, or outside-root failures.
      Approach: resolve confirmed project-relative paths safely and do not silently omit failures.
      (Req: Validity fingerprint scope, Hydration reports fresh file facts without deciding validity)
- [x] 3.7 Persist complete v2 manifests on real mutation
      `packages/core/src/infrastructure/fs/change-repository.ts`: serializer and `mutate` — write the adapted aggregate as v2 only after a successful mutation callback.
      Approach: retain the per-change lock and temporary-file atomic rename; callback failure leaves no partial write.
      (Req: mutate serializes persisted change updates, Version-aware atomic reconciliation persistence, Atomic writes)
- [x] 3.8 Preserve versioned evidence during archive
      `packages/core/src/infrastructure/fs/archive-repository.ts`: manifest read/copy path — accept v1/v2, reject future versions, and archive native v2 projections/history unchanged.
      Approach: inspection alone never upgrades an archived or active manifest.
      (Req: Versioned validity evidence preservation, Manifest format compatibility)
- [x] 3.9 Make active and archive index caches version-aware
      `packages/core/src/infrastructure/fs/fs-change-index-cache.ts`, `packages/core/src/infrastructure/fs/fs-archive-index-cache.ts`: manifest parsing — use the version discriminator while continuing to project only lightweight index fields.
      Approach: propagate unsupported-version errors and never rewrite or guess unknown data.
      (Req: Manifest format compatibility)
- [x] 3.10 Cover manifest migration and atomic persistence
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`, `packages/core/test/infrastructure/fs/manifest-change-loader.spec.ts`: v1/v2 fixtures — test native v2 round-trip, read-only v1 adaptation, first-real-mutation upgrade, future rejection, bytes, attempt events, archive preservation, and rollback on callback failure.
      Approach: assert original v1 file bytes remain unchanged after reads and all legacy history survives the v2 write.
      (Req: Manifest format compatibility, Atomic writes, Version-aware atomic reconciliation persistence)

## 4. Configuration and policy-facing change commands

- [x] 4.1 Add structured and deprecated config fields
      `packages/core/src/application/ports/config-schema.ts`, `packages/core/src/application/specd-config.ts`: config contracts — add `invalidation` and retain deprecated `invalidationPolicy` only as an input compatibility field.
      Approach: effective config exposes one resolved structured policy and rejects merged configurations containing both forms.
      (Req: Invalidation policy configuration)
- [x] 4.2 Adapt legacy config and apply new defaults
      `packages/core/src/infrastructure/fs/config-loader.ts`: policy parsing — map scalar legacy values to `{artifacts: scalar, workflow: redesign}` and absent legacy values to the legacy default, while native absence uses `{downstream,preserve}`.
      Approach: resolve configuration origin before applying defaults so existing projects keep legacy behaviour.
      (Req: Invalidation policy configuration)
- [x] 4.3 Update CreateChange policy input and persistence
      `packages/core/src/application/use-cases/create-change.ts`: `CreateChangeInput` and execution — accept `invalidation?: InvalidationPolicy` and persist the resolved complete policy in a native v2 change.
      Approach: remove scalar comparisons and use the new-change default when omitted.
      (Req: Input contract, Initial invalidation policy)
- [x] 4.4 Update EditChange partial policy edits
      `packages/core/src/application/use-cases/edit-change.ts`: input/result and execution — accept an `InvalidationPolicyOverride`, preserve unspecified dimensions, and report effective policy and validity effects.
      Approach: perform scope mutation through the reconciler so pre-edit drift cannot be hidden by a new baseline.
      (Req: Invalidation policy edits, Approval invalidation on effective change, Output contract)
- [x] 4.5 Update InvalidateChange policy and result contracts
      `packages/core/src/application/use-cases/invalidate-change.ts`: input/result — accept transient independent overrides, normalized targets, reason, and force; return affected artifacts, projection changes, effective policy, and recovery.
      Approach: force is required only when the request revokes currently valid consent; `none` waives reopening, not freshness.
      (Req: Input contract, Effective policy resolution, Approval guard, Output contract)
- [x] 4.6 Delegate manual change invalidation to canonical reconciliation
      `packages/core/src/application/use-cases/invalidate-change.ts`: `execute` — construct a manual-invalidation intent and let the reconciler apply artifact review, consent revocation, audit, and recovery atomically.
      Approach: do not persist command-scoped overrides or choose lifecycle recovery in the use case.
      (Req: Change-level invalidation is unconditional, Canonical gate-safe invalidation and recovery)
- [x] 4.7 Test configuration and policy use cases
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`, `packages/core/test/application/use-cases/create-change.spec.ts`, `edit-change.spec.ts`, `invalidate-change.spec.ts`: policy matrices — cover defaults, legacy mapping, ambiguity, partial/no-op edits, effective scope changes, overrides, force, none semantics, and recovery.
      Approach: assert policy dimensions, manifest version, projection changes, state, history preservation, and idempotent output explicitly.
      (Req: Invalidation policy configuration, Initial invalidation policy, Invalidation policy edits, Canonical gate-safe invalidation and recovery)

## 5. Fingerprint collection and canonical validity evaluation

- [x] 5.1 Add the binary hashing port and Node adapter
      `packages/core/src/application/ports/binary-content-hasher.ts`, `packages/core/src/infrastructure/node/binary-content-hasher.ts`: `BinaryContentHasher` — expose a SHA-256 port and implement it with Node crypto.
      Approach: return the `sha256:<hex>` value type; export only the port through curated public surfaces.
      (Req: Validity fingerprint scope)
- [x] 5.2 Implement the validity fingerprint application service
      `packages/core/src/application/services/validity-fingerprint-service.ts`: `ValidityFingerprintService` — collect schema-selected non-task artifact hashes and resolved whole implementation files.
      Approach: reuse `compute-artifact-hash.ts` for `preHashCleanup`, normalize/deduplicate paths, order entries lexically, and return `null` fingerprint whenever any required read fails.
      (Req: Artifact hash computation, Validity fingerprint scope)
- [x] 5.3 Preserve the existing artifact cleanup primitive
      `packages/core/src/application/use-cases/_shared/compute-artifact-hash.ts`: cleanup integration — keep this as the single low-level artifact hashing route used by the new service.
      Approach: do not duplicate cleanup semantics or include `hasTasks` content in validity fingerprints.
      (Req: Artifact hash computation, Task artifact validity semantics)
- [x] 5.4 Implement pure validity verdict evaluation
      `packages/core/src/domain/services/change-validity.ts`: `evaluateChangeValidity` — derive artifact, approval, verification, sign-off, blockers, projection changes, and optional recovery from fresh facts.
      Approach: prioritize required stale spec approval to designing, then required stale sign-off beyond done to done, then workflow redesign; never move a change forward.
      (Req: Shared validity verdict and recovery priority)
- [x] 5.5 Make verification staleness phase-aware
      `packages/core/src/domain/services/change-validity.ts`: verification blocker selection — keep stale evidence contextual before verifying and require it at verifying-to-done, sign-off, and archive boundaries.
      Approach: recommend a new in-place verification cycle without forcing a lifecycle rollback solely for verification staleness.
      (Req: Implementation and verification loop, Shared validity verdict and recovery priority)
- [x] 5.6 Implement the central reconciliation use case
      `packages/core/src/application/use-cases/reconcile-change-validity.ts`: `ReconcileChangeValidity.execute` — collect facts inside `ChangeRepository.mutate`, apply only new consequences, and return the committed verdict and recovery.
      Approach: this is the sole owner of artifact review, projection invalidation, audit events, and automatic lifecycle return.
      (Req: Single validity reconciliation owner, Operational status reconciliation)
- [x] 5.7 Implement reconciled mutation orchestration
      `packages/core/src/application/use-cases/reconcile-change-validity.ts`: `mutate` and `ReconciledMutationContext` — evaluate before and after a caller mutation within the serialized window.
      Approach: preserve pre-mutation drift evidence and expose one post-operation result without allowing callers to invoke invalidators directly.
      (Req: Single validity reconciliation owner, Validity reconciliation around artifact validation)
- [x] 5.8 Preserve mandatory recovery when a requested operation fails
      `packages/core/src/application/use-cases/reconcile-change-validity.ts`: recovery commit flow — commit detected recovery first, then retry the requested transition/archive in a second fresh mutation.
      Approach: a thrown later check must not roll back an already-required automatic return.
      (Req: Shared validity verdict and recovery priority, Canonical pre-transition validity reconciliation)
- [x] 5.9 Add fingerprint service tests
      `packages/core/test/application/services/validity-fingerprint-service.spec.ts`: collection cases — cover cleanup, task exclusion, duplicate links, empty implementation, missing/unreadable/outside files, and mixed text/binary inputs.
      Approach: assert deterministic maps and typed failures; partial results never authorize evidence.
      (Req: Validity fingerprint scope, Task artifact validity semantics)
- [x] 5.10 Add verdict and reconciler tests
      `packages/core/test/domain/services/change-validity.spec.ts`, `packages/core/test/application/use-cases/reconcile-change-validity.spec.ts`: policy/recovery matrices — cover preserve/redesign, gates, priority, no forward recovery, overlap/manual intents, stale-does-not-heal, one coherent mutation, and repeated observation.
      Approach: assert identical facts produce no second event or transition.
      (Req: Shared validity verdict and recovery priority, Single validity reconciliation owner)
- [x] 5.11 Integrate the canonical verdict with lifecycle guidance
      `packages/core/src/domain/services/lifecycle-verdict.ts`, `packages/core/src/application/services/lifecycle-evaluation.ts`, `packages/core/src/application/services/lifecycle-guidance.ts`: blocker and next-action projection — consume reconciled validity and phase applicability without reimplementing recovery.
      Approach: stale verification is contextual before verifying, artifact review blocks forward progress, and gate recovery wins over workflow preservation.
      (Req: Shared validity verdict and recovery priority, Identifies blockers, Returns lifecycle context)
- [x] 5.12 Carry reconciled validity through predicate execution
      `packages/core/src/application/services/execute-matching-predicates.ts`: check execution context — pass the already-reconciled verdict to registered checks and keep predicates non-mutating.
      Approach: checks consume one consistent snapshot and never read files or update projections themselves.
      (Req: Evaluation of a transition attempt, Single validity reconciliation owner)
- [x] 5.13 Add typed fingerprint and verification errors
      `packages/core/src/application/errors/fingerprint-input-error.ts`, `packages/core/src/application/errors/verification-attempt-not-found-error.ts`, `packages/core/src/application/errors/verification-fingerprint-mismatch-error.ts`, `packages/core/src/application/errors/verification-not-found-error.ts`, `packages/core/src/domain/errors/unsupported-manifest-version-error.ts`: actionable error contracts — define stable codes and structured metadata for every failure boundary.
      Approach: errors identify failed paths/differences or missing evidence without source bytes and flow through existing CLI `handleError`.
      (Req: Error handling, Existing verification required, Manifest format compatibility)

## 6. Verification operations and registered check

- [x] 6.1 Implement StartVerification contracts and errors
      `packages/core/src/application/use-cases/start-verification.ts`: input/result/deps and typed failures — define state-independent start with attempt and supersession metadata.
      Approach: accept every active lifecycle state and never transition or record success.
      (Req: State-independent verification operations and audit)
- [x] 6.2 Enforce implementation readiness before verification baseline capture
      `packages/core/src/application/use-cases/start-verification.ts`: `execute` — refresh tracking and run registered `impl.filesResolved` and `impl.linksInScope` checks before hashing.
      Approach: fail before mutation on either check failure; capture only a complete artifact plus implementation fingerprint.
      (Req: State-independent verification operations and audit, Workflow requires enforcement)
- [x] 6.3 Start and supersede attempts atomically
      `packages/core/src/application/use-cases/start-verification.ts`: reconciled mutation — append a decorated-actor attempt event and replace only the active attempt.
      Approach: every successful explicit start creates a new attempt, even for identical inputs, while completed evidence remains independently materialized.
      (Req: State-independent verification operations and audit)
- [x] 6.4 Implement CompleteVerification contracts and comparison
      `packages/core/src/application/use-cases/complete-verification.ts`: `execute` — require an active attempt, recollect fresh inputs, and compare them through the shared fingerprint evaluator.
      Approach: missing attempt, unreadable input, or mismatch leaves baseline and completed evidence unchanged and never runs tests itself.
      (Req: State-independent verification operations and audit)
- [x] 6.5 Record successful verification completion atomically
      `packages/core/src/application/use-cases/complete-verification.ts`: reconciled mutation — persist completed evidence, completion actor/time, attempt ID, fingerprint, and event only on equality.
      Approach: consume the privacy-decorated actor once and reuse it in projection and history.
      (Req: Materialized approval and verification projections, State-independent verification operations and audit)
- [x] 6.6 Implement InvalidateVerification contracts and typed absence error
      `packages/core/src/application/use-cases/invalidate-verification.ts`: `InvalidateVerification` and `VerificationNotFoundError` — require completed evidence and return invalidation, sign-off, blockers, recovery, and next-action details.
      Approach: accept legacy unknown completed evidence but reject absent or active-only evidence without mutation.
      (Req: Input and result contracts, Existing verification required)
- [x] 6.7 Invalidate verification through the reconciler
      `packages/core/src/application/use-cases/invalidate-verification.ts`: `execute` — submit a verification-invalidation intent that preserves fingerprints, marks evidence stale once, and stales dependent valid sign-off.
      Approach: never hash, start an attempt, run tests, validate artifacts, approve a gate, or self-transition.
      (Req: Preserve evidence and mark stale, Canonical reconciliation and recovery, No lifecycle self-transition)
- [x] 6.8 Add `verification.current` as a non-mutating registered check
      `packages/core/src/application/checks/verification-current.ts`, `packages/core/src/domain/services/transition-checks.ts`: check and label — consume the reconciled verdict and return pass, required, in-progress, stale, or explicit not-required skip.
      Approach: include structured differences/failures and the `changes verification start` repair command; never read files in the check.
      (Req: Evaluation of a transition attempt, Registry bindings for this capability)
- [x] 6.9 Bind verification freshness only to the verifying exit
      `packages/core/src/domain/services/check-bindings.ts`, `packages/core/src/application/checks/workflow-check-registry.ts`: registry bindings — attach `verification.current` to `verifying -> done` and reuse the verdict at sign-off/archive boundaries.
      Approach: entering verifying runs implementation readiness only and does not create a baseline.
      (Req: Registry bindings for this capability, Verification attempt lifecycle)
- [x] 6.10 Test verification use cases and check branches
      `packages/core/test/application/use-cases/start-verification.spec.ts`, `complete-verification.spec.ts`, `invalidate-verification.spec.ts`, `packages/core/test/application/checks/verification-current.spec.ts`: operation matrices — cover active states, readiness failures, supersession, mismatch, success, unfinished evidence, legacy evidence, idempotence, sign-off consequence, and all check outcomes.
      Approach: assert baseline preservation, event counts, no lifecycle self-transition, blockers, and next action.
      (Req: State-independent verification operations and audit, Existing verification required, Preserve evidence and mark stale, Evaluation of a transition attempt)
- [x] 6.11 Update existing approval checks to consume projections
      `packages/core/src/application/checks/approval-spec.ts`, `packages/core/src/application/checks/approval-signoff.ts`: check execution — evaluate materialized status and the canonical verdict instead of replaying history or hashing independently.
      Approach: disabled gates skip without waiving artifact freshness; enabled sign-off additionally requires current completed verification.
      (Req: Spec approval gate, Signoff gate, Registry bindings for this capability)

## 7. Approval, artifact validation, and actor privacy

- [x] 7.1 Rework ApproveSpec around canonical reconciliation
      `packages/core/src/application/use-cases/approve-spec.ts`: `execute` — reconcile first, require enabled gate, exact `ready` state, and current validated non-task artifacts before recording consent.
      Approach: recollect the shared artifact fingerprint inside a reconciled mutation and do not move lifecycle state.
      (Req: Canonical pre-approval reconciliation, Approval recording and state transition)
- [x] 7.2 Rework ApproveSignoff around current verification
      `packages/core/src/application/use-cases/approve-signoff.ts`: `execute` — refresh links, reconcile, require exact `done`, no blockers, and current completed verification.
      Approach: recollect the complete fingerprint, require equality with verification, and persist its `verificationId` without moving state.
      (Req: Canonical pre-signoff reconciliation, Signoff recording and state transition)
- [x] 7.3 Preserve privacy-decorated approval and verification identities
      `packages/core/src/composition/composition-resolver.ts`, `packages/core/src/composition/privacy-actor-resolver.ts`, approval/verification factories — inject actors only through `getActorResolver()` for config composition.
      Approach: resolve identity once per logical operation, reuse the exact decorated value in projection and audit event, never read Git/VCS identity directly, and never decorate twice.
      (Req: Persistence and return value, Established use-case composition signatures)
- [x] 7.4 Reconcile before and after artifact validation
      `packages/core/src/application/use-cases/validate-artifacts.ts`: validation mutation — capture pre-validation drift, validate content, and establish the new structural baseline without healing stale approval or verification.
      Approach: automatic content drift ignores `hasTasks` artifacts, while their required shape and task syntax remain validated.
      (Req: Validity reconciliation around artifact validation, Policy-aware drift materialization, Approval invalidation on content change)
- [x] 7.5 Test approval eligibility and persistence
      `packages/core/test/application/use-cases/approve-spec.spec.ts`, `approve-signoff.spec.ts`: approval matrices — cover disabled gates, wrong states, drift, pending/missing artifacts, tasks exclusion, empty implementation, current verification, fingerprint equality, history retention, and failed eligibility.
      Approach: assert one shared snapshot and the same decorated actor in current projection and event.
      (Req: Artifact hash computation, Persistence and return value, Canonical pre-approval reconciliation, Canonical pre-signoff reconciliation)
- [x] 7.6 Test privacy decorator preservation across new flows
      `packages/core/test/composition/` and affected use-case tests: privacy modes — exercise mask, hash, and anonymization for approval, sign-off, verification start/complete/invalidate, and reconciliation invalidation.
      Approach: assert raw names, emails, and filtered metadata never occur in the manifest; direct-deps overloads preserve supplied identity without a second transformation.
      (Req: Config-based factory delegates through resolveApproveSpecDeps, Config-based factory delegates through resolveApproveSignoffDeps, Established use-case composition signatures)
- [x] 7.7 Test artifact validation reconciliation
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: drift and task cases — cover pre-existing drift, successful revalidation, stale evidence retention, artifact-policy expansion, and task-only edits.
      Approach: assert task structure is still checked while task content cannot invalidate approvals or verification.
      (Req: Validity reconciliation around artifact validation, Task artifact validity semantics)

## 8. Transition, status, and archive integration

- [x] 8.1 Reconcile before transition checks
      `packages/core/src/application/use-cases/transition-change.ts`: preflight — persist canonical invalidity/recovery before evaluating the requested edge and report the committed current state on failure.
      Approach: remove unconditional designing invalidation and broad sign-off inference from transition code.
      (Req: Canonical pre-transition validity reconciliation, Skill-aligned backward hop invalidation)
- [x] 8.2 Reconcile after mutation-capable transition hooks
      `packages/core/src/application/use-cases/transition-change.ts`: post-hook preflight — recollect facts and rerun applicable checks before persisting the edge.
      Approach: bind `verification.current` only to verifying-to-done; entry to verifying and verifying self-transition never create/reset evidence.
      (Req: Verification attempt lifecycle, Workflow requires enforcement)
- [x] 8.3 Preserve focused evidence on backward transitions
      `packages/core/src/application/use-cases/transition-change.ts`: backward-edge handling — preserve unchanged artifacts, spec approval, and verification; revoke only sign-off when explicitly returning below it as documented.
      Approach: allow explicit transition to designing from supported states without treating designing-to-designing as an invalidation mechanism.
      (Req: Artifact validation clearing on verifying to implementing, Transition to designing from any state)
- [x] 8.4 Project operational validity through GetStatus
      `packages/core/src/application/use-cases/get-status.ts`: dependencies and execution — reconcile every active status request before projecting approvals, attempt, completed verification, fingerprints, blockers, recovery, and next action.
      Approach: active `ifModifiedSince` cannot skip external freshness evaluation; draft status retains the timestamp shortcut.
      (Req: Constructor dependencies, Operational status reconciliation, Approval, verification, and fingerprint status projection, Revision evaluation for conditional status queries)
- [x] 8.5 Honor optional tracking refresh without skipping reconciliation
      `packages/core/src/application/use-cases/get-status.ts`: `refreshImplementationTracking` — optionally refresh links but always evaluate currently known implementation and artifact facts.
      Approach: distinguish active attempt from completed evidence and ensure stale verification does not dominate earlier-phase guidance.
      (Req: Optional pre-read implementation tracking refresh, Returns lifecycle context, Identifies blockers)
- [x] 8.6 Add live canonical archive preflight
      `packages/core/src/application/use-cases/archive-change.ts`: preflight — reconcile before checks and again after hooks, then enforce current artifacts, tasks, implementation, verification, enabled gates, overlap, schema, workspace, and dependency checks.
      Approach: defer transition to archiving and repository archive until all post-hook facts pass.
      (Req: Canonical validity archive preflight, Deferred transition to archiving, Archive repository call)
- [x] 8.7 Reconcile overlap invalidation on peer changes
      `packages/core/src/application/use-cases/archive-change.ts`: overlap handling — delegate each affected active peer to its reconciler with a focused conflict intent.
      Approach: apply the peer's artifact/workflow policy and gate priority idempotently rather than mutating its aggregate directly.
      (Req: Policy-aware invalidation, Canonical validity archive preflight)
- [x] 8.8 Test transition reconciliation and evidence preservation
      `packages/core/test/application/use-cases/transition-change.spec.ts`, `packages/core/test/domain/services/transition-checks.spec.ts`: edge cases — cover committed recovery on failure, pre/post-hook drift, disabled predicates, ready-only entry, backward preservation, explicit redesign, self-entry neutrality, and verifying exit evidence.
      Approach: assert requested transitions never manufacture verification or erase unrelated evidence.
      (Req: Canonical pre-transition validity reconciliation, Verification attempt lifecycle, Spec approval is a check not a pending hop, Signoff is a check not a pending hop)
- [x] 8.9 Test reconciled status projection
      `packages/core/test/application/use-cases/get-status.spec.ts`: active/draft cases — cover persistence once, external drift despite unchanged manifest timestamp, refresh option, attempt/evidence distinction, phase-aware guidance, and policy/gate recovery.
      Approach: assert result reflects the committed post-recovery aggregate and canonical checks.
      (Req: Operational status reconciliation, Approval, verification, and fingerprint status projection, Identifies blockers)
- [x] 8.10 Test archive live facts and v2 preservation
      `packages/core/test/application/use-cases/archive-change.spec.ts`: preflight and archive cases — cover post-hook changes, unfinished tasks, unresolved links, stale/missing evidence, enabled gates, overlap reconciliation, and archived v2 evidence.
      Approach: assert no archive call or archiving transition occurs before every live check passes.
      (Req: Canonical validity archive preflight, Deferred transition to archiving, Versioned validity evidence preservation)

## 9. Composition and public API wiring

- [x] 9.1 Add canonical factory overloads for reconciliation and verification use cases
      `packages/core/src/application/use-cases/reconcile-change-validity.ts`, `start-verification.ts`, `complete-verification.ts`, `invalidate-verification.ts`: `createX` and `resolveXDeps` — implement deps and config overloads through `normalizeCompositionFactoryArgs`.
      Approach: reject options with the deps overload and never bootstrap a kernel merely to resolve one use case.
      (Req: Established use-case composition signatures)
- [x] 9.2 Wire one shared fingerprint service and reconciler
      `packages/core/src/composition/composition-resolver.ts`, `packages/core/src/composition/use-cases/workflow-check-registry.ts`: resolver methods — reuse shared dependencies and the decorated actor resolver across all modified use cases.
      Approach: avoid independent validity coordinators or per-handler fingerprint implementations.
      (Req: Single validity reconciliation owner, Config-based factory delegates through resolveApproveSpecDeps, Config-based factory delegates through resolveApproveSignoffDeps)
- [x] 9.3 Mount verification operations on the kernel
      `packages/core/src/composition/kernel.ts`, `packages/core/src/composition/index.ts`, `packages/core/src/composition/use-cases/index.ts`: kernel contract and construction — add start, complete, and invalidate under `kernel.changes`.
      Approach: keep all mocks and hosts type-complete after the additive kernel surface change.
      (Req: Established use-case composition signatures, Start and complete delegation, Delegation to InvalidateVerification)
- [x] 9.4 Export new Core and SDK contracts
      `packages/core/src/application/use-cases/index.ts`, `packages/core/src/application/index.ts`, `packages/core/src/application/ports/index.ts`, `packages/core/src/ports.ts`, `packages/core/src/public.ts`, package barrels, `packages/sdk/src/ports.ts`, `packages/sdk/src/core-reexports.ts`: curated named exports — expose ports, value types, errors, use cases, and factory signatures.
      Approach: never export the concrete Node hasher; SDK hosts continue importing through `@specd/sdk`.
      (Req: Constructor dependencies, Established use-case composition signatures)
- [x] 9.5 Test composition, barrels, and SDK parity
      `packages/core/test/composition/`, `packages/core/test/barrel-kernel-coverage.spec.ts`, SDK re-export tests — cover deps/config equivalence, shared resolver reuse, privacy decorator routing, invalid mixed arguments, kernel completeness, and public export completeness.
      Approach: prove no config factory constructs an independent kernel or bypasses `getActorResolver()`.
      (Req: Config-based factory delegates through resolveApproveSpecDeps, Config-based factory delegates through resolveApproveSignoffDeps, Established use-case composition signatures)

## 10. CLI contracts and rendering

- [x] 10.1 Replace create policy flag with independent dimensions
      `packages/cli/src/commands/change/create.ts`: command options — add `--artifact-policy` and `--workflow-policy`, resolve a complete policy, and remove the scalar flag.
      Approach: pass policy to Core without reproducing default or invalidation logic in the handler.
      (Req: Command signature, Structured invalidation policy input)
- [x] 10.2 Add partial policy flags to change edit
      `packages/cli/src/commands/change/edit.ts`: command options/output — accept either dimension independently and render effective policy and recovery.
      Approach: omit unspecified keys so Core preserves their current values.
      (Req: Command signature, Approval invalidation)
- [x] 10.3 Update change invalidate flags and reporting
      `packages/cli/src/commands/change/invalidate.ts`: options/output — accept independent transient overrides and render affected artifacts, gates, idempotence, blockers, and committed recovery.
      Approach: warn precisely when valid consent needs `--force`; never choose recovery in CLI code.
      (Req: Command signature, Change-level invalidation, Effective policy resolution, Approval guard, Reporting, none semantics)
- [x] 10.4 Render materialized approval evidence
      `packages/cli/src/commands/change/approve.ts`: success output — show projection status, fingerprint algorithms/file counts, and sign-off verification ID while distinguishing empty observed implementation from unknown legacy evidence.
      Approach: delegate all hashing and identity handling to Core and never emit full hashes or source content by default.
      (Req: Artifact hash computation, Output on success)
- [x] 10.5 Render reconciled status and canonical next action
      `packages/cli/src/commands/change/status.ts`: all formatters — display artifact/spec/sign-off/verification validity, active attempt separately from completed evidence, recovery, blockers, and phase-aware next command from `GetStatus`.
      Approach: do not re-derive lifecycle guidance in the CLI.
      (Req: Lifecycle projections come from GetStatus checks, Reconciled validity and next-action output)
- [x] 10.6 Render validity-aware transition failures
      `packages/cli/src/commands/change/transition.ts`: repair output — consume fresh Core diagnostics, recommend in-place verification where applicable, and add no restart-verification option.
      Approach: preserve current next-transition behaviour while exposing committed recovery and exact repair command.
      (Req: Next-transition resolution, Validity-aware transition guidance)
- [x] 10.7 Implement the verification command group
      `packages/cli/src/commands/change/verification.ts`, `packages/cli/src/index.ts`: `start`, `complete`, `invalidate` commands — validate exact positional arguments/options and delegate once to the matching kernel method.
      Approach: require `--reason` only for invalidate; use shared `handleError` and standard format options.
      (Req: Command group and signature, Start and complete delegation, Delegation to InvalidateVerification, Error handling)
- [x] 10.8 Render verification operation results and discoverability
      `packages/cli/src/commands/change/verification.ts`: output — report attempt/evidence IDs, algorithms/counts, supersession, idempotence, sign-off consequence, recovery, blockers, and next command.
      Approach: use returned use-case fields unchanged and never expose source content or full hashes by default.
      (Req: Success and idempotent output, Status and skill discoverability)
- [x] 10.9 Extend typed CLI kernel fixtures
      `packages/cli/test/commands/helpers.ts`: mock kernel — add verification methods and updated result/policy types without weakening TypeScript types.
      Approach: keep all existing command tests compiling and make new delegation calls observable.
      (Req: Command group and signature)
- [x] 10.10 Test policy and approval CLI changes
      `packages/cli/test/commands/change/create.spec.ts`, `edit.spec.ts`, `invalidate.spec.ts`, `approve.spec.ts`: flag/output cases — cover defaults, partial dimensions, ambiguity/errors, force warning, none semantics, empty versus unknown evidence, all formats, and exit codes.
      Approach: assert thin delegation and exact Core input rather than duplicating domain outcomes in mocks.
      (Req: Structured invalidation policy input, Reporting, Output on success)
- [x] 10.11 Test status and transition CLI guidance
      `packages/cli/test/commands/change/status.spec.ts`, `transition.spec.ts`: formatter cases — cover attempts/evidence, blockers, recovery, phase-aware actions, and absence of a restart flag.
      Approach: exercise text plus structured formats and expected exit 1 repair paths.
      (Req: Reconciled validity and next-action output, Validity-aware transition guidance)
- [x] 10.12 Test verification CLI delegation and errors
      `packages/cli/test/commands/change/verification.spec.ts`: command matrix — cover exact signatures, one Core call per command, required reason, valid/idempotent output, all formats, typed failures, and next-action discoverability.
      Approach: ensure start/complete never transition state and invalidate never captures a baseline in handler logic.
      (Req: Command group and signature, Start and complete delegation, Delegation to InvalidateVerification, Error handling, Success and idempotent output)

## 11. Skill protocol updates

- [x] 11.1 Teach shared skill context to trust canonical reconciliation
      `packages/skills/templates/shared/shared.md.tpl`: status and repair guidance — explain materialized validity, automatic committed recovery, and in-place artifact review.
      Approach: skills consume `GetStatus` blockers/next action and never calculate fingerprints or choose recovery.
      (Req: Cross-skill artifact review and recovery)
- [x] 11.2 Make specd-verify own explicit verification attempts
      `packages/skills/templates/skills/specd-verify/SKILL.md.tpl`: verification protocol — run CLI start before verification work and complete only after successful work; on mismatch start again and repeat.
      Approach: full mode owns the outer attempt even when it invokes compliance, and may operate without requiring current lifecycle state to be verifying.
      (Req: Structural Validation and Content Review, Status and skill discoverability)
- [x] 11.3 Give standalone compliance explicit attempt ownership
      `packages/skills/templates/skills/specd-compliance/SKILL.md.tpl`: standalone/delegated modes — standalone runs start/complete; delegated mode receives outer attempt context and runs neither.
      Approach: report-only mode does not claim successful completion.
      (Req: Structural Validation and Content Review)
- [x] 11.4 Update design and implementation recovery guidance
      `packages/skills/templates/skills/specd-design/SKILL.md.tpl`, `specd-implement/SKILL.md.tpl`: review routing — allow in-place artifact validation without gates and route required stale spec approval to design.
      Approach: follow canonical next action; do not assume every drift requires running the design skill.
      (Req: Cross-skill artifact review and recovery, Reconciled invalidation protocol in lifecycle templates)
- [x] 11.5 Update archive skill preflight guidance
      `packages/skills/templates/skills/specd-archive/SKILL.md.tpl`: stale evidence handling — consume status recovery and route missing/stale verification to the explicit current-state cycle.
      Approach: do not bypass tasks, artifacts, implementation, verification, or gates.
      (Req: In-place approval gates in workflow templates, Reconciled invalidation protocol in lifecycle templates)
- [x] 11.6 Test source skill workflow protocols
      `packages/skills/test/template-workflow.spec.ts`, `packages/skills/test/skill-repository.spec.ts`: source template assertions — cover independent and delegated attempt ownership, report-only behaviour, repeated work after renewed baseline, recovery routing, and in-place review.
      Approach: assert commands and stop points, not incidental prose snapshots.
      (Req: Cross-skill artifact review and recovery, Structural Validation and Content Review)
- [x] 11.7 Regenerate installed agent skills and verify parity
      `dev/scripts/sync-codex-skills.js`, generated `.agents/skills` and `.codex/skills`, plugin-agent install tests — run `pnpm ai-agents:sync` after template changes and validate generated copies.
      Approach: never hand-edit divergent generated instructions; rerun all plugin-agent installation coverage.
      (Req: In-place approval gates in workflow templates, Reconciled invalidation protocol in lifecycle templates)

## 12. Documentation and architectural record

- [x] 12.1 Document structured policy configuration and migration
      `docs/config/config-reference.md`, `docs/guide/configuration.md`: invalidation settings — explain independent dimensions, `{downstream,preserve}` native default, legacy scalar mapping, ambiguity rejection, and manifest compatibility.
      Approach: clearly separate artifact reopening from workflow recovery and mandatory gate behaviour.
      (Req: Invalidation policy configuration)
- [x] 12.2 Document lifecycle validity and verification workflow
      `docs/guide/workflow.md`, `docs/guide/_sections/getting-started/lifecycle.md`, `docs/guide/_sections/getting-started/usage.md`: user workflow — describe projections, drift reconciliation, gate returns, in-place review, verification start/complete/invalidate, and phase-aware status guidance.
      Approach: state that transitions never capture or complete verification and tasks are excluded only from fingerprint/drift invalidation.
      (Req: Implementation and verification loop, State-independent verification operations and audit)
- [x] 12.3 Document CLI commands and outputs
      `docs/cli/cli-reference.md`: change create/edit/invalidate/approve/status/transition/verification — record flags, signatures, formats, exit codes, idempotence, and repair commands.
      Approach: include empty versus unknown fingerprint semantics and no transition restart flag.
      (Req: Command signature, Command group and signature, Status and skill discoverability)
- [x] 12.4 Add the dedicated verification command page
      `docs/cli/change-verification.md`: new command documentation — describe start, complete, and invalidate signatures, examples, formats, idempotence, typed failures, and retry-in-current-state guidance; link it from CLI navigation/reference.
      Approach: keep the page delivery-focused and delegate validity semantics to the documented Core contracts.
      (Req: Command group and signature, Error handling, Status and skill discoverability)
- [x] 12.5 Document Core use cases and composition forms
      `docs/core/use-cases.md`: reconciler and verification APIs — document inputs/results/errors, deps/config overloads, shared resolver behaviour, and privacy-decorated actor requirement.
      Approach: identify `ReconcileChangeValidity` as sole validity mutation coordinator.
      (Req: Single validity reconciliation owner, Established use-case composition signatures)
- [x] 12.6 Document the new port and typed errors
      `docs/core/ports.md`, `docs/core/errors.md`: Core reference entries — document `BinaryContentHasher`, fingerprint input failures, verification absence/mismatch failures, and unsupported manifest versions.
      Approach: label Core-only/plugin consumers appropriately and direct host integrators to `@specd/sdk` port re-exports.
      (Req: Validity fingerprint scope, Error handling, Manifest format compatibility)
- [x] 12.7 Record the materialized validity architecture decision
      `docs/adr/0028-materialized-validity-reconciliation.md`: MADR decision — capture context, decision, alternatives, consequences, confirmation, migration/rollback boundary, and affected specs.
      Approach: explain append-only history plus v2 projections, central reconciliation, and why reads remain side-effect-free.
      (Req: Manifest format compatibility, Single validity reconciliation owner)

## 13. Cross-package quality gates

- [x] 13.1 Add task-artifact semantic tests
      schema-format and validation test suites: `hasTasks` scenarios — prove marker-driven exclusion from fingerprints and automatic drift while retaining required presence, structural validation, live task counting, and archive blocking.
      Approach: use an artifact not named `tasks.md` to prove behaviour follows schema metadata rather than filename.
      (Req: Task artifact validity semantics, taskCompletionCheck)
- [x] 13.2 Verify check-registry composition
      `packages/core/test/composition/use-cases/workflow-check-registry.spec.ts`: registry cases — assert `verification.current` binding only on verifying-to-done and freshness reuse at sign-off/archive consumers.
      Approach: include disabled predicates and post-hook mismatch failure.
      (Req: Registry bindings for this capability)
- [x] 13.3 Run Core unit and integration tests
      `packages/core`: test suite — execute `pnpm --filter @specd/core test` after all Core changes.
      Approach: fix regressions without weakening typed mocks, exact optional properties, or scenario assertions.
      (Req: all Core requirements)
- [x] 13.4 Run CLI tests
      `packages/cli`: test suite — execute `pnpm --filter @specd/cli test` after CLI/kernel changes.
      Approach: verify text and structured outputs plus standard error handling remain compatible.
      (Req: all CLI requirements)
- [x] 13.5 Run skill and plugin-agent tests
      `packages/skills` and plugin-agent packages: test suites — execute the skills tests and affected installation/parity tests after regeneration.
      Approach: ensure source templates and generated copies express the same attempt ownership and recovery rules.
      (Req: Cross-skill artifact review and recovery, In-place approval gates in workflow templates)
- [x] 13.6 Build the monorepo and verify public typing
      workspace packages: build — run `pnpm build` and resolve strict ESM, named export, JSDoc, SDK re-export, and exact optional property errors.
      Approach: do not introduce `any`, circular workspace dependencies, or public concrete infrastructure adapters.
      (Req: Constructor dependencies, Established use-case composition signatures)

## 14. Manual migration and end-to-end verification

- [x] 14.1 Verify native v2 creation defaults
      CLI/manual fixture: new change manifest — create without policy flags and inspect the stored manifest.
      Approach: expect `manifestVersion: 2` and `{ artifacts: downstream, workflow: preserve }`.
      (Req: Manifest structure, Initial invalidation policy)
- [x] 14.2 Verify lazy v1 migration and future-version rejection
      CLI/manual fixtures: legacy and future manifests — read v1 through status, perform a real edit, and attempt to read an unsupported version.
      Approach: expect no read rewrite, one atomic v2 upgrade retaining history on edit, and exit 1 with `UNSUPPORTED_MANIFEST_VERSION` for the future version.
      (Req: Manifest format compatibility, Version-aware atomic reconciliation persistence)
- [x] 14.3 Verify spec-gate drift recovery and idempotence
      CLI/manual change: enabled spec approval — approve in ready, edit a fingerprinted artifact, and run status twice.
      Approach: expect one stale event, committed return to designing, and no duplicate event on the second observation.
      (Req: Canonical pre-approval reconciliation, Shared validity verdict and recovery priority)
- [x] 14.4 Verify ungated preserve with in-place artifact review
      CLI/manual change: implementing with preserve — drift a non-task artifact while spec gate is disabled and inspect status.
      Approach: expect implementing retained, forward blocker present, and in-place review guidance rather than forced design.
      (Req: Policy-aware invalidation, Cross-skill artifact review and recovery)
- [x] 14.5 Verify task-artifact exception and archive task gate
      CLI/manual change: schema-marked task artifact — edit only its content, then leave a task incomplete and attempt archive.
      Approach: expect no approval/verification drift from content and a live task blocker at archive.
      (Req: Task artifact validity semantics, taskCompletionCheck)
- [x] 14.6 Verify start, complete, and mismatch recovery
      CLI/manual change: explicit verification — start from implementing or done, complete unchanged inputs, then modify a linked file during a later attempt.
      Approach: expect no transition on start, valid completion on equality, mismatch refusal with preserved baseline, then require a new start and repeated verification work.
      (Req: State-independent verification operations and audit, Start and complete delegation)
- [x] 14.7 Verify explicit verification invalidation idempotence
      CLI/manual change: completed evidence — run verification invalidate twice.
      Approach: expect `invalidated: true` then `false`, one event, retained fingerprint, dependent sign-off consequence when applicable, and no self-transition.
      (Req: Preserve evidence and mark stale, Success and idempotent output)
- [x] 14.8 Verify verifying-to-done evidence states
      CLI/manual transitions: absent, active-only, stale, and fresh completed verification — attempt verifying-to-done in each state.
      Approach: expect three actionable failures followed by success only for fresh evidence.
      (Req: Evaluation of a transition attempt, Verification attempt lifecycle)
- [x] 14.9 Verify empty and legacy-unknown implementation evidence
      CLI/manual sign-off fixtures: resolved empty set and migrated v1 sign-off — inspect status and approval output.
      Approach: expect concrete `{files:{}}` for native evidence and `implementation: null` plus renewal requirement for legacy unknown evidence.
      (Req: Artifact hash computation, Approval, verification, and fingerprint status projection)
- [x] 14.10 Verify privacy-decorated identities end to end
      CLI/manual manifests: configured mask, hash, and anonymization — perform approval and verification operations and inspect v2 projection/history data.
      Approach: expect the same decorated actor in projection/event and no raw name, email, or filtered metadata anywhere on disk or in output.
      (Req: Persistence and return value, Established use-case composition signatures)
- [x] 14.11 Verify generated skill parity
      `.agents/skills`, `.codex/skills`: generated protocols — inspect verify and compliance after `pnpm ai-agents:sync`.
      Approach: confirm full/standalone/delegated ownership and retry guidance match source templates exactly.
      (Req: Structural Validation and Content Review, Reconciled invalidation protocol in lifecycle templates)

## 15. Compliance follow-up: scope-aware approval and unified validity

- [x] 15.1 Add the scope-aware spec-approval fingerprint value object
      `packages/core/src/domain/value-objects/validity-fingerprint.ts`: `SpecApprovalFingerprint`, `FingerprintDifference`, `compareSpecApprovalFingerprints` — add canonical `specIds` beside the artifact fingerprint and explicit spec-added/spec-removed differences.
      Approach: sort and deduplicate canonical IDs; compare set plus artifact fingerprint; treat reordering as equal and preserve existing artifact/implementation comparison APIs.
      (Req: Validity fingerprint scope, Fingerprint serialization)
- [x] 15.2 Persist scope snapshots in the aggregate projection and approval events
      `packages/core/src/domain/entities/change.ts`: `SpecApprovalProjection`, `recordSpecApproval`, history union — replace artifact-only consent input with `SpecApprovalFingerprint` and write the identical snapshot to current projection and every new `spec-approved` event.
      Approach: renew only the current projection, retain every older event and its earlier scope, and reuse the same decorated actor identity for projection and event.
      (Req: Materialized approval and verification projections, Approval recording and state transition)
- [x] 15.3 Adapt manifest readers for approvals without scope
      `packages/core/src/infrastructure/fs/manifest.ts`, `manifest-change-loader.ts`, `change-repository.ts`: raw approval schemas and v1/v2 adapter — accept v1 and transitional v2 approval records without `specIds` while requiring complete scope-aware data for new writes.
      Approach: project missing scope as stale `legacy-unknown`, never copy current `specIds` into historical evidence, preserve read-only inspection, and keep `manifestVersion: 2` for strict new serialization.
      (Req: Manifest structure, Manifest format compatibility, Fingerprint serialization)
- [x] 15.4 Compute canonical scope during spec approval
      `packages/core/src/application/use-cases/approve-spec.ts`, `packages/core/src/application/services/validity-fingerprint-service.ts`: approval fingerprint flow — collect canonical scope and current non-task artifact fingerprint in the same reconciled mutation.
      Approach: approve only in eligible `ready`, persist one identical complete fingerprint in projection/event, and keep the decorated actor resolver as the sole name/email source.
      (Req: Artifact hash computation, Canonical pre-approval reconciliation, Persistence and return value)
- [x] 15.5 Reconcile scope edits through fingerprint comparison
      `packages/core/src/application/use-cases/edit-change.ts`, `packages/core/src/domain/services/change-validity.ts`: scope-change evaluation — stale spec approval from explicit scope differences instead of unconditional edit invalidation.
      Approach: emit spec-added/spec-removed differences; preserve unaffected verification/sign-off; return `scopeChanged`, `validityChanged`, projection changes, blockers, next action, and automatic return independently.
      (Req: Approval invalidation on effective change, Output contract)
- [x] 15.6 Make validity reconciliation mandatory in every construction path
      `packages/core/src/application/use-cases/transition-change.ts`, `validate-artifacts.ts`, `edit-change.ts`, `get-status.ts`, modified composition factories: dependency contracts — remove optional fallback calls to `Change.invalidate` and no-reconciler shortcuts.
      Approach: kernel/config factories inject the shared `ReconcileChangeValidity`; direct deps without it fail with a typed configuration error rather than selecting legacy mutation semantics.
      (Req: Single validity reconciliation owner, Constructor dependencies)
- [x] 15.7 Add schema-backed operation context to verification start
      `packages/core/src/application/use-cases/start-verification.ts`, composition resolver/factory: `StartVerificationDeps` — add mandatory `schemaProvider` and construct a verification-start operation check context.
      Approach: run registered implementation readiness checks from any active state without fabricating a transition or `verifying -> verifying`; capture no baseline when either check fails.
      (Req: State-independent verification operations and audit, Registry bindings for this capability)
- [x] 15.8 Register dual implementation-readiness boundaries with stable-ID deduplication
      `packages/core/src/domain/services/check-bindings.ts`, `packages/core/src/application/services/execute-matching-predicates.ts`, workflow check registry — bind `impl.filesResolved` and `impl.linksInScope` to forward exit from implementing, entry to verifying, and archive.
      Approach: deduplicate matching checks by `CheckId` in registry order so implementing-to-verifying executes each once; retain protection for other permitted entry/exit routes.
      (Req: Registry bindings for this capability, Verification attempt lifecycle)
- [x] 15.9 Fail closed when verification validity is unavailable
      `packages/core/src/application/checks/verification-current.ts`, transition-check types/errors — distinguish absent verdict from explicit `not-required`.
      Approach: skip only for explicit not-required; otherwise return `VERIFICATION_VALIDITY_UNAVAILABLE` with actionable metadata and never fabricate evidence.
      (Req: Registry bindings for this capability, Verification attempt lifecycle)
- [x] 15.10 Return the rich status projection from GetStatus
      `packages/core/src/application/use-cases/get-status.ts`, public result types — map committed aggregate plus canonical verdict into `ValidityStatusProjection` instead of returning raw `ChangeValidityVerdict`.
      Approach: expose active attempt and completed evidence simultaneously with projection changes, affected artifacts, blockers, automatic return, and next action.
      (Req: Approval, verification, and fingerprint status projection, Returns lifecycle context)
- [x] 15.11 Distinguish verification eligibility errors during sign-off
      `packages/core/src/application/use-cases/approve-signoff.ts`, application error classes/exports — separate never-completed, active-only, stale/legacy-unknown, and mismatched evidence.
      Approach: use `VerificationNotFoundError`, `VerificationInProgressError`, `VerificationStaleError`, and `VerificationFingerprintMismatchError` respectively; stale guidance points to `/specd-verify` and never masquerades as not found.
      (Req: Signoff recording and state transition, Error handling)
- [x] 15.12 Preserve and return the original verification invalidation reason
      `packages/core/src/application/use-cases/invalidate-verification.ts`, result contract — add persisted `reason`, blockers, and next action and continue canonical observation for already-stale evidence.
      Approach: first invalidation writes one reason/event; repeats return `invalidated: false` plus the first stored reason and ignore a different new request reason.
      (Req: Input and result contracts, Preserve evidence and mark stale, Canonical reconciliation and recovery)
- [x] 15.13 Refresh implementation facts after mutation-capable hooks
      `packages/core/src/application/use-cases/transition-change.ts`, `archive-change.ts`: post-hook preflight — refresh tracking, reconcile, and rerun applicable checks before persistence/publication.
      Approach: keep committed recovery when the original request becomes inapplicable and report canonical blockers/next action rather than a protocol-edge or generic invalid-state error.
      (Req: Canonical pre-transition validity reconciliation, Canonical validity archive preflight)
- [x] 15.14 Correct change-edit and change-invalidate CLI validity output
      `packages/cli/src/commands/change/edit.ts`, `invalidate.ts`: text/JSON/TOON renderers — separate scope edits from actual projection changes and render Core-owned blockers, next action, affected gates, and recovery.
      Approach: warn only when `validityChanged`; deprecate legacy `invalidated`; never hard-code designing for force refusal or successful invalidation.
      (Req: Approval invalidation, Reporting, Approval guard)
- [x] 15.15 Correct verification and transition CLI diagnostics
      `packages/cli/src/commands/change/verification.ts`, `transition.ts`: structured/text output — include persisted invalidation reason and actual change name in repair commands.
      Approach: repeated invalidation renders the retained reason in all formats; repair output contains no literal `<name>` and distinguishes committed recovery from invalid protocol edges.
      (Req: Success and idempotent output, Validity-aware transition guidance)
- [x] 15.16 Add scope-aware fingerprint and manifest compatibility tests
      `packages/core/test/domain/value-objects/validity-fingerprint.spec.ts`, `test/infrastructure/fs/manifest-change-loader.spec.ts`, `change-repository.spec.ts`: regression matrix — cover canonical order/deduplication, added/removed specs, projection/event round trip, v1/transitional-v2 unknown scope, strict new writes, and no read rewrite.
      Approach: assert exact differences and retained historical scopes without snapshots or invented current scope.
      (Req: Fingerprint serialization, Manifest format compatibility)
- [x] 15.17 Add approval, scope-edit, actor, and mandatory-reconciler tests
      `packages/core/test/application/use-cases/approve-spec.spec.ts`, `edit-change.spec.ts`, `validate-artifacts.spec.ts`, composition factory tests — cover scope renewal, no-op reordering, actual scope drift, unaffected evidence, decorated identity, and absent-reconciler failure.
      Approach: assert projection/event equality, event counts, recovery, blockers, next action, and no fallback mutation.
      (Req: Canonical pre-approval reconciliation, Approval invalidation on effective change, Single validity reconciliation owner)
- [x] 15.18 Add check binding, deduplication, and fail-closed tests
      `packages/core/test/application/checks/verification-current.spec.ts`, `test/application/services/execute-matching-predicates.spec.ts`, `test/composition/use-cases/workflow-check-registry.spec.ts`, transition tests — cover both readiness bindings, exactly-once overlap, independent boundaries, operation context, missing verdict, and explicit not-required.
      Approach: assert generic progress emits one start/done pair per stable ID and no check mutates evidence.
      (Req: Registry bindings for this capability, Verification attempt lifecycle)
- [x] 15.19 Add sign-off, status, invalidation, and post-hook Core tests
      `packages/core/test/application/use-cases/approve-signoff.spec.ts`, `get-status.spec.ts`, `invalidate-verification.spec.ts`, `transition-change.spec.ts`, `archive-change.spec.ts`: compliance regressions — cover distinct errors, rich projection, original reason, continued observation, refresh after hooks, and committed recovery diagnostics.
      Approach: assert typed codes/results and persistence invariants explicitly; do not use snapshots.
      (Req: Signoff recording and state transition, Approval, verification, and fingerprint status projection, Canonical validity archive preflight)
- [x] 15.20 Add CLI regression coverage for every corrected format
      `packages/cli/test/commands/change/edit.spec.ts`, `invalidate.spec.ts`, `verification.spec.ts`, `transition.spec.ts`, `status.spec.ts`: formatter matrix — cover scope/no-validity warning, blockers/next action, exact gates/targets, original reason, actual repair name, and simultaneous attempt/completed evidence.
      Approach: assert text, JSON, and TOON independently and verify handlers never reconstruct policy.
      (Req: Approval invalidation, Reporting, Success and idempotent output, Reconciled validity and next-action output)
- [x] 15.21 Update docs and generated skills for the corrected contracts
      `docs/core/use-cases.md`, `docs/core/errors.md`, `docs/cli/change-verification.md`, lifecycle docs, skill source templates and generated copies — document scope-aware consent, dual readiness guards, fail-closed verification, distinct errors, rich output, and persisted invalidation reason.
      Approach: edit source templates, run `pnpm ai-agents:sync`, and preserve standalone/delegated verification ownership; update ADR confirmation if its contract summary lists fingerprint fields.
      (Req: Reconciled invalidation protocol in lifecycle templates, Status and skill discoverability)
- [x] 15.22 Run the complete regression and build gates
      Core, CLI, skills, code-graph, plugin-agent packages and monorepo build — run targeted suites followed by the full relevant package tests, lint/typecheck/build, and generated-skill parity.
      Approach: retain the previously passing baseline counts as a lower bound; resolve regressions without weakening types, checks, or compatibility adapters.
      (Req: all follow-up requirements)
- [x] 15.23 Execute manual scope, verification, and recovery edge cases
      CLI/manual v1/v2 fixtures and active changes — exercise spec reorder/add/remove, repeated invalidation with two reasons, unavailable/not-required verification, dual readiness routes, sign-off error variants, force recovery targets, and post-hook drift.
      Approach: inspect manifests and all output formats for retained history, one event per fact, original reasons, correct state, actual command names, and no source-content leakage.
      (Req: all follow-up verification scenarios)

## 16. Full-verification audit remediation

- [x] 16.1 Align strict v2 approval-invalidation difference decoding
      `packages/core/src/infrastructure/fs/manifest.ts`: `rawChangeEventV2Schema` — accept the complete shared `FingerprintDifference` union, including scope `spec` and kinds `spec-added` and `spec-removed`.
      Approach: derive the strict event schema from the same domain union constraints; retain strict rejection for unknown scopes, kinds, and fields.
      (Req: Manifest structure, Fingerprint serialization)
- [x] 16.2 Add strict v2 scope-invalidation round-trip regressions
      `packages/core/test/infrastructure/fs/manifest-change-loader.spec.ts`, `change-repository.spec.ts`: approval-invalidated fixtures — round-trip spec-added and spec-removed events and reject unknown difference tokens.
      Approach: assert exact event preservation after load/save and zero writes for rejected/read-only inputs.
      (Req: Manifest structure, scenario: Scope invalidation events survive strict v2 round trip)
- [x] 16.3 Separate automatic recovery topology from manual transitions
      `packages/core/src/domain/value-objects/change-state.ts`, `packages/core/src/domain/entities/change.ts`: `RECOVERY_ONLY_TRANSITIONS`, `Change.recover` — remove sign-off returns to `done` from manual topology and add the recovery-only aggregate operation.
      Approach: validate recovery cause/from/to, append one attributed transition event, and keep recovery edges out of `VALID_TRANSITIONS`, `HAPPY_PATH_NEXT`, and available transitions.
      (Req: Lifecycle, Archiving escape transitions)
- [x] 16.4 Route central reconciliation through the recovery-only operation
      `packages/core/src/application/use-cases/reconcile-change-validity.ts`: recovery application — replace `isValidTransition` plus `change.transition` with `change.recover`.
      Approach: apply only the evaluator-selected `AutomaticRecovery`, require the persisted source state to match, and preserve idempotence.
      (Req: Single validity reconciliation owner, Policy-aware invalidation)
- [x] 16.5 Test automatic sign-off recovery and manual-edge rejection
      `packages/core/test/domain/entities/change.spec.ts`, `test/application/use-cases/reconcile-change-validity.spec.ts`, `transition-change.spec.ts`: recovery topology matrix — cover `signed-off|archivable|archiving -> done` through reconciliation and reject the same manual requests.
      Approach: assert one recovery event, no advertised manual edge, unchanged archiving escapes, and continued rejection of archiving-to-implementing/verifying.
      (Req: Archiving escape transitions, Canonical pre-transition validity reconciliation)
- [x] 16.6 Add the typed committed-recovery diagnostic
      `packages/core/src/application/errors/reconciled-operation-blocked-error.ts` and error/public barrels — implement `ReconciledOperationBlockedError` with operation, change name, committed state, automatic return, blockers, and next action.
      Approach: extend `SpecdError`, use code `RECONCILED_OPERATION_BLOCKED`, add complete JSDoc, keep fields immutable, and make the message actionable while adapters consume fields directly.
      (Req: Canonical pre-transition validity reconciliation, Canonical validity archive preflight)
- [x] 16.7 Emit recovery diagnostics from transition failures
      `packages/core/src/application/use-cases/transition-change.ts`: post-reconciliation applicability handling — throw the typed recovery error after a committed return instead of a context-free transition failure.
      Approach: preserve the first committed mutation, do not retry the original edge, and populate fields from the canonical post-recovery verdict/guidance.
      (Req: Canonical pre-transition validity reconciliation)
- [x] 16.8 Make archive reconciliation a mandatory dependency
      `packages/core/src/composition/use-cases/archive-change.ts`, `application/use-cases/archive-change.ts`, kernel/SDK mocks: `ArchiveChangeDeps.reconcile` — remove optionality and every no-reconciler/fallback branch.
      Approach: enforce the dependency in direct/config factories and fail with the standard composition-arguments contract when missing.
      (Req: Canonical validity archive preflight, Constructor dependencies)
- [x] 16.9 Move archive planning after post-hook acceptance
      `packages/core/src/application/use-cases/archive-change.ts`: `execute`, `_prepareArchivePlan`, preflight/snapshot sequence — refresh, reconcile, rerun checks/tasks, then build plan, sidecars, preflight, and snapshots.
      Approach: use one accepted post-hook `Change` snapshot for verdict and plan; no snapshot or canonical write may precede acceptance.
      (Req: Canonical validity archive preflight)
- [x] 16.10 Return typed archive recovery instead of generic invalid state
      `packages/core/src/application/use-cases/archive-change.ts`: recovery stop branch — throw `ReconciledOperationBlockedError` when reconciliation committed a return.
      Approach: include committed state, automatic return, blockers, and next action; never undo recovery or map it to bare `InvalidStateTransitionError`.
      (Req: Canonical validity archive preflight)
- [x] 16.11 Add archive construction, ordering, and accepted-link tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`, `test/composition/use-cases/archive-change.spec.ts`: audit regressions — cover missing reconciler, plan ordering, hook-added accepted link, hook-added blocker, and typed recovery.
      Approach: spy on operation order; assert the accepted link appears in the plan/spec-lock and blocked paths perform no snapshot/publish.
      (Req: Canonical validity archive preflight)
- [x] 16.12 Make real schema failure degrade GetStatus before mutation
      `packages/core/src/application/use-cases/get-status.ts`: active execution ordering — call `SchemaProvider.get()` before refresh/reconciliation and catch it into `SCHEMA_RESOLUTION_FAILED` projection.
      Approach: return read-only guidance with no mutating transitions; do not call refresh, reconciler, save, or mutate after failure.
      (Req: Operational status reconciliation, Graceful degradation when schema resolution fails)
- [x] 16.13 Add real-reconciler GetStatus failure and projection tests
      `packages/core/test/application/use-cases/get-status.spec.ts`: schema failure and public validity — use the real reconciler wiring, assert zero mutations, and assert `ValidityStatusProjection` rather than raw verdict.
      Approach: verify active/completed evidence coexist, committed recovery is returned once, and schema failure leaves manifest/history unchanged.
      (Req: Approval, verification, and fingerprint status projection, Operational status reconciliation)
- [x] 16.14 Resolve one decorated identity per approval operation
      `packages/core/src/application/use-cases/reconcile-change-validity.ts`, `approve-spec.ts`, `approve-signoff.ts`: optional supplied actor flow — pass one decorated identity through all reconciliation/mutation stages.
      Approach: human use cases call `identity()` once after the disabled-gate fast failure; reconciler reuses supplied identity and does not call its resolver.
      (Req: Approval recording and state transition, Signoff recording and state transition)
- [x] 16.15 Add actor call-count and identity-object regressions
      `packages/core/test/application/use-cases/approve-spec.spec.ts`, `approve-signoff.spec.ts`, `test/composition/privacy-decorated-identity.spec.ts`: actor propagation — assert one resolver call and the same decorated value in recovery, projection, and every event.
      Approach: cover mask/hash/anonymization and ensure no raw identity or second resolver output reaches persistence.
      (Req: Canonical pre-approval reconciliation, Canonical pre-signoff reconciliation)
- [x] 16.16 Complete manual invalidation result and force contracts
      `packages/core/src/application/use-cases/invalidate-change.ts`: `InvalidateChangeResult` — add persisted `reason`; retain canonical blockers, next action, projection changes, and exact gate recovery targets.
      Approach: stale historical evidence never requires force; valid spec/sign-off pairs produce their evaluator-selected target without CLI inference.
      (Req: Approval guard, Output contract)
- [x] 16.17 Correct invalidate CLI structured and force output
      `packages/cli/src/commands/change/invalidate.ts`: text/JSON/TOON presenters — render named `reason`, blockers, next action, and exact force gate/target pairs.
      Approach: map returned Core fields unchanged; remove sign-off wording that always says designing.
      (Req: Reporting, Approval guard)
- [x] 16.18 Correct edit and approval failure output
      `packages/cli/src/commands/change/edit.ts`, `approve.ts`: success/failure presenters — separate `scopeChanged` from committed validity changes and reload canonical status after an approval failure that may have reconciled.
      Approach: warn only from `projectionChanges`/`validityChanged`; render actual state, blocker, and next action in text/JSON/TOON rather than cached state.
      (Req: Approval invalidation, Output on success)
- [x] 16.19 Add CLI creation, edit, approve, invalidate, and status format matrix
      `packages/cli/test/commands/change/create.spec.ts`, `edit.spec.ts`, `approve.spec.ts`, `invalidate.spec.ts`, `status.spec.ts`: audit output cases — cover workflow-only/both/invalid create policies, scope warning semantics, approval recovery, reason field, exact force pairs, and cross-format status parity.
      Approach: parse JSON/TOON structurally, assert text semantics independently, and verify no source content or raw evaluator object leaks.
      (Req: Structured invalidation policy input, Reconciled validity and next-action output)
- [x] 16.20 Make delegated compliance change-scoped in every downstream branch
      `packages/skills/templates/skills/specd-compliance/SKILL.md.tpl`, `specd-verify/SKILL.md.tpl`: delegated protocol — require `--delegated --attempt`, share the outer attempt, and select change-scoped status/context/scope/dependency/spec-preview/report path/filename branches.
      Approach: only attempt ownership differs from standalone `--change`; delegated compliance never starts or completes verification.
      (Req: Cross-skill artifact review and recovery, Reconciled invalidation protocol in lifecycle templates)
- [x] 16.21 Replace phrase-only delegated tests with behavioral decision coverage
      `packages/skills/test/template-workflow.spec.ts`, `skill-repository.spec.ts`, plugin-agent install tests — exercise every downstream delegated decision and generated-copy parity.
      Approach: simulate independent, delegated-with-attempt, delegated-without-attempt, and report-only modes; assert commands, report directory, filename, and attempt ownership.
      (Req: Reconciled invalidation protocol in lifecycle templates)
- [x] 16.22 Refresh documentation and ADR for audit-corrected contracts
      `docs/core/use-cases.md`, `docs/core/errors.md`, `docs/cli/cli-reference.md`, `docs/cli/change-verification.md`, workflow/config docs, `docs/adr/0028-materialized-validity-reconciliation.md`: recovery-only topology, typed diagnostics, archive ordering, actor reuse, output contracts, and delegated behavior.
      Approach: document public types/codes and compatibility behavior; do not describe recovery-only edges as user transitions.
      (Req: Status and skill discoverability, Versioned validity evidence preservation)
- [x] 16.23 Synchronize generated lifecycle skills
      `.agents/skills`, `.codex/skills`: generated copies — rebuild from corrected source templates.
      Approach: run `pnpm ai-agents:sync`, inspect verify/compliance copies, and never hand-edit generated files.
      (Req: Reconciled invalidation protocol in lifecycle templates)
- [x] 16.24 Run targeted and full automated gates
      Core, CLI, skills, code-graph, SDK/plugin packages, lint, typecheck, formatting, build — execute the design testing matrix after remediation.
      Approach: require all targeted audit regressions and the complete package suites; fix formatting including diff-check failures rather than accepting suite-only green status.
      (Req: all audit-remediation requirements)
- [x] 16.25 Execute the audit-remediation E2E matrix
      Temporary v1/v2 projects and active changes — run design manual steps 15–20 plus baseline workflow checks.
      Approach: verify strict scope-event round trips, automatic-versus-manual recovery, read-only schema failure, post-hook archive plan, structured policy/reason output, and delegated report placement.
      (Req: all audit-remediation verification scenarios)
- [x] 16.26 Accept all current lifecycle states in persisted verification attempts
      `packages/core/src/infrastructure/fs/manifest.ts`, `packages/core/test/infrastructure/fs/manifest-change-loader.spec.ts`: attempt serialization compatibility — include current drain and delivery states, especially `archivable`, in the raw `startedIn` schema.
      Approach: preserve legacy state values for backward reads while adding regression coverage that parses attempts from every current state previously omitted by the raw schema.
      (Req: State-independent verification operations and audit, Verification attempt event serialization)

## 17. Post-verification contract closure

- [x] 17.1 Inject project invalidation defaults into the CreateChange application boundary
      `packages/core/src/application/use-cases/create-change.ts`: `CreateChangeDeps`, `CreateChange.execute` — resolve explicit `input.invalidation` over an injected complete project default and retain `{ artifacts: 'downstream', workflow: 'preserve' }` only as the downstream compatibility fallback.
      Approach: perform one deterministic policy resolution before aggregate creation and persist the resolved pair; do not read config or infer defaults in the entity.
      (Req: Project policy defaults at every creation boundary)
- [x] 17.2 Wire CreateChange policy defaults through composition and kernel
      `packages/core/src/composition/use-cases/create-change.ts`, `packages/core/src/composition/kernel.ts`: `resolveCreateChangeDeps`, factory overloads, kernel construction — obtain the resolved project policy from `CompositionResolver` and pass it to the application dependency.
      Approach: keep direct/config overload equivalence, reject invalid mixed factory arguments, and never make CLI flag processing the sole config-inheritance path.
      (Req: Project policy defaults at every creation boundary)
- [x] 17.3 Add CreateChange precedence and construction regressions
      `packages/core/test/application/use-cases/create-change.spec.ts`, `packages/core/test/composition/use-cases/create-change.spec.ts`, `packages/core/test/composition/kernel.spec.ts`: policy matrix — cover omitted input inheritance, explicit input precedence, compatibility fallback, and identical direct/config/kernel results.
      Approach: assert the exact persisted structured pair and injected dependency calls without snapshots.
      (Req: Project policy defaults at every creation boundary)
- [x] 17.4 Correct late-state verification invalidation guidance
      `packages/core/src/application/use-cases/invalidate-verification.ts`: result guidance — derive blockers and next action from the reconciled boundary so `archivable` and `archiving` recommend `/specd-verify` in place when no higher-priority gate recovery applies.
      Approach: reuse lifecycle evaluation/guidance output; preserve state-independent invalidation, sign-off consequences, idempotence, and Core ownership of recovery.
      (Req: Boundary-aware verification invalidation guidance)
- [x] 17.5 Test stale, absent, late-state, and gate-priority verification outcomes
      `packages/core/test/application/use-cases/invalidate-verification.spec.ts`: evidence/guidance matrix — distinguish no completed evidence from stale completed evidence and cover archivable, archiving, spec-gate recovery, sign-off recovery, and repeated invalidation.
      Approach: assert typed errors/results, stored original reason, event count, state, blockers, automatic return, and exact next command.
      (Req: Boundary-aware verification invalidation guidance, Verification evidence distinctions)
- [x] 17.6 Refresh implementation tracking on every effective scope edit
      `packages/core/src/application/use-cases/edit-change.ts`: scope mutation flow — use `ListWorkspaces` and refresh tracking whenever `scopeChanged` is true, independently of `validityChanged` or projection changes.
      Approach: compare canonical scope first, resolve canonical workspaces through the injected use case, and keep the deprecated `invalidated` alias equal only to `validityChanged`.
      (Req: Scope edit tracking refresh)
- [x] 17.7 Render edit blockers and next action in text mode
      `packages/cli/src/commands/change/edit.ts`: success presenter — print all Core-returned blockers and `nextAction.targetStep`, command, and reason while keeping invalidation warnings limited to actual projection changes.
      Approach: treat Core output as authoritative; a preserved lifecycle state may still be visibly blocked from advancing.
      (Req: Scope and validity reporting)
- [x] 17.8 Add Core and CLI scope-edit reporting regressions
      `packages/core/test/application/use-cases/edit-change.spec.ts`, `packages/cli/test/commands/change-edit.spec.ts`: scope-without-validity scenario — assert `ListWorkspaces`/refresh invocation, `scopeChanged: true`, `validityChanged: false`, no false invalidation warning, and visible blockers/next action.
      Approach: cover text, JSON, and TOON semantics separately and keep the compatibility alias pinned to validity change.
      (Req: Scope edit tracking refresh, Scope and validity reporting)
- [x] 17.9 Preflight verification command format before mutation
      `packages/cli/src/commands/change/verification.ts`: start/complete/invalidate actions — call `parseFormat` and validate non-blank invalidation reason before resolving CLI context or invoking a use case.
      Approach: pass the parsed format into renderers so unsupported formats exit through the existing CLI error path with zero side effects.
      (Req: Verification CLI mutation safety)
- [x] 17.10 Enforce whitelisted verification CLI projections
      `packages/cli/src/commands/change/verification.ts`: `renderStart`, `renderComplete`, `renderInvalidate` — construct the exact public text/JSON/TOON projections and drop aggregate, hashes, private reconciliation fields, and unknown result properties.
      Approach: summarize fingerprints by algorithms/counts; start/complete do not synthesize a next action, while invalidate renders Core blockers, recovery, and next action.
      (Req: Safe verification command output)
- [x] 17.11 Add invalid-format and private-field leakage tests
      `packages/cli/test/commands/change/verification.spec.ts`: command matrix — cover invalid formats for every mutation, non-blank reason preflight, zero context/use-case calls, injected private sentinel fields, and absence of invented start/complete next actions.
      Approach: parse JSON/TOON structurally, assert the explicit whitelist, and independently verify equivalent text semantics.
      (Req: Verification CLI mutation safety, Safe verification command output)
- [x] 17.12 Preserve neutral designing self-entry and reject real self-transitions
      `packages/core/src/application/use-cases/transition-change.ts`, `packages/core/test/application/use-cases/transition-change.spec.ts`, `packages/core/test/domain/entities/change.spec.ts`: self-entry contract — keep `designing -> designing` as an unchanged application result with no event/timestamp mutation while the aggregate rejects self-transition and verifying self-entry remains invalid.
      Approach: short-circuit only the exact designing pair before the domain transition call; assert event count, timestamp, and invalid protocol results.
      (Req: Neutral designing self-entry)
- [x] 17.13 Prove repository hydration is observational only
      `packages/core/src/infrastructure/fs/change-repository.ts`, `packages/core/test/infrastructure/fs/change-repository.spec.ts`, `manifest-change-loader.spec.ts`: hydration/save boundaries — expose physical file facts without deriving or persisting validity or recovery.
      Approach: compare manifest bytes/mtime/history around get and post-save hydration; only a later explicit reconciler mutation may write v2 validity consequences.
      (Req: Read-only repository hydration)
- [x] 17.14 Remove any residual direct invalidation fallback from artifact validation
      `packages/core/src/application/use-cases/validate-artifacts.ts`, `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: validation mutation path — require/use `ReconcileChangeValidity` for drift consequences and never call `Change.invalidate` directly.
      Approach: retain task structural validation and task-content exclusion; assert one coherent reconciled mutation and no fallback when dependencies are incomplete.
      (Req: Single validity reconciliation owner, Task artifact exclusion)
- [x] 17.15 Reconcile overlapping archive peers with their own policies and gates
      `packages/core/src/application/use-cases/archive-change.ts`, `packages/core/test/application/use-cases/archive-change.spec.ts`: overlap invalidation flow — delegate each active peer to its central reconciler instead of forcing every peer to designing.
      Approach: assert ungated preserve peers retain lifecycle with blockers, while redesign/spec-gated peers recover to designing according to their own persisted configuration.
      (Req: Policy-aware overlapping-change invalidation)
- [x] 17.16 Materialize archive metadata through the current metadata use case
      `packages/core/src/application/use-cases/archive-change.ts`, composition wiring/tests — replace any obsolete `RegenerateSpecMetadata` dependency or call with `MaterializeSpecMetadata` and keep it after post-hook acceptance.
      Approach: preserve archive ordering and atomic publish/restore; assert metadata materialization receives the accepted change snapshot and obsolete regeneration is never invoked.
      (Req: Canonical validity archive preflight, Metadata materialization)
- [x] 17.17 Preserve approval history during renewal and legacy drains
      `packages/core/src/application/use-cases/approve-spec.ts`, `approve-signoff.ts`, domain tests — ensure renewal replaces only the current materialized projection and appends the new event without filtering prior pending, approval, sign-off, or invalidation history.
      Approach: exercise native renewal and legacy pending-state compatibility paths; assert exact append-only event ordering and decorated actor identity reuse.
      (Req: Versioned validity evidence preservation, Actor identity consistency)
- [x] 17.18 Keep stale verification distinct from not-found across consumers
      `packages/core/src/application/use-cases/approve-signoff.ts`, verification checks/use cases and tests — emit stale/legacy-unknown or mismatch outcomes when completed evidence exists instead of collapsing them to `VerificationNotFoundError`.
      Approach: branch on absent, active-only, stale, mismatched, and current evidence before approval recording; assert dedicated codes and retry guidance.
      (Req: Verification evidence distinctions)
- [x] 17.19 Update operational documentation for the closure contract
      `docs/cli/change-verification.md`, `docs/guide/workflow.md`, `docs/core/use-cases.md`, `docs/adr/0028-materialized-validity-reconciliation.md`: public behavior — document safe projections, preflight safety, project-default creation, append-only approvals, boundary-aware verification renewal, observational repositories, and policy-aware archive peers.
      Approach: remove claims that approval renewal clears history, stale verification is absent, or every invalidation returns to designing; keep recovery-only edges distinct from manual transitions.
      (Req: Status and skill discoverability, Versioned validity evidence preservation)
- [x] 17.20 Run targeted regression suites for every closure
      Core and CLI targeted suites — execute create/edit/invalidate-verification/transition/repository/validate/archive/approval and verification command tests after implementing tasks 17.1–17.19.
      Approach: require explicit assertions for state, policy, history/event count, blockers, next action, side effects, and safe structured fields; do not weaken existing fixtures or types.
      (Req: all post-verification closure requirements)
- [x] 17.21 Run complete package, build, and formatting gates
      `@specd/core`, `@specd/cli`, `@specd/skills`, `@specd/code-graph` and monorepo build/lint/format checks — prove the closure changes preserve the previously green suites and public surfaces.
      Approach: run targeted tests first, then full package suites and build; investigate count or behavior regressions rather than updating expectations blindly.
      (Req: all post-verification closure requirements)
- [x] 17.22 Execute the manual closure matrix
      Temporary projects and active changes — perform design manual steps 21–25 plus invalid-format, safe-output, neutral-self-entry, repository-read, approval-history, and stale-evidence checks.
      Approach: inspect manifests, mtimes, history, text/JSON/TOON, lifecycle state, blockers, next command, overlap peers, and metadata calls before declaring implementation complete.
      (Req: all post-verification manual scenarios)
