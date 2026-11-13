# Compliance audit: Core mutations and identity

Change: `support-commas-in-names`. Date: 2026-11-11. Scope: `core:update-implementation-tracking`, `core:edit-change`, `core:spec-id-format`, `core:update-spec-deps`, `core:update-persisted-spec-deps`, `core:spec-lock`, `core:workspace`, and `core:create-change`.

## Requirements Summary

The current merged spec and verification artifacts were obtained through `changes spec-preview` for each of the eight specs. The compiled project context and relevant direct dependencies were considered. The appendix inventories each merged requirement and named scenario; an inventory entry is not a claim that it has a distinct executable test. The focused Core suites passed: 253 tests in eight files. The parent verification also ran the full Core and CLI suites and package checks. The fresh code graph marks `UpdateImplementationTracking`'s file as CRITICAL impact (65 affected files), which supports checking its Core and CLI consumers.

## Implementation Status

The agreed corrections are present and verified: case aliases in a new batch collapse through `sameTrackedFile` on macOS/Windows and stay distinct on Linux; `parseSpecId` validates the resolved workspace via `isValidWorkspaceName`; `UpdateSpecDeps` captures one-shot workspace iterables in the constructor; strict lock errors include the rejected dependency string and field path; the stale primary-workspace clauses were removed from merged `core:workspace` and `core:archived-change-index-entry` contracts. The corresponding focused tests pass.

One pre-existing metadata fallback discrepancy remains in the merged `core:create-change` and `core:edit-change` contracts. The user explicitly deferred it outside this change. It should not be mistaken for a regression introduced by the comma-name implementation.

## Detailed Finding

### CM4 — Deferred specification/implementation discrepancy: metadata-only dependency seeding

**Severity:** Medium. **Classification:** known baseline issue, outside this change by user decision.

Merged `core:create-change` and `core:edit-change` still require `metadata.json.dependsOn` as a legacy fallback when persisted semantic state is absent, including stale metadata. Both use cases call `loadPersistedSpecDependsOn`, which returns an empty dependency set when `readPersistedState` returns null. It does not call `GetSpecMetadata` or any metadata reader. Consequently the four metadata-only scenarios cannot be established by the current implementation. The older tests bearing metadata-fallback names provide a lock sidecar, so they do not reproduce the required metadata-only condition. The existing exploration file records the user's decision to handle this separately. Restoring a direct raw-cache read here would conflict with the newer metadata ownership boundary; a future change must reconcile those contracts and use `GetSpecMetadata` if metadata is required.

Evidence: `packages/core/src/application/use-cases/_shared/load-persisted-spec-depends-on.ts`; merged `core:create-change` and `core:edit-change` specifications; `packages/core/test/application/use-cases/{create-change,edit-change}.spec.ts`.

## Test Coverage and Gaps

- Case aliases: `update-implementation-tracking.spec.ts` covers new-batch darwin/win32 collapse, Linux distinction, and existing-entry spelling.
- Default workspace: `parse-spec-id.spec.ts` covers invalid empty, one-character, uppercase/space, and device-name overrides with and without configured membership, and separates a valid unknown workspace error.
- One-shot iterables: `update-spec-deps.spec.ts` constructs with `Map.keys()` and executes twice.
- Lock diagnostic: `parse-spec-lock.spec.ts` checks rejected value, field path, owner/location, and lenient behavior; the full suite also exercises repository strict/lenient reads.
- Metadata-only fallback: meaningful tests remain absent, as described in CM4. It is not part of the current implementation task list.
- Linux and Windows were modeled in unit tests; local execution was on macOS. The three-OS CI matrix is the remaining platform gate.

## Global and Dependency Conformance

The changed domain helpers remain pure and use the shared validation rule. Application use cases use ports and typed `SpecdError` derivatives. Platform case/separator behavior is contained in the tracking helper; no host-specific branch was added to CLI. `core:workspace` now describes the plural per-spec workspace set and allows disposable metadata-cache writes for readOnly source workspaces, matching its direct repository dependency. `core:archived-change-index-entry` no longer assigns a primary workspace to a change. No new cross-scope contradiction was found in these corrected areas.

## Summary

Eight change specs audited. No new current-scope implementation gap identified in this batch. One known deferred metadata-only dependency-seeding discrepancy remains in two merged specs and four named scenarios. Passing tests do not resolve that discrepancy. No code, canonical spec, test, or lifecycle state was modified by this audit.

## Complete Merged Inventory

The following list records each requirement and scenario reviewed from the merged artifacts. Status is supported by source plus related passing suites except for the four metadata-fallback scenarios described in CM4; structural/type requirements use source and typecheck evidence. The status is requirement-level evidence, not one-to-one scenario test mapping.

### core:update-implementation-tracking

Requirements: 14; scenarios: 43.

Requirements:

- Input contract
- Add mutation creates or enriches implementation links
- Remove mutation removes implementation links
- Resolve mutation closes tracked-file review
- Unresolve mutation reopens tracked-file review
- Ignore mutation preserves tracked history
- Start mutation activates implementation tracking
- Change must exist
- Missing-file validation uses typed errors
- Persistence and result projection
- Config-based factory delegates through resolveUpdateImplementationTrackingDeps
- File names are whole names
- Path separators are normalized on Windows hosts
- Multi-file mutations are all-or-nothing

Scenarios:

1. Execute accepts implementation-tracking mutation input
2. Invalid specId rejected before any mutation
3. Bare specId normalized
4. specId is validated for start
5. Add without specId fails with a typed input error
6. Unknown workspace in specId is rejected
7. specId is validated for any action
8. Add requires file existence and opens tracking when needed
9. Add allows specId declared in change or existing in canonical repository
10. Add throws SpecNotFoundError when specId is absent from change and repository
11. Batch add with invalid specId fails atomically and leaves change untouched
12. Remove with symbols deletes only those refinements
13. Resolve requires tracked existing file
14. Unresolve reopens resolved file
15. Unresolve refuses removed file
16. Ignore preserves confirmed links for tracked file
17. Start mutation activates tracking on change without requiring file
18. Unknown change throws ChangeNotFoundError
19. Missing file throws ImplementationFileNotFoundError
20. Mutation persists and returns implementation projection
21. createUpdateImplementationTracking config form derives UpdateImplementationTrackingDeps through resolveUpdateImplementationTrackingDeps
22. Name with a comma is matched exactly
23. Missing name is reported whole
24. Leading and trailing spaces are preserved
25. Quote, backslash, and non-ASCII names are preserved
26. Equivalent array input through the SDK
27. Quote, backslash, and non-ASCII names are each preserved separately
28. Duplicate names collapse to one
29. Both file and files are combined
30. Windows error quotes the original value
31. Case-only difference denotes the same file on a case-insensitive host
32. Case-only difference is distinct on a case-sensitive host
33. New-batch case aliases collapse on case-insensitive hosts
34. New-batch case variants remain distinct on Linux
35. Backslash path matches the tracked forward-slash entry on Windows
36. Stored name uses forward slashes on Windows
37. Backslash is preserved on POSIX hosts
38. Comma names are unaffected by separator normalization
39. Normalization applies to batches and every action
40. Every other action normalizes on Windows
41. Separator helper is a pure function of the platform
42. A missing fourth file leaves the change untouched
43. All valid files are applied together

### core:edit-change

Requirements: 19; scenarios: 50.

Requirements:

- Change lookup
- No-op when no spec changes requested
- Description update does not invalidate
- Removal precedes addition
- Removal of absent spec throws
- Addition is idempotent
- Seed specDependsOn for added specs
- No-op when specIds unchanged after processing
- Approval invalidation on effective change
- Directory cleanup on removal
- Implementation tracking refresh on spec change
- Input contract
- Invalidation policy edits
- Output contract
- Dependencies
- Config-based factory delegates through resolveEditChangeDeps
- Schema compatibility guardrail
- Spec ID validation
- ReadOnly workspace rejection

Scenarios:

1. Change does not exist
2. Description provided with no spec changes
3. Both add and remove are absent
4. Both add and remove are empty arrays
5. Description and addSpecIds together
6. addSpecIds with no effective change
7. Description-only update does not invalidate
8. Remove and add in same call
9. Removing a spec not in the change
10. Adding a spec already present
11. Persisted dependency state seeds new spec entry
12. Legacy metadata seeds when persisted semantic state is absent — deferred CM4 discrepancy
13. Stale metadata still seeds as legacy fallback — deferred CM4 discrepancy
14. Existing in-change dependency snapshot is not overwritten
15. Remove and re-add the same spec
16. Adding a new spec triggers invalidation
17. Removing a spec triggers invalidation
18. Effective change is applied on the freshest persisted spec list
19. Removing a spec cleans up its scaffolded directories
20. Removing multiple specs cleans up all their directories
21. Adding a spec does not trigger unscaffold
22. Spec removal triggers implementation tracking refresh
23. execute accepts EditChangeInput
24. Editing invalidationPolicy persists the new value
25. Editing invalidationPolicy does not invent drift
26. Unknown invalidation policy rejected
27. Invalid invalidation policy is rejected together with valid edits
28. execute returns EditChangeResult
29. Uses ChangeRepository port
30. Uses ActorResolver port
31. Uses spec repositories map for existence checks and dependency seeding
32. createEditChange config form derives EditChangeDeps through resolveEditChangeDeps
33. Uninitialized spec fallback allows addition if global schema matches change
34. Adding a spec with identical schema succeeds
35. Adding a spec with a different but compatible schema succeeds
36. Adding a spec with an incompatible schema throws IncompatibleSchemaError
37. Invalid ID rejected and nothing persisted
38. Empty ID rejected
39. ID containing a comma is one invalid ID
40. Unknown workspace rejected
41. Bare ID stored qualified
42. One invalid entry among valid ones
43. Spec that does not exist yet is accepted
44. Removal entry is not syntax-validated
45. Duplicate removal entries collapse
46. Removal of a bare ID matches the qualified stored form
47. Adding a readOnly spec fails with the typed error
48. One line per offending spec and nothing applied
49. Removal is not subject to ownership
50. SDK callers are covered

### core:spec-id-format

Requirements: 14; scenarios: 64.

Requirements:

- Canonical format
- Bare path shorthand
- Unknown workspace rejection
- Parsing rules
- Capability segments reject Windows device names
- specDependsOn format
- Normalization
- Workspace name rule
- Capability path segment rule
- Syntax validation
- Single validator
- Use cases validate and normalize
- Patterns and schema references
- Persisted IDs are fully qualified

Scenarios:

1. Simple spec ID with default workspace
2. Non-default workspace
3. Multi-segment capability path
4. Nested capability path is valid
5. Bare path defaults to default workspace
6. Single-segment bare path
7. Bare path at an input boundary resolves to default
8. Bare dependsOn entry resolves to the owning workspace
9. Colon syntax with unknown workspace
10. Unknown workspace with a workspace set raises the typed error
11. One error class from either import path
12. Syntax-only validation without a workspace set
13. Workspace set accepts workspace objects
14. Bare path with a project that lacks the default workspace
15. Unknown workspace in a context pattern is a warning
16. Colon takes precedence over slash
17. Slash is never a workspace separator
18. Result is always fully qualified
19. Only the first colon separates the workspace
20. A device-name segment is rejected
21. con-foo remains a legal segment
22. specDependsOn uses canonical format
23. Cross-workspace specDependsOn
24. Bare path normalized to fully-qualified
25. Adapters do not normalize
26. Display paths do not qualify IDs
27. Two-character workspace is accepted
28. One-character workspace is rejected
29. Uppercase, leading digit, and underscore are rejected
30. Hyphen inside is accepted
31. Windows device name as workspace is rejected
32. One shared implementation
33. Project init rejects what the loader rejects
34. Valid segments
35. Uppercase segment rejected
36. Space, comma, dot, quote, and backslash rejected
37. Segment may start with a digit or underscore but not a hyphen
38. Device name segment rejected at any depth
39. Prefix segments use the same rule
40. SpecPath applies the same rule
41. Empty and blank IDs are rejected
42. Missing workspace or path around the colon
43. Empty and dot segments rejected
44. Backslash is not a separator
45. Windows-style path given as a spec ID
46. Error quotes the full value
47. Remove operations do not validate syntax
48. Domain service has no application dependency
49. Name iterables are accepted
50. Default workspace override
51. Invalid default workspace override is rejected without membership data
52. Invalid default workspace override is rejected before membership lookup
53. Use case rejects an invalid ID raised through MCP or SDK
54. Use case stores the qualified form
55. CLI holds no spec ID helper
56. Wildcard patterns parse
57. Misplaced wildcard rejected
58. Patterns validated at load are interpreted identically
59. Schema references split into workspace and name
60. No lenient generic splitter
61. Per-spec workspaces are derived through the validator
62. Bare dependency in a lock is rejected on read
63. Manifest rejects an invalid ID
64. Metadata is written strictly but read leniently

### core:update-spec-deps

Requirements: 14; scenarios: 41.

Requirements:

- Input contract
- Change lookup
- Spec must belong to the change
- Mutual exclusivity of set vs add/remove
- At least one operation required
- Set replaces all dependencies
- Remove validates existence
- Add is idempotent
- Remove is applied before add
- Persistence and output
- Typed errors for dependency update failures
- Config-based factory delegates through resolveUpdateSpecDepsDeps
- Clear removes all dependencies
- Spec ID validation

Scenarios:

1. execute accepts UpdateSpecDepsInput
2. Input accepts clear
3. One-shot workspace iterable supports repeated execution
4. Change does not exist
5. Spec ID not in change
6. Set used together with add
7. Set used together with remove
8. clear with set rejected
9. clear with add or remove rejected
10. add and remove together still allowed
11. Same ID in remove and add ends up present
12. No operation specified
13. clear alone satisfies the minimum operation
14. Set overwrites existing dependencies
15. Set with empty array clears dependencies
16. set with an empty string stores nothing
17. Removing a dependency not in current deps
18. Adding a dependency already present
19. Remove and add in same call
20. Change is persisted and result returned through serialized mutation
21. Dependencies with no prior state
22. Mutually exclusive flags throw validation error
23. Dependency not found throws error
24. createUpdateSpecDeps config form derives UpdateSpecDepsDeps through resolveUpdateSpecDepsDeps
25. resolveUpdateSpecDepsDeps resolves the workspace set
26. clear empties the list
27. clear on an already empty list
28. Use case asks for no confirmation
29. Clear with no prior dependency state
30. Invalid-input errors carry the INVALID_INPUT code
31. Blank dependency rejected on add
32. Malformed dependency rejected on set
33. Unknown workspace rejected
34. Dependency on a spec that does not exist yet is accepted
35. Bare dependency is stored qualified
36. One invalid entry among valid ones stores nothing
37. Remove can delete an invalid stored value
38. Same behavior through the SDK
39. Remove normalizes a bare valid ID
40. Remove entry that is not a valid ID is matched literally
41. Comma-containing dependency is one invalid ID

### core:update-persisted-spec-deps

Requirements: 13; scenarios: 43.

Requirements:

- Input contract
- Mutual exclusivity and minimum operation
- Remove is applied before add
- Reading current persisted state
- Set and clear create missing persisted state
- Non-empty add creates missing persisted state
- Remove and empty add against missing state are no-ops
- Applying the mutation through the shared patch helper
- Conditional write and concurrency
- Unknown spec fails with a typed error
- Result contract
- Config-based factory delegates through resolveUpdatePersistedSpecDepsDeps
- Spec ID validation and existing targets

Scenarios:

1. specId is required
2. set combined with add is rejected
3. clear combined with remove is rejected
4. No operation provided is rejected
5. A dependency present in both remove and add ends up present without duplication
6. originalHash from the read snapshot is used for optimistic concurrency
7. set against a lock-less spec creates state with exactly the supplied list
8. clear against a lock-less spec creates state with an empty list
9. add against a lock-less spec derives an initial base before adding
10. add against a lock-less spec falls back to an empty base when the schema cannot extract dependencies
11. remove against a lock-less spec does not create state
12. add whose resulting merge would be empty against missing state does not create state
13. Only dependsOn is included in the patch
14. Remove before add with overlapping ID
15. Original hash is passed as expected revision
16. Set against a lock-less spec creates exactly the given list
17. Clear against a lock-less spec creates an empty list
18. Add against a lock-less spec derives the base first
19. Remove with non-empty add against a lock-less spec removes from the derived base
20. Add with no resolver result starts from the empty list
21. Remove alone against a lock-less spec is a no-op
22. Empty add against a lock-less spec is a no-op
23. Patch helper carries the other persisted fields unchanged
24. Concurrent modification propagates without retry
25. Existing state with add reports created false
26. ReadOnly workspace rejected before any I/O
27. Factory resolves collaborators from the resolver
28. Stale expectedRevision produces ArtifactConflictError without retry
29. Unresolvable spec identity throws SpecNotFoundError
30. created is false when mutating existing persisted state
31. Config-based factory resolves the initializePersistedSpecState collaborator
32. Empty dependency rejected before any I/O
33. Dependency target that does not exist rejected
34. Unknown workspace rejected
35. Bare dependency stored qualified
36. Remove deletes an invalid stored value
37. Remove normalizes a bare valid ID
38. Clear and set repair a lock with invalid dependencies
39. Add reads strictly
40. Remaining invalid entry after mutation fails
41. Invalid lock on strict read raises the typed lock error
42. Clear works on a valid lock
43. Valid entries accepted

### core:spec-lock

Requirements: 12; scenarios: 45.

Requirements:

- Sidecar location and naming
- Durable schema identity
- Guarded schema reassignment
- Persistent dependencies
- Archived implementation links
- Optional persisted optimization state
- Lock-less specs and explicit initialization
- Archive-time materialization
- Sidecar is the durable source of truth
- Repository hash of persisted lock state
- Sidecar is not a schema artifact
- Invalid lock fails with a typed error

Scenarios:

1. Sidecar is written next to archived spec artifacts
2. Schema identity remains immutable after first persistence
3. Non-reassignment write paths cannot replace schema
4. Reassignment validates target schema before replacing schema
5. Reassignment preserves dependsOn when target schema has no dependency extraction
6. Reassignment fails when extracted dependencies differ from canonical dependsOn
7. Reassignment preserves implementation and optimization values
8. Reassignment makes existing optimizations stale without deleting them
9. Reassigning to the currently recorded schema is a no-op
10. Sidecar dependencies are used as durable fallback
11. Empty dependency entry rejected
12. Bare dependency entry rejected
13. Qualified valid entries accepted
14. File-level link is stored without symbols
15. Symbol-level link preserves symbol list
16. Optimized field records value, schema baseline, and artifact state
17. Independent field baselines
18. Clearing the last optimized field omits the optimizations block
19. Pre-existing lock without optimizations remains valid
20. No migration synthesizes optimizations from agent-generated metadata
21. Lock-less spec with canonical artifacts is valid
22. Explicit initialization adopts existing artifacts
23. Explicit initialization fails when persisted state already exists
24. Semantic no-op mutation does not create persisted state
25. Persisted lock sidecars cannot be created without canonical artifacts
26. Excluded path is ignored during materialization
27. Workspace-boundary mismatch fails archive
28. Non-archive writers use conditional revision-guarded writes
29. Metadata regeneration does not mutate sidecar implementation links
30. Generated projection excludes a stale optimization field
31. persistedStateMeta hash matches lock sidecar bytes
32. Presence stamps do not expose lock as an artifact
33. there is no persistedStateHash method on the port
34. Sidecar is omitted from generic artifact metadata
35. Generic artifact reads reject the sidecar
36. Error names spec, file, and field path
37. No raw validation-library error escapes
38. Reading never rewrites or drops entries
39. Lenient dependsOn read tolerates only invalid dependsOn entries
40. Lenient read still validates other fields
41. Repository lenient read returns invalid dependsOn as given
42. Repository lenient read still rejects other invalid fields
43. writePersistedState repairs a lock with invalid dependsOn
44. Strict read of a lock with one valid and one invalid entry changes nothing on disk
45. Error code and message form

### core:workspace

Requirements: 12; scenarios: 42.

Requirements:

- Workspace identity
- Workspace properties
- External workspace inference
- Ownership semantics
- Prefix semantics
- Workspace-qualified spec IDs
- Active workspace determination
- Port-per-workspace pattern
- Cross-workspace references
- Workspace-level context patterns
- Workspace directory structure in changes
- Sole source of truth

Scenarios:

1. Valid workspace names accepted
2. Invalid workspace name rejected
3. Missing default workspace
4. Duplicate workspace name
5. A device-name workspace is rejected
6. con-foo remains a legal workspace name
7. One-character workspace name rejected
8. Two-character workspace name accepted
9. Names produced by project init are loadable
10. Existing project workspaces remain valid
11. Default workspace inherits defaults
12. Non-default workspace requires codeRoot
13. Non-default workspace defaults
14. Workspace with path inside repo root
15. Workspace with path outside repo root
16. Owned workspace allows all operations
17. Shared workspace allows all operations
18. ReadOnly workspace blocks change scope addition
19. ReadOnly workspace blocks archive
20. ReadOnly workspace blocks direct spec writes
21. ReadOnly workspace allows reads
22. Error messages do not suggest remediation
23. ReadOnly workspace permits metadata cache writes
24. Prefix prepended to capability path
25. No prefix uses bare path
26. Invalid prefix rejected
27. Prefix segment violating the segment rule
28. Bare path resolves to default workspace
29. Unknown workspace rejected
30. Unknown workspace in a spec ID raises the typed error
31. Malformed spec ID raises the typed error
32. Adapters do not qualify IDs even for display
33. Workspace active when change has spec in it
34. Workspace inactive when no specs target it
35. Repository map passed to cross-workspace use cases
36. Spec references another workspace's spec
37. Unknown workspace reference at config validation time
38. Unqualified pattern resolves to own workspace
39. DependsOn specs exempt from excludes
40. Single-workspace change includes workspace segment
41. External workspace config is never read
42. root workspace name is rejected

### core:create-change

Requirements: 15; scenarios: 49.

Requirements:

- Name uniqueness enforcement
- Actor resolution
- Initial history contains a single created event
- Change construction
- Initial specDependsOn seeding
- Input contract
- Active schema resolution
- Optional overlap check
- Initial invalidation policy
- Persistence and scaffolding
- Dependencies
- Config-based factory delegates through resolveCreateChangeDeps
- Schema compatibility guardrail
- Spec ID validation
- ReadOnly workspace rejection

Scenarios:

1. Change with duplicate name is rejected
2. Change with unique name succeeds
3. Actor identity is recorded in the created event
4. History contains exactly one created event
5. Active schema identity recorded when not provided on input
6. Description is included when provided
7. Description is omitted when not provided
8. Initial state is drafting
9. Persisted dependency state seeds dependencies at creation time
10. Legacy metadata seeds when persisted semantic state is absent — deferred CM4 discrepancy
11. Stale metadata still seeds as legacy fallback — deferred CM4 discrepancy
12. New spec starts without seeded dependency entry
13. execute accepts CreateChangeInput without schema fields
14. execute accepts explicit schema override
15. Partial schema override is rejected
16. specIds are recorded in the created event
17. Delegates to GetActiveSchema in project mode
18. Schema resolution errors propagate
19. Overlap report included when requested
20. Overlap detection failure does not fail creation
21. Overlap check skipped when flag absent
22. Overlap check skipped when specIds empty
23. New change persists the project default invalidationPolicy
24. Unknown invalidation policy rejected
25. Change is created via repository create
26. Change is created then scaffolded
27. Scaffolding uses specExists callback
28. Result includes changePath
29. Uses ChangeRepository port
30. Uses ActorResolver port
31. Uses ListWorkspaces for spec existence and dependency seeding
32. Uses GetActiveSchema for active schema resolution
33. Uses DetectOverlap for optional overlap check
34. createCreateChange config form derives CreateChangeDeps through resolveCreateChangeDeps
35. Uninitialized spec fallback allows addition if global schema matches change
36. Adding a spec with identical schema succeeds
37. Adding a spec with a different but compatible schema succeeds
38. Adding a spec with an incompatible schema throws IncompatibleSchemaError
39. Invalid ID rejected and no change created
40. Empty ID rejected
41. Duplicate IDs collapse
42. Existing name is reported before spec ID validation
43. Comma in an ID is not split
44. Unknown workspace rejected
45. Bare ID stored qualified
46. Spec that does not exist yet accepted
47. readOnly spec rejected
48. Mixed owned and readOnly specs
49. SDK callers are covered
