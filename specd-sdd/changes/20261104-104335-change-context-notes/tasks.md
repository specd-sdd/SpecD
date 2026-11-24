# Tasks: change-context-notes

## 1. Identity and Core contracts

- [ ] 1.1 Define note and audit value types
      packages/core/src/domain/value-objects/change-note.ts: ChangeNote/NoteAutoRemoval/events — implement the stated contract.
      Approach: Add immutable typed notes, strict OR-rule variants and manual/automatic removal event contracts; stored actors permit missing legacy IDs.
      (Req: core:change — Autonomous current notes; core:change-manifest — Current note snapshot and actor IDs)

- [ ] 1.2 Define typed note errors
      packages/core/src/domain/errors/change-note-error.ts: five exported error classes — implement the stated contract.
      Approach: Use Core error conventions with field paths, selectors/candidate IDs and the standalone notes-add recommendation.
      (Req: core:remove-change-note — Input and selection; core:note-auto-removal-policy — Policy variants and validation)

- [ ] 1.3 Implement canonical actor bytes
      packages/core/src/domain/services/actor-identity.ts: canonicalActor — implement the stated contract.
      Approach: Sort keys recursively, omit undefined properties, exclude id, serialize compact UTF-8 JSON without string normalization.
      (Req: core:actor-resolver-port — identity returns the current actor)

- [ ] 1.4 Implement legacy-aware actor comparison
      packages/core/src/domain/services/actor-identity.ts: sameActor — implement the stated contract.
      Approach: Compare full versioned IDs when both exist, otherwise injected SHA-256 over canonical persisted fields.
      (Req: core:actor-resolver-port — identity returns the current actor)

- [ ] 1.5 Implement pre-privacy ID finalization
      packages/core/src/infrastructure/actor-identity.ts: finalizeActorIdentity — implement the stated contract.
      Approach: HMAC-SHA256 canonical raw actor using canonical raw name/email as key; prefix lowercase digest with v1:.
      (Req: core:actor-resolver-port — identity returns the current actor)

- [ ] 1.6 Separate new and stored actor contracts
      packages/core/src/domain/entities/change.ts; application/ports/actor-resolver.ts: ActorIdentity/StoredActorIdentity/SYSTEM_ACTOR — implement the stated contract.
      Approach: Require id on new identities, retain legacy missing IDs only for hydration, and finalize the existing system identity.
      (Req: core:actor-resolver-port — identity returns the current actor)

- [ ] 1.7 Finalize built-in resolver identities
      packages/core/src/infrastructure/vcs-actor-resolver.ts; infrastructure/null/actor-resolver.ts: identity — implement the stated contract.
      Approach: Produce finalized IDs for direct resolver use without changing provider metadata or unavailable-identity errors.
      (Req: core:actor-resolver — VCS adapter composition; core:actor-resolver-port — Null fallback implementation)

- [ ] 1.8 Wire finalization before privacy
      packages/core/src/composition/actor-resolver.ts; composition-resolver.ts: resolver composition — implement the stated contract.
      Approach: Finalize custom raw provider output before decorating; preserve correctly finalized output without hashing privacy output again.
      (Req: core:actor-resolver — Privacy wrapping)

- [ ] 1.9 Preserve ID through every privacy branch
      packages/core/src/composition/privacy-actor-resolver.ts: identity — implement the stated contract.
      Approach: Retain ID for mask/hash/anonymous/excluded modes and leave existing email privacy.salt behavior unchanged.
      (Req: core:actor-resolver-privacy — Pre-privacy ID preservation)

## 2. Policy parsing and evaluation

- [ ] 2.1 Validate object policies
      packages/core/src/domain/services/note-auto-removal-policy.ts: validateNoteAutoRemoval — implement the stated contract.
      Approach: Reject unknown keys, invalid variants, empty/duplicate lists and mixed all; accept absent policy only at optional caller boundary.
      (Req: core:note-auto-removal-policy — Policy variants and validation)

- [ ] 2.2 Implement the closed string parser
      packages/core/src/domain/services/note-auto-removal-policy.ts: parseNoteAutoRemoveRule — implement the stated contract.
      Approach: Parse exactly enter-state/leave-state selectors with optional direction, or operation-success:archive; reuse object rule validation.
      (Req: core:note-auto-removal-policy — Closed Core parser)

- [ ] 2.3 Implement semantic policy equivalence
      packages/core/src/domain/value-objects/change-note.ts: equalNoteAutoRemoval — implement the stated contract.
      Approach: Normalize omitted direction to any and compare sorted unique rule/state sets without rewriting stored notes.
      (Req: core:note-auto-removal-policy — Policy equivalence)

- [ ] 2.4 Implement successful-event matching
      packages/core/src/domain/services/note-auto-removal-policy.ts: matchingNoteRules — implement the stated contract.
      Approach: Match only effective hops with existing topology classification or committed archive operation; return all matched conditions once per note.
      (Req: core:note-auto-removal-policy — Effective event evaluation)

- [ ] 2.5 Implement recovery policy factories
      packages/core/src/application/services/change-notes.ts: D/I/S policy builders — implement the stated contract.
      Approach: Encode forward exit plus redundant arrival alternatives and archive success, including preserve phases and legacy drains.
      (Req: core:transition-checks — Recovery note cleanup policies; core:note-auto-removal-policy — Recovery and optional steps)

## 3. Aggregate snapshot and serialization

- [ ] 3.1 Add the autonomous notes snapshot
      packages/core/src/domain/entities/change.ts: ChangeProps/notes — implement the stated contract.
      Approach: Default absent collection to empty, validate IDs and expose defensive immutable snapshots independent of history.
      (Req: core:change — Autonomous current notes)

- [ ] 3.2 Implement current-note deduplication
      packages/core/src/domain/entities/change.ts: addNote — implement the stated contract.
      Approach: Compare exact outer-trimmed text, injected actor equality and semantic policy; duplicate returns unchanged note without event/touch.
      (Req: core:add-change-note — Atomic add and deduplication)

- [ ] 3.3 Implement explicit note removal and audit
      packages/core/src/domain/entities/change.ts: removeNote — implement the stated contract.
      Approach: Remove exact ID regardless retention, append one manual/automatic event with validated reason and actor/time.
      (Req: core:remove-change-note — Removal independent of retention)

- [ ] 3.4 Implement matching-note cleanup
      packages/core/src/domain/entities/change.ts: removeMatchingNotes — implement the stated contract.
      Approach: Remove each existing matching note once with SYSTEM_ACTOR and all matched conditions in the reason.
      (Req: core:note-auto-removal-policy — Effective event evaluation)

- [ ] 3.5 Integrate ordinary transition context
      packages/core/src/domain/entities/change.ts: transition — implement the stated contract.
      Approach: Add optional fifth AggregateTransitionContext; validate prepared-note/comparator pair and legal edge before cleanup, event and add.
      (Req: core:transition-change — Atomic optional reason and current note)

- [ ] 3.6 Integrate recovery transition context
      packages/core/src/domain/entities/change.ts: recover — implement the stated contract.
      Approach: Add optional third context argument and use the same cleanup-before-add contract after recovery legality validation.
      (Req: core:transition-checks — Automatic explanatory notes)

- [ ] 3.7 Extend manifest validation schemas
      packages/core/src/infrastructure/fs/manifest.ts: ManifestActorIdentity/current and legacy schemas — implement the stated contract.
      Approach: Preserve optional stored actor id, notes, reason and note event variants; reject malformed present snapshots.
      (Req: core:change-manifest — Current note snapshot and actor IDs)

- [ ] 3.8 Extend manifest hydration
      packages/core/src/infrastructure/fs/manifest-change-loader.ts: hydration — implement the stated contract.
      Approach: Pass notes and full actor/audit data through; convert ISO dates without historical backfill.
      (Req: core:change-manifest — Manifest format compatibility)

- [ ] 3.9 Extend snapshot and event serialization
      packages/core/src/infrastructure/fs/change-repository.ts: changeToManifest/serializeEvent — implement the stated contract.
      Approach: Serialize notes and new events losslessly; expose shared snapshot mapping for staged archive.
      (Req: core:change-manifest — Current note snapshot and actor IDs)

- [ ] 3.10 Verify note-only persistence and neutrality
      packages/core/src/infrastructure/fs/change-repository.ts; domain/entities/change.ts: changeMutationStamp/fingerprint inputs — implement the stated contract.
      Approach: Ensure serialized notes affect mutation detection while note mutations remain outside approval/verification/artifact fingerprints.
      (Req: core:change — Autonomous current notes)

## 4. Application commands and composition

- [ ] 4.1 Implement full use-case input validators
      packages/core/src/application/services/change-notes.ts; application/use-cases/transition-change.ts: input validation — implement the stated contract.
      Approach: Validate complete closed inputs, names, selectors, text, policy and existing transition fields before any dependency effect.
      (Req: core:add-change-note — Validated input before effects; core:transition-change — Input contract)

- [ ] 4.2 Implement atomic add use case
      packages/core/src/application/use-cases/add-change-note.ts: AddChangeNote.execute — implement the stated contract.
      Approach: Resolve decorated actor, allocate UUID/time and deduplicate inside active repository.mutate; return note and created.
      (Req: core:add-change-note — Atomic add and deduplication; Active-only autonomous state; Composition and result)

- [ ] 4.3 Implement remove use case
      packages/core/src/application/use-cases/remove-change-note.ts: RemoveChangeNote.execute — implement the stated contract.
      Approach: Resolve exact ID before unique prefix inside the lock; record supplied/default reason; fail missing/ambiguous without mutation.
      (Req: core:remove-change-note — Input and selection; Removal independent of retention; Operational independence and API)

- [ ] 4.4 Implement read-only list use case
      packages/core/src/application/use-cases/list-change-notes.ts: ListChangeNotes.execute — implement the stated contract.
      Approach: Validate active name, read snapshot in insertion order and return copies without actor/reconcile/write.
      (Req: core:list-change-notes — Validated snapshot query; Read contract and composition)

- [ ] 4.5 Implement read-only detail use case
      packages/core/src/application/use-cases/get-change-note.ts: GetChangeNote.execute — implement the stated contract.
      Approach: Validate name/selector, resolve exact/unique prefix and return complete defensive note without reconciliation.
      (Req: core:get-change-note — Validated exact or unique-prefix lookup; Complete immutable result)

- [ ] 4.6 Integrate validated transition reason and note
      packages/core/src/application/use-cases/transition-change.ts: execute/final mutation — implement the stated contract.
      Approach: Reject context-bearing effective no-op, prepare note and persist it with successful hop; retain independently committed recovery on later failure.
      (Req: core:transition-change — Atomic optional reason and current note)

- [ ] 4.7 Add four composition factories
      packages/core/src/composition/use-cases/{add,remove,list,get}-change-note.ts: create\*ChangeNote — implement the stated contract.
      Approach: Implement explicit-deps/config overloads, decorated identity and mutation UUID/clock/comparator dependencies.
      (Req: core:add-change-note — Composition and result; core:remove-change-note — Operational independence and API)

- [ ] 4.8 Expose Kernel note entries
      packages/core/src/composition/kernel.ts; composition-resolver.ts: changes.addNote/removeNote/listNotes/getNote — implement the stated contract.
      Approach: Share repository and actor resources; query instances require no actor resolution.
      (Req: core:kernel — Note use case entries and identity finalization)

- [ ] 4.9 Update public exports and dependency wiring
      packages/core/src/{index.ts,public.ts,ports.ts,application/index.ts,domain/index.ts,composition/index.ts}; composition/use-cases/{transition,archive}-change.ts; packages/sdk/src/core-reexports.ts: named exports/factory deps — implement the stated contract.
      Approach: Expose parser/types/errors/factories and wire shared note service without domain IO or circular dependencies.
      (Req: core:kernel — Every exported use case must have a kernel entry)

## 5. Reconciliation and canonical projections

- [ ] 5.1 Isolate consequence note application
      packages/core/src/application/services/change-notes.ts: note preparation/application service — implement the stated contract.
      Approach: Keep note creation callable independently of persistConsequences and use the caller's serialized transaction.
      (Req: core:transition-checks — Automatic explanatory notes)

- [ ] 5.2 Add new automatic consequence explanations
      packages/core/src/application/use-cases/reconcile-change-validity.ts: persistConsequences — implement the stated contract.
      Approach: Apply system notes atomically with new invalidation/recovery and avoid add requests on unchanged observations.
      (Req: core:transition-checks — Automatic explanatory notes)

- [ ] 5.3 Support same-state structured overlap context
      packages/core/src/application/use-cases/reconcile-change-validity.ts: invalidation intent — implement the stated contract.
      Approach: Carry source archive/spec IDs and add new context even when artifacts were already reopened; no source linkage on notes.
      (Req: core:archive-change — Archive note failure and success boundaries)

- [ ] 5.4 Remove history-derived review explanation
      packages/core/src/domain/services/lifecycle-verdict.ts: deriveReview/collectUnhandledOverlaps — implement the stated contract.
      Approach: Delete historical overlap parser/latest invalidation narrowing and derive all outstanding affected artifacts from present facts.
      (Req: core:lifecycle-engine — Review summary integration)

- [ ] 5.5 Replace removed-field blocker routing
      packages/core/src/domain/services/lifecycle-verdict.ts; lifecycle-engine.ts; transition-checks.ts: reviewBlockersFromSummary/resolveLifecycleNextHop — implement the stated contract.
      Approach: Use validity/policy/topology/checks; preserve live-overlap distinction and in-place versus redesign behavior.
      (Req: core:lifecycle-engine — Machine-readable blockers; Shared lifecycle interpretation for consumers)

- [ ] 5.6 Retain bounded existing review signal
      packages/core/src/application/services/lifecycle-guidance.ts: guidance — implement the stated contract.
      Approach: Keep existing operational review.required usage without adding any new routing or stop dependency.
      (Req: core:lifecycle-engine — Application lifecycle guidance)

- [ ] 5.7 Project text-only current notes
      packages/core/src/application/use-cases/get-status.ts: \_projectReview/status branches — implement the stated contract.
      Approach: Return note texts and exact reduced review on normal, drafted and graceful-degradation branches; never expose note metadata.
      (Req: core:get-status — Notes on every inspection branch)

## 6. Archive commit and peer updates

- [ ] 6.1 Stage success cleanup on detached candidate
      packages/core/src/application/use-cases/archive-change.ts: archive commit preparation — implement the stated contract.
      Approach: Apply operation-success removals to a full candidate snapshot, leaving active notes untouched before success.
      (Req: core:archive-change — Archive note failure and success boundaries)

- [ ] 6.2 Persist candidate note snapshot in archive staging
      packages/core/src/infrastructure/fs/archive-repository.ts; application/ports/archive-repository.ts: archive — implement the stated contract.
      Approach: Use shared mapper for supplied candidate notes/history and full actor; preserve unrelated manifest fields.
      (Req: core:archive-repository-port — Success-cleaned note snapshot commit)

- [ ] 6.3 Restore original manifest on failed staging
      packages/core/src/infrastructure/fs/archive-repository.ts: failure/restore — implement the stated contract.
      Approach: Retain original bytes and restore before moving back; never persist candidate success-removal events after failure.
      (Req: core:archive-repository-port — Success-cleaned note snapshot commit)

- [ ] 6.4 Record retained archive failure explanation
      packages/core/src/application/use-cases/archive-change.ts: \_recordArchiveFailure — implement the stated contract.
      Approach: Preserve full actor and add SYSTEM_ACTOR failure note after restore/recovery using D OR I OR archive-success policy.
      (Req: core:archive-change — Archive note failure and success boundaries)

- [ ] 6.5 Move peer invalidation after archive success
      packages/core/src/application/use-cases/archive-change.ts: \_invalidateOverlappingChanges — implement the stated contract.
      Approach: Run structured per-peer reconcile only after durable archive/publication completion.
      (Req: core:archive-change — Archive note failure and success boundaries)

- [ ] 6.6 Report peer failures without rollback
      packages/core/src/application/use-cases/archive-change.ts; packages/cli/src/commands/change/archive.ts: ArchiveChangeResult/peer loop/presenter — implement the stated contract.
      Approach: Collect peerInvalidationFailures, continue remaining peers/post-work and preserve successful archive and peer updates.
      (Req: core:archive-change — Result shape)

## 7. CLI commands and presentation

- [ ] 7.1 Reuse shared UTF-8 input helper
      packages/cli/src/helpers/read-input.ts; helpers/read-stdin.ts; commands/spec/optimizations.ts: input reader — implement the stated contract.
      Approach: Reuse/extract existing file or explicit '-' stdin behavior, preserving multiline content and existing optimization commands.
      (Req: cli:change-notes — Text input sources)

- [ ] 7.2 Add note add command
      packages/cli/src/commands/change/notes.ts; src/index.ts: changes notes add — implement the stated contract.
      Approach: Require one text/input source, use Core parser for combined policies and delegate to Kernel addNote.
      (Req: cli:change-notes — Command surface and delegation; Text input sources; Core-owned removal syntax)

- [ ] 7.3 Add note remove command
      packages/cli/src/commands/change/notes.ts: changes notes remove — implement the stated contract.
      Approach: Pass ID/prefix and optional reason/reason-input, reject conflicting sources before IO.
      (Req: cli:change-notes — Command surface and delegation)

- [ ] 7.4 Add note list and show commands
      packages/cli/src/commands/change/notes.ts: changes notes list/show — implement the stated contract.
      Approach: List id/text/by name-email; show complete stored note with ISO dates and policy in all supported formats.
      (Req: cli:change-notes — Inspection and mutation output)

- [ ] 7.5 Add transition reason and note switches
      packages/cli/src/commands/change/transition.ts: option parsing/delegation — implement the stated contract.
      Approach: Add reason/reason-input, separate --note, repeatable grammar and enter/leave shortcuts; policy requires note.
      (Req: cli:change-transition — Reason sources and optional note policy)

- [ ] 7.6 Replace obsolete status presentation
      packages/cli/src/commands/change/status.ts; \_validity-present.ts: presenters — implement the stated contract.
      Approach: Render text-only notes/reduced review and canonical blockers without local overlap reinterpretation.
      (Req: cli:change-status — Text-only notes across formats)

## 8. Skills and documentation

- [ ] 8.1 Update new and design skill routing
      packages/skills/templates/skills/specd-{new,design}/SKILL.md.tpl: routing/work selection — implement the stated contract.
      Approach: Use blockers/nextAction and affected artifact facts while preserving the enumerated consent/mode/ownership/terminal stops.
      (Req: skills:workflow-automation — Note context and user decisions)

- [ ] 8.2 Update implement and archive skill routing
      packages/skills/templates/skills/specd-{implement,archive}/SKILL.md.tpl: routing/guardrails — implement the stated contract.
      Approach: Remove required-only redirects without weakening checks, human approval or live-overlap consent.
      (Req: skills:skill-templates-source — Repair reason notes and preserved consent)

- [ ] 8.3 Persist verify repair context after user choice
      packages/skills/templates/skills/specd-verify/SKILL.md.tpl: audit repair branches — implement the stated contract.
      Approach: Pass audit path/selected work through reason and separate note; retain until forward verifying/optional fallback arrivals.
      (Req: skills:workflow-automation — Note context and user decisions)

- [ ] 8.4 Update compliance and shared instructions
      packages/skills/templates/skills/specd-compliance/SKILL.md.tpl; templates/shared/shared.md.tpl: context ownership/routing guidance — implement the stated contract.
      Approach: Read notes as data; keep report-only/delegated ownership and do not invent standalone consent/transition flow.
      (Req: skills:skill-templates-source — Repair reason notes and preserved consent)

- [ ] 8.5 Update CLI command documentation
      docs/cli/changes.md; archive.md; cli-reference.md; index.md; docs/guide/cli.md: command reference — implement the stated contract.
      Approach: Document add/remove/list/show, text/file/stdin, policy flags, no-op errors and nonfatal peer diagnostics.
      (Req: cli:change-notes — Documentation and tests)

- [ ] 8.6 Update domain and application API documentation
      docs/core/domain-model.md; use-cases.md; ports.md; errors.md; sdk.md; docs/sdk/index.md: public API — implement the stated contract.
      Approach: Document autonomous snapshot/audit, four factories, reduced status, actor contracts, typed errors and compatibility.
      (Req: cli:change-notes — Documentation and tests; core:kernel — Note use case entries and identity finalization)

- [ ] 8.7 Update privacy documentation
      docs/core/config.md; docs/cli/config.md: actor identity/privacy — implement the stated contract.
      Approach: Explain pre-privacy pseudonym, exact canonical ID scheme, legacy fallback and unchanged existing salt configuration.
      (Req: core:actor-resolver-privacy — Pre-privacy ID preservation)

- [ ] 8.8 Update workflow and skill guides
      docs/guide/changes.md; workflow.md; skills.md: workflow examples — implement the stated contract.
      Approach: Document retention/detours/archive success and contextual notes versus canonical routing/consent.
      (Req: skills:workflow-automation — Note context and user decisions)

- [ ] 8.9 Regenerate managed skills and documentation
      packages/skills template/render generation workflow: generated artifacts — implement the stated contract.
      Approach: Use declared generation scripts and review outputs; never edit installed/generated skills as an independent source.
      (Req: skills:skill-templates-source — Template source location)

## 9. Automated verification

- [ ] 9.1 Test canonical identity and comparison
      packages/core/test/domain/services/actor-identity.spec.ts; infrastructure/actor-identity.spec.ts: new suites — implement the stated contract.
      Approach: Assert fixed bytes/HMAC vectors, nested reorder/undefined equivalence, changes, legacy comparison and system identity.
      (Req: core:actor-resolver-port — identity returns the current actor)

- [ ] 9.2 Test resolver privacy integration
      packages/core/test/composition/privacy-actor-resolver.spec.ts; resolver/provider suites: identity cases — implement the stated contract.
      Approach: Cover all modes/no-privacy/exclusions and distinct originals with equal masked output; preserve old salt behavior.
      (Req: core:actor-resolver-privacy — Pre-privacy ID preservation)

- [ ] 9.3 Test policy parser and matcher
      packages/core/test/domain/services/note-auto-removal-policy.spec.ts: new suite — implement the stated contract.
      Approach: Cover every accepted/rejected rule, all, default/order equivalence, multi-match, topology directions and optional steps.
      (Req: core:note-auto-removal-policy — Policy variants and validation; Closed Core parser; Effective event evaluation; Policy equivalence; Recovery and optional steps)

- [ ] 9.4 Test aggregate lifecycle note invariants
      packages/core/test/domain/entities/change.spec.ts; change-note.spec.ts: notes/audit cases — implement the stated contract.
      Approach: Assert dedup exactness, creation/removal ordering, failing/no-op edge neutrality, one removal event and fingerprint neutrality.
      (Req: core:change — Autonomous current notes)

- [ ] 9.5 Test four application note capabilities
      packages/core/test/application/use-cases/{add,remove,list,get}-change-note.spec.ts: new suites — implement the stated contract.
      Approach: Assert validation-before-effects, active-only queries, prefix selection, concurrency, read-only behavior and full results.
      (Req: core:add-change-note; core:remove-change-note; core:list-change-notes; core:get-change-note — all requirements)

- [ ] 9.6 Test transition context atomicity
      packages/core/test/application/use-cases/transition-change.spec.ts: context scenarios — implement the stated contract.
      Approach: Assert reason-only, separate note, no-op rejection, failed-hop preservation and independently committed recovery.
      (Req: core:transition-change — Atomic optional reason and current note)

- [ ] 9.7 Test automatic note producers and review routing
      packages/core/test/application/use-cases/reconcile-change-validity.spec.ts; domain/services/{change-validity,lifecycle-verdict}.spec.ts: recovery cases — implement the stated contract.
      Approach: Cover full producer policy table, same-state overlap, repeated observe, no event scans and canonical policy-aware routing.
      (Req: core:transition-checks — Automatic explanatory notes; Recovery note cleanup policies)

- [ ] 9.8 Test status inspection branches
      packages/core/test/application/use-cases/get-status.spec.ts: status projection — implement the stated contract.
      Approach: Assert all current affected artifacts, exact reduced shape, text-only notes and unchanged permissions after note deletion.
      (Req: core:get-status — Notes on every inspection branch)

- [ ] 9.9 Test persisted note round trips and locks
      packages/core/test/infrastructure/fs/{manifest-change-loader,change-repository}.spec.ts: snapshot integration — implement the stated contract.
      Approach: Round-trip legacy/new actors/policies/events; reject malformed snapshots; assert note mutation stamps, concurrent mutations and moved snapshots.
      (Req: core:change-manifest — Current note snapshot and actor IDs)

- [ ] 9.10 Test staged archive cleanup and restoration
      packages/core/test/application/use-cases/{archive-change,archive-change-batch-restore}.spec.ts; archive adapter integration suite: fault injection — implement the stated contract.
      Approach: Assert candidate persisted only on success, original bytes restored on failure, retained failure notes and post-success warning semantics.
      (Req: core:archive-change — Archive note failure and success boundaries; core:archive-repository-port — Success-cleaned note snapshot commit)

- [ ] 9.11 Test post-success peer failure continuation
      packages/core/test/application/use-cases/archive-change.spec.ts: peer invalidation cases — implement the stated contract.
      Approach: Inject one peer failure; assert later peers/post-work run and no completed archive/successful peer rollback.
      (Req: core:archive-change — Result shape)

- [ ] 9.12 Test Kernel/factory/public export integration
      packages/core/test/composition/use-cases note factory suites; Kernel/export suites: SDK wiring — implement the stated contract.
      Approach: Cover config and explicit dependencies, four Kernel entries, shared decorated actor and type checks of consumers.
      (Req: core:kernel — Note use case entries and identity finalization)

- [ ] 9.13 Test CLI note/input/transition/status behavior
      packages/cli/test/commands/change/{notes,transition,status}.spec.ts: command integration — implement the stated contract.
      Approach: Cover direct/file/stdin, conflicts, grammar/shortcut combinations, metadata visibility, typed lookup/no-op errors and canonical blockers.
      (Req: cli:change-notes — Documentation and tests; cli:change-transition — Reason sources and optional note policy; cli:change-status — Text-only notes across formats)

- [ ] 9.14 Test rendered skill contracts
      packages/skills test template/render suites: protocol assertions — implement the stated contract.
      Approach: Assert preserved decision stops, no obsolete review-routing dependencies, verify reason/note and report-only standalone compliance.
      (Req: skills:skill-templates-source — Repair reason notes and preserved consent)

## 10. Manual verification and release checks

- [ ] 10.1 Exercise cross-session repair and drift
      temporary project via packages/cli/dist/index.js: manual workflow — implement the stated contract.
      Approach: Create verification repair note, restart, trigger artifact drift and verify both explanations; forward design completion removes only design context.
      (Req: core:transition-checks — Recovery note cleanup policies)

- [ ] 10.2 Exercise optional-step and explicit-removal flows
      temporary schema/project: manual workflow — implement the stated contract.
      Approach: Disable optional implementing/verifying, verify redundant arrivals; list/show/remove by prefix and assert source blockers remain.
      (Req: core:note-auto-removal-policy — Recovery and optional steps)

- [ ] 10.3 Exercise failed and successful archive with peers
      temporary project with injected staging/peer failure: manual archive — implement the stated contract.
      Approach: Assert original notes on restore, success cleanup in archive, nonfatal peer diagnostic and continued later peers/post-work.
      (Req: core:archive-repository-port — Success-cleaned note snapshot commit)

- [ ] 10.4 Run Core, CLI and skills suites
      packages/{core,cli,skills}/package.json: test scripts — implement the stated contract.
      Approach: Run pnpm --filter @specd/core test, corresponding CLI/skills tests and fix behavior regressions without weakening assertions.
      (Req: cli:change-notes — Documentation and tests)

- [ ] 10.5 Run consumer type checks and build
      package.json: typecheck/build — implement the stated contract.
      Approach: Run pnpm typecheck and pnpm build; verify resolver providers, SDK exports and changed review consumers compile together.
      (Req: core:kernel — Kernel entries must match use case types)

- [ ] 10.6 Verify deployment compatibility and rollback instructions
      design.md and docs/core/domain-model.md: release review — implement the stated contract.
      Approach: Check absent-note hydration, legacy actors, preserved snapshots, pre-upgrade backup guidance and no silent downgrade stripping.
      (Req: core:change-manifest — Manifest format compatibility)

## 12. Existing requirement regression coverage

- [ ] 12.1 Preserve the complete core:change-manifest requirement surface
      core:change-manifest: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Manifest structure; Manifest format compatibility; Archive outcome history events; Artifact filenames use expected paths; Filename normalization preserves tracked intent; Schema version; Fingerprint serialization; Verification attempt event serialization; Atomic writes; Current note snapshot and actor IDs)

- [ ] 12.2 Preserve the complete core:transition-change requirement surface
      core:transition-change: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Input contract; Approval gates baked at construction; Change must exist; Optional pre-transition implementation tracking refresh; Spec approval is a check not a pending hop; Signoff is a check not a pending hop; Human-approval pending states produce explicit transition failures; Direct transition when gates are inactive; Canonical pre-transition validity reconciliation; Workflow requires enforcement; Task completion check during requires enforcement; Implementation-only retry from verifying; Verification attempt lifecycle; Skill-aligned backward hop invalidation; Transition to designing from any state; Transition from archiving to archivable; Pre-hook execution; Transition delegation; Transition event; Automatic implementation tracking activation on transition to implementing; Post-hook execution; Persistence; Result type; Progress callback; Dependencies; to next is the happy-path next state; Bypassed step evaluation and hook suppression; Shared runner errors propagate on transition; Config-based factory delegates through resolveTransitionChangeDeps; Historic parked approval repair precedence; Atomic optional reason and current note)

- [ ] 12.3 Preserve the complete core:get-status requirement surface
      core:get-status: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Accepts a change name as input; Returns the change and its artifact statuses; Revision evaluation for conditional status queries; Drafted change read-only status; Implementation status projection; Optional pre-read implementation tracking refresh; Operational status reconciliation; Drift-aware display status; Reports task completion counts for task-capable artifacts; Execute matching predicates then project; Shared transition candidate evaluation; Throws ChangeNotFoundError for unknown changes; Constructor dependencies; Config-based factory preserves complete repository bootstrap; Reports effective status for every artifact; Returns lifecycle context; Identifies blockers; Approval, verification, and fingerprint status projection; Graceful degradation when schema resolution fails; Config-based factory delegates through resolveGetStatusDeps; Notes on every inspection branch)

- [ ] 12.4 Preserve the complete core:lifecycle-engine requirement surface
      core:lifecycle-engine: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Stateless domain lifecycle verdict; Centralized validation logic; Effective artifact status computation; Canonical-state-only lifecycle interpretation; Machine-readable blockers; Available steps and domain next hop; Application lifecycle guidance; Archiving escape transitions in lifecycle verdict; Review summary integration; Shared lifecycle interpretation for consumers; Next artifact topological order; Predicate blocker artifact identity)

- [ ] 12.5 Preserve the complete core:transition-checks requirement surface
      core:transition-checks: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Check identity and result; Check ABI create and WorkflowCheck; Public CustomCheckDefinition contract; One implementation file per check; Applicability from, to, and along; Step-skip check scope and applicability; Dynamic runtime binding composition and cascaded config resolution; Archive is an operation not an edge; Binding pipeline phase and failure policy; Predicate versus effect; Evaluation of a transition attempt; Shared transition candidate evaluator; Shared validity verdict and recovery priority; Single validity reconciliation owner; Registry bindings for this capability; Actionable fail diagnostics; Generic check progress bus; Projections; No shared snapshot bag; Approval precedence and production registry composition; Automatic explanatory notes; Recovery note cleanup policies)

- [ ] 12.6 Preserve the complete core:archive-change requirement surface
      core:archive-change: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Ports and constructor; Archive bindings not RunStepHooks on the use case; Input; Sovereign schema resolution; ArchivedChange construction; Archivable guard; Canonical validity archive preflight; Deferred transition to archiving; ReadOnly workspace guard; Overlap guard; Pre-archive hooks; Tracked artifact selection at archive time; Prepare archive plan before permanent writes; Staged archive commit and failed-attempt visibility; Batch canonical snapshot before publication; Batch canonical restore on commit failure; Orphan archive backup detection; Lifecycle rollback after failed commit; Archive debug logging; Delta merge and spec sync; Versioned validity evidence preservation; Archive repository call; Archive index metadata maintenance; Post-archive hooks; Spec metadata generation; spec-lock sidecar persistence; Result shape; Typed errors for archive failures; Archive checks share runners and wrap remaining preflight; Effective archive bindings and skip validation; Tracked implementation review guard; Implementation materialization into spec-lock; Out-of-scope sidecar update guard; Config-based factory delegates through resolveArchiveChangeDeps; Shared fallback batch snapshot lifetime; Archive note failure and success boundaries)

- [ ] 12.7 Preserve the complete core:kernel requirement surface
      core:kernel: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Kernel interface groups use cases by domain area; Every exported use case must have a kernel entry; Kernel entries must match use case types; createKernel constructs shared adapters once; Kernel is a facade over composition-owned registry primitives; Project-level VCS and actor adapters must use auto-detect; Auto-invalidation on get when artifact files drift; Kernel exposes repository instances for adapter access; createKernel accepts optional KernelOptions; KernelOptions supports additive registries; Check Registration and KernelBuilder Extension; Kernel exposes merged registries; Kernel rejects invalid registry references; Kernel entry mapping; Plugin declarations are not a kernel use case; Config mutation is not a kernel use case; Skills manifest use cases are not a kernel use case; Kernel use case execute inputs must not re-pass construction-time config; Allowed runtime override inputs; Kernel is a plain object, not a class; Kernel disposal; KernelOptions accepts named disposers; Failed construction releases registered disposers; Note use case entries and identity finalization)

- [ ] 12.8 Preserve the complete cli:change-transition requirement surface
      cli:change-transition: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Command signature; Next-transition resolution; Validity-aware transition guidance; Delegates refresh policy to TransitionChange; Approval-gate routing; Hook execution; Progress output; Transition hook observability; Shared hook progress presentation; Output on success; Post-hook failure warning; Invalid transition error; Incomplete tasks error; Check progress rendering; Unsatisfied requires error; Reason sources and optional note policy)

- [ ] 12.9 Preserve the complete cli:change-status requirement surface
      cli:change-status: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Command signature; Drafted change status is read-only; Output format; Task completion display in DAG; Display-state rendering; Lifecycle projections come from GetStatus checks; Reconciled validity and next-action output; Text status omits duplicated review file lists; Text blockers include check labels; Archive bypass hints come from resolved bindings; Schema version warning; Change not found; Schema-derived fields; Delegates refresh policy to GetStatus; Implementation section; Task completion in details section; Basic info section; Specs and dependencies section; Stable display status and drafted JSON compatibility; Text-only notes across formats)

- [ ] 12.10 Preserve the complete skills:workflow-automation requirement surface
      skills:workflow-automation: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Diagnostic Priority; Data Extraction; Spec read surface selection; On-demand outline retrieval; Repair Strategy; Canonical Command References; Command Necessity and Freshness; Structural Validation and Content Review; Cross-skill artifact review and recovery; Lifecycle template protocol validation; Implementation traceability policy; Context optimization policy; Note context and user decisions)

- [ ] 12.11 Preserve the complete skills:skill-templates-source requirement surface
      skills:skill-templates-source: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Template source location; Template migration; Template metadata contract (skills and agents); Capability-aware install-time rendering; Graph impact terminology in workflow templates; Graph search snippet guidance in workflow templates; Frontmatter source; Frontmatter injection; Agent frontmatter matrix; Why no frontmatter in skills package; Implementation tracking instructions in templates; Metadata self-healing guidance in workflow templates; Optimizer agent gating declared in templates; Agent-facing command roles in templates; In-place approval gates in workflow templates; Reconciled invalidation protocol in lifecycle templates; Implementation tracking in verify and implement templates; Archive skill skips only pre hooks; Design skill review scope without review file lists; Overlap invalidation vs live archive overlap in templates; Fast-track workflow template; Fast-track governing context and activation; Fast-track Step 2 confirmation and dependents terminology; Repair reason notes and preserved consent)

- [ ] 12.12 Preserve the complete core:actor-resolver-port requirement surface
      core:actor-resolver-port: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: identity returns the current actor; identity throws when identity is unavailable; Interface-only declaration; Null fallback implementation)

- [ ] 12.13 Preserve the complete core:actor-resolver-privacy requirement surface
      core:actor-resolver-privacy: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Privacy modes; HMAC hashing with salt; Masking strategy; Metadata privacy; Excluded actors; Pre-privacy ID preservation)

- [ ] 12.14 Preserve the complete core:actor-resolver requirement surface
      core:actor-resolver: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: VCS adapter composition; External providers run before built-in probes; Fallback to NullActorResolver; Optional cwd parameter; Returns the ActorResolver port interface; Privacy wrapping)

- [ ] 12.15 Preserve the complete core:note-auto-removal-policy requirement surface
      core:note-auto-removal-policy: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Policy variants and validation; Closed Core parser; Effective event evaluation; Policy equivalence; Recovery and optional steps)

- [ ] 12.16 Preserve the complete core:add-change-note requirement surface
      core:add-change-note: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Validated input before effects; Atomic add and deduplication; Active-only autonomous state; Composition and result)

- [ ] 12.17 Preserve the complete core:remove-change-note requirement surface
      core:remove-change-note: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Input and selection; Removal independent of retention; Operational independence and API)

- [ ] 12.18 Preserve the complete core:list-change-notes requirement surface
      core:list-change-notes: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Validated snapshot query; Read contract and composition)

- [ ] 12.19 Preserve the complete core:get-change-note requirement surface
      core:get-change-note: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Validated exact or unique-prefix lookup; Complete immutable result)

- [ ] 12.20 Preserve the complete cli:change-notes requirement surface
      cli:change-notes: existing implementation and verification suites named in design.md — keep unaffected behaviors while applying the specified changes.
      Approach: run and update the mapped regression suite; retain pre-existing scenarios for topology, hooks, approval, validity, privacy, rendering and storage rather than replacing them with note-only tests.
      (Req: Command surface and delegation; Text input sources; Core-owned removal syntax; Inspection and mutation output; Documentation and tests)

- [ ] 12.22 Preserve the complete core:change baseline contract
      core:change: mapped domain/repository suites in design.md — preserve all unchanged requirements while adding notes.
      Approach: run the complete existing verification scenarios and add the new note cases without replacing baseline assertions.
      (Req: Identity; Change names reject Windows device names; Revision timestamp; Workspaces and specs; Lifecycle; Neutral designing self-entry; Skill-aligned backward hops; Archiving escape transitions; Implementation and verification loop; Implementation tracking state; Explicit vs container-only file links; Historical implementation detection guard; Explicit implementation tracking activation; Spec approval gate; Signoff gate; Materialized approval and verification projections; State-independent verification operations and audit; StartVerification sovereign schema resolution; Verification requirement follows workflow topology; Artifacts; Artifact sync; History and event sourcing; Archive outcome history; Historical implementation detection; Schema version; Drafting and discarding; Drafted read-only semantics; Lifecycle interpretation authority; Policy-aware invalidation; Per-file drift tracking; Task completion scope; Validity fingerprint scope; Sovereign schema for validity fingerprints; Autonomous current notes; Implicit note add deduplication; Successful transition note transaction)

- [ ] 12.23 Preserve the complete core:archive-repository-port baseline contract
      core:archive-repository-port: mapped domain/repository suites in design.md — preserve all unchanged requirements while adding notes.
      Approach: run the complete existing verification scenarios and add the new note cases without replacing baseline assertions.
      (Req: Inheritance from Repository base; archive moves a change to the archive; archive persists through a staged commit; Archive path confinement; Archive repository debug logging; archive rejects non-archivable state; list returns all archived changes in chronological order; list returns index entries; Archive list count; get returns an archived change or null; fs implementation maintains archive runtime ignore rules; archivePath returns the absolute path for an archived change; internalPaths returns absolute storage paths; reindex rebuilds the archive index; Archive index metadata persistence; Abstract class with abstract methods; Append-only archive semantics; Success-cleaned note snapshot commit)

## 13. Design review refinements

- [ ] 13.1 Record the cross-package architecture decision
      docs/adr/0032-autonomous-change-context-notes.md: ADR — document snapshot/audit separation, lifecycle policies and pre-privacy representation ID.
      Approach: include the required More Information/Spec links; use the next unused number if concurrently claimed.
      (Req: default:\_global/docs — ADR creation)

- [ ] 13.2 Verify shared direction classification on every aggregate entry point
      packages/core/src/domain/services/transition-checks.ts; domain/entities/change.ts; application/use-cases/archive-change.ts: classifyAlong/transition/recover — keep policy evaluation consistent.
      Approach: pass sovereign schema/approvals from archive direct calls; use existing default topology for schema-free aggregate callers and preserve canonical recovery classification.
      (Req: core:note-auto-removal-policy — Effective event evaluation)

- [ ] 13.3 Preserve archive repository baseline behavior
      packages/core/test/infrastructure/fs archive integration suite: archive — retain staged commit, restoration, index and read-only archived snapshot guarantees.
      Approach: run the complete baseline port/adapter scenarios alongside the success-cleaned candidate tests without weakening prior assertions.
      (Req: core:archive-repository-port — Success-cleaned note snapshot commit)
