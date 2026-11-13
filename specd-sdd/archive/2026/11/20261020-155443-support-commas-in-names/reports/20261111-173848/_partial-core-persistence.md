# Compliance audit — Core persistence/configuration/archive index

Change: support-commas-in-names
Mode: specific change; full merged specs + project globals + direct dependencies
Date: 2026-11-11

## Outcome and limits

No newly introduced strict-ID, list-forwarding, persisted-dependency-repair, ownership, archive-index, or schema-parse regression was confirmed in this batch. Eight confirmed **baseline** discrepancy groups remain in the full merged contracts. They are recorded in the root `EXPLORATION_VERIFY_FOLLOWUPS.md` following the user's decision to defer them. They predate the current implementation diff or are contradictions in existing artifacts; they must not be represented as bugs introduced by support-commas-in-names. This follow-up audit checked the current merged previews for all 15 assigned specs, including the reconciled `core:archived-change-index-entry` and `core:workspace` contracts, and rechecked the current source locations for CP1–CP8.

This is current static code/contract review, the focused reproductions documented below from the previous full audit, and fresh suite evidence from the 2026-11-11 implementing post-hooks: all 12 configured test packages passed, as did repository lint and typecheck. The previous reproduction snippets were not re-executed because the implicated source branches remain unchanged; current code excerpts were checked directly. Successful suites do not prove one automated test for each prose scenario. The inventory below maps compiled scenarios to their parent requirement and source/suite evidence; it does not claim an independent execution for every scenario. Cross-platform branches have portable/stubbed tests; no fresh Windows/Linux runner was executed here. The refreshed graph reported current/contentFresh true before this audit.

## Confirmed discrepancies

### CP1 — Baseline implementation gap: stale optimizations do not fail ValidateSpecs (medium)

- Contract: core:validate-specs, “Persisted optimization staleness is an independent failure”; scenarios “Stale optimization field fails validation independently” and “Optimization staleness failure is reported even when metadata materialization succeeds”.
- Code: packages/core/src/application/use-cases/validate-specs.ts:491 (metadata consistency routine), :515 (materialization), :527 (persisted read). The entire use case only checks dependency equality; it never evaluates optimization freshness or records stale fields.
- Reproduction: an injected persisted state with optimizedContext baseline schema old-schema and current persisted schema schema, valid materialized dependsOn:[], and no failing artifact rules produces passed:true, failures:[], warnings:[]. Runtime reproduced with the existing makeSpec/makeSpecRepository/makeSchema test helpers.
- Coverage: current validate-specs.spec.ts has dependency, cache, artifact, and ID tests but no stale-optimization assertion.
- Resolution: implement the independent check and add a regression test if the spec is intended; otherwise revise the requirement/scenarios to document a different policy. No evidence supports dismissing this by suite success.

### CP2 — Baseline implementation gap: materialization warnings are discarded (low)

- Contract: core:validate-specs, “Metadata materialization and validation”; scenario “metadata-cache-write-failed is a warning, not a failure”.
- Code: validate-specs.ts:515 selects only .metadata from the GetSpecMetadata result and ignores .warnings; nothing maps the cache warning into entry.warnings.
- Reproduction: return warnings:[{kind:'metadata-cache-write-failed',specId:'default:auth/login',error:'cache write failed'}] together with a valid projection. Result warnings is [].
- Coverage: no current assertion for propagating this warning.
- Resolution: preserve/map warnings, or revise the spec if the intended contract is logging-only. This is unchanged baseline behavior.

### CP3 — Baseline implementation gap: lock-less metadata dependency mismatches are never checked (medium)

- Contract: core:validate-specs “Metadata materialization and validation” explicitly compares with [] for a lock-less spec; scenario “Post-materialization dependsOn mismatch becomes a validation failure” includes that case.
- Code: validate-specs.ts:527-529 returns immediately when readPersistedState returns null.
- Reproduction: readPersistedState=>null and materialized metadata.dependsOn=>['default:unexpected'] produces passed:true with no failure.
- Coverage: tests cover mismatches against present persisted state, not the null-state branch.
- Resolution: compare to the specified empty baseline, or revise the lock-less contract if extracted dependencies should instead be authoritative. core:generate-metadata currently says lock-less metadata derives dependencies from artifacts, so the contracts also need a deliberate consistency decision.

### CP4 — Baseline output-contract drift in GenerateSpecMetadata (low/medium)

- Contract: core:generate-metadata “Schema resolution” requires metadata:{} without extraction; “dependsOn resolution” requires [] when no lock and no extracted dependencies; “Assembled result” requires generatedBy:'core'. core:spec-metadata likewise states newly generated documents use generatedBy:'core'.
- Code: generate-spec-metadata.ts:197-223 always assembles provenance/optimizationStatus/contentHashes, omits generatedBy; :331-338 returns undefined for a lock-less omitted dependsOn. parse-metadata.ts:288 explicitly labels generatedBy legacy/never emitted by writers. PersistSpecMetadata does not add the marker either.
- Focused runtime results:
  - schema without metadataExtraction => hasExtraction:false, metadata keys ['optimizationStatus','contentHashes','provenance'] (not {}).
  - metadataExtraction:{} and absent lock => hasExtraction:true, 'dependsOn' in metadata === false, 'generatedBy' in metadata === false.
- Attribution: these assembly branches are unchanged by the current diff, which tightens parsing and normalizes specId. The implementation/comment suggests intentional evolution and stale artifacts, especially for generatedBy.
- Coverage: the bare-ID test asserts only metadata defined and hasExtraction false; it does not assert metadata:{} or these required keys.
- Resolution: reconcile spec/scenario contracts with the intended current projection; if the old contract is still intended, add missing fields/early return and tests.

### CP5 — Baseline implementation gap: explicit lock absence can receive a later lock hash (medium)

- Contract: core:generate-metadata “One consistent lock snapshot or explicit absence”, particularly “Explicit absence is treated as one consistent observation”.
- Code: generate-spec-metadata.ts:116 reads persisted state once; :168-171 uses persistedState?.originalHash ?? await persistedStateMeta(...). With null it makes another observation.
- Deterministic reproduction: readPersistedState=>null, then persistedStateMeta=>{hash:'sha256:'+ 'b'.repeat(64), lastModified:'2026-11-08T00:00:00.000Z'} (a lock created between observations). The result semantically uses absence but metadata.provenance.persistedStateHash is sha256:bbbb… rather than null. Reproduced against source via node --import tsx using the existing stub repository.
- Impact: provenance/freshness can certify a projection of absent semantics against a present lock. Materialization rechecks source state, but that does not make GenerateSpecMetadata’s own result fulfill its atomic-observation contract.
- Coverage: no test changes the Meta observation after a null persisted read.
- Resolution: preserve null as the observed hash for explicit absence, or weaken the snapshot guarantee explicitly. This code is unchanged by the current diff.

### CP6 — Baseline composition artifact drift: GetSpecMetadata instance versus map (low)

- Contract: core:validate-specs factory requirement/scenario demands getMetadata:ReadonlyMap<string,GetSpecMetadata> with one instance per workspace.
- Code: packages/core/src/composition/use-cases/validate-specs.ts:28 declares one GetSpecMetadata; :43 wires one shared use case; ValidateSpecs constructor accepts a single instance with a repository map.
- Resolution: update the artifact to the shared multiworkspace operation if intended, or implement/map the documented dependencies. Existing composition works through the single shared resolver; this is not an introduced runtime regression.

### CP7 — Baseline configuration artifact inconsistencies (low)

- core:config “Plugin declarations” says plugins MUST be present, but config-schema.ts:241 makes it optional and minimal-config tests accept omission. Decide whether to update the wording or enforce required plugins.
- core:config-loader “Path probe” says discovery resolvePath does not read/parse, but config-loader.ts:312 calls parseCascadeLayer for every candidate to determine the active root. Discovery-chain scenarios require this resolution and existing tests validate it; a spec clarification is the likely fix.
- core:config-loader “All errors are ConfigValidationError” conflicts with core:config “Missing directories throw StorageDirectoryNotFoundError”; config-loader.ts:594 implements StorageDirectoryNotFoundError. Limit the universal wording or change the error contract deliberately.
- No new shared workspace-rule/pattern bug was confirmed: validation uses isValidWorkspaceName/parseSpecPattern and prefixes use isValidCapabilitySegment; malformed patterns fail before matching and contextual defaults are supplied.

### CP8 — Baseline/in-change artifact contradiction about absent artifacts on schema reassignment (low)

- core:update-persisted-spec-schema “Loading and parsing declared artifacts under the target schema” says lack of a registered parser is the only skipped case. The existing implementation test explicitly requires skipping absent files; the merged requirement does not state that exception.
- update-persisted-spec-schema.ts:170 skips an absent artifact; the test “skips artifacts that do not exist on disk” enforces that branch.
- Resolution: make the requirement explicitly permit absent artifacts if the current test is intended, or change implementation/test to enforce the stated sole exception. Unconditional parsing of every present parseable artifact is implemented correctly; this is a requirement/test discrepancy, not evidence of a new parse-validation regression.

## Reproduction snippets

All commands are read-only against implementation/spec content. The common setup imports real use cases and existing test helpers; no production files were written.

```js
import { GenerateSpecMetadata } from './packages/core/src/application/use-cases/generate-spec-metadata.ts'
import { ValidateSpecs } from './packages/core/src/application/use-cases/validate-specs.ts'
import { makeSpec } from './packages/core/test/helpers/make-spec.ts'
import {
  makeSpecRepository,
  makeSchema,
  makeSchemaProvider,
  makeArtifactType,
  makeParsers,
  makeContentHasher,
  makeListWorkspaces,
} from './packages/core/test/application/use-cases/helpers.ts'
const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
const repo = makeSpecRepository({ specs: [spec], artifacts: { 'auth/login/spec.md': '# Login' } })
repo.readPersistedState = async () => null
repo.persistedStateMeta = async () => ({
  lastModified: '2026-11-08T00:00:00.000Z',
  hash: 'sha256:' + 'b'.repeat(64),
})
const generator = new GenerateSpecMetadata(
  makeListWorkspaces(new Map([['default', repo]])),
  makeSchemaProvider(
    makeSchema({
      artifacts: [
        makeArtifactType('specs', {
          scope: 'spec',
          output: 'spec.md',
          format: 'markdown',
        }),
      ],
    }),
  ),
  makeParsers(),
  makeContentHasher(),
  new Map(),
)
const result = await generator.execute({ specId: 'auth/login' })
console.log(
  result.hasExtraction,
  Object.keys(result.metadata),
  result.metadata.provenance.persistedStateHash,
)
// false, [optimizationStatus,contentHashes,provenance], sha256:bbbb…
// Expected for CP5: the explicit-null observation retains null provenance hash.

const getMetadata = {
  execute: async () => ({
    metadata: { dependsOn: ['default:unexpected'] },
    warnings: [
      {
        kind: 'metadata-cache-write-failed',
        specId: 'default:auth/login',
        error: 'cache write failed',
      },
    ],
  }),
}
const validator = new ValidateSpecs(
  new Map([['default', repo]]),
  makeSchemaProvider(makeSchema()),
  makeParsers(),
  getMetadata,
  makeContentHasher(),
)
console.log(await validator.execute({ specPath: 'default:auth/login' }))
// One entry: passed:true, failures:[], warnings:[] (CP2 and CP3).

repo.readPersistedState = async () => ({
  schema: { name: 'schema', version: 1 },
  dependsOn: [],
  implementation: [],
  originalHash: 'sha256:' + 'a'.repeat(64),
  optimizations: {
    optimizedContext: {
      value: 'stale',
      schema: { name: 'old-schema', version: 0 },
      artifactState: {},
    },
  },
})
getMetadata.execute = async () => ({ metadata: { dependsOn: [] }, warnings: [] })
console.log(await validator.execute({ specPath: 'default:auth/login' }))
// Again passed:true, failures:[] despite schema-stale optimization (CP1).
```

Run using `rtk proxy node --import tsx --input-type=module` with the snippet on stdin. The malformed/null inputs are deliberate injected-port observations permitted by the use-case contracts; they do not mutate repository fixtures.

## Requirement and scenario evidence matrix

Counts use compiled Rules headings as requirements and compiled scenario records; prose bullets/constraints are checked within their parent headings, not counted as separate invented requirements. A scenario can share a requirement-level proof with others. 'Supported' means source behavior supports the condition with suite evidence in that area; it does not claim a separate executed test for each row. 'Review' names the discrepancy above.

| Spec                                      | Requirements | Scenarios | Current-change behavior             | Baseline exceptions |
| ----------------------------------------- | -----------: | --------: | ----------------------------------- | ------------------- |
| core:generate-metadata                    |           11 |        37 | No introduced discrepancy confirmed | CP4; CP5; CP4 / CP5 |
| core:validate-specs                       |           13 |        41 | No introduced discrepancy confirmed | CP1; CP2 / CP3; CP6 |
| core:preview-spec                         |           11 |        32 | No introduced discrepancy confirmed | None confirmed      |
| core:config                               |           30 |       167 | No introduced discrepancy confirmed | CP7                 |
| core:get-persisted-spec-deps              |            7 |        16 | No introduced discrepancy confirmed | None confirmed      |
| core:get-persisted-spec-implementation    |            7 |        16 | No introduced discrepancy confirmed | None confirmed      |
| core:get-persisted-spec-optimizations     |           10 |        29 | No introduced discrepancy confirmed | None confirmed      |
| core:get-persisted-spec-schema            |            7 |        17 | No introduced discrepancy confirmed | None confirmed      |
| core:update-persisted-spec-implementation |           13 |        36 | No introduced discrepancy confirmed | None confirmed      |
| core:update-persisted-spec-optimizations  |           12 |        40 | No introduced discrepancy confirmed | None confirmed      |
| core:update-persisted-spec-schema         |           14 |        32 | No introduced discrepancy confirmed | CP8                 |
| core:spec-metadata                        |           11 |        73 | No introduced discrepancy confirmed | CP4                 |
| core:config-loader                        |           19 |        78 | No introduced discrepancy confirmed | CP7                 |
| core:spec-repository-port                 |           20 |        65 | No introduced discrepancy confirmed | None confirmed      |
| **Total**                                 |      **185** |   **679** |                                     |                     |

### core:generate-metadata

Implementation evidence (under packages/core/src): application/use-cases/generate-spec-metadata.ts.

Test evidence (under packages/core/test): application/use-cases/generate-spec-metadata.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                            | Assessment                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| Input and output                                                       | Review CP4 / CP5                                 |
| Schema resolution                                                      | Review CP4                                       |
| Spec resolution                                                        | Supported by source/area suite; see scope limits |
| Artifact loading and parsing                                           | Supported by source/area suite; see scope limits |
| Metadata extraction                                                    | Supported by source/area suite; see scope limits |
| dependsOn resolution                                                   | Review CP4                                       |
| One consistent lock snapshot or explicit absence                       | Review CP5                                       |
| Fresh lock-owned optimizations only                                    | Supported by source/area suite; see scope limits |
| Content hashes                                                         | Supported by source/area suite; see scope limits |
| Assembled result                                                       | Review CP4                                       |
| Config-based factory delegates through resolveGenerateSpecMetadataDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Schema resolution failure propagates** — Schema resolution. Review CP4 for relevant branch; other branches supported.
2. **Schema has no metadataExtraction** — Schema resolution. Review CP4 for relevant branch; other branches supported.
3. **Unknown workspace** — Spec resolution. Supported at requirement level by the source/suite evidence above.
4. **Spec not found** — Spec resolution. Supported at requirement level by the source/suite evidence above.
5. **Invalid spec ID rejected** — Spec resolution. Supported at requirement level by the source/suite evidence above.
6. **Empty spec ID rejected** — Spec resolution. Supported at requirement level by the source/suite evidence above.
7. **Bare spec ID normalized** — Spec resolution. Supported at requirement level by the source/suite evidence above.
8. **Unknown workspace rejected** — Spec resolution. Supported at requirement level by the source/suite evidence above.
9. **Artifact with unknown parser format skipped** — Artifact loading and parsing. Supported at requirement level by the source/suite evidence above.
10. **Artifact not on disk skipped** — Artifact loading and parsing. Supported at requirement level by the source/suite evidence above.
11. **Fields extracted from valid spec** — Metadata extraction. Supported at requirement level by the source/suite evidence above.
12. **Extraction uses shared transform registry with origin context** — Metadata extraction. Supported at requirement level by the source/suite evidence above.
13. **Extraction awaits async transform resolution** — Metadata extraction. Supported at requirement level by the source/suite evidence above.
14. **Relative spec path resolved during extraction** — dependsOn resolution. Review CP4 for relevant branch; other branches supported.
15. **Cross-workspace relative spec path resolves through repository-backed normalization** — dependsOn resolution. Review CP4 for relevant branch; other branches supported.
16. **Persisted state overrides omitted extracted dependsOn** — dependsOn resolution. Review CP4 for relevant branch; other branches supported.
17. **Mismatched extracted and persisted dependencies fail generation** — dependsOn resolution. Review CP4 for relevant branch; other branches supported.
18. **Lock-less spec derives dependsOn as a live projection of current artifacts** — dependsOn resolution. Review CP4 for relevant branch; other branches supported.
19. **Unresolvable dependency value fails extraction instead of being omitted** — dependsOn resolution. Review CP4 for relevant branch; other branches supported.
20. **Canonical spec ID may pass through resolveSpecPath when enabled by args** — dependsOn resolution. Review CP4 for relevant branch; other branches supported.
21. **Single persisted-state read is reused across all dependent fields** — One consistent lock snapshot or explicit absence. Review CP5 for relevant branch; other branches supported.
22. **Persisted state is not re-read partway through assembly** — One consistent lock snapshot or explicit absence. Review CP5 for relevant branch; other branches supported.
23. **Explicit absence is treated as one consistent observation** — One consistent lock snapshot or explicit absence. Review CP5 for relevant branch; other branches supported.
24. **provenance.persistedStateHash uses persistedStateMeta includeHash or snapshot originalHash** — One consistent lock snapshot or explicit absence. Review CP5 for relevant branch; other branches supported.
25. **Fresh optimization field is projected** — Fresh lock-owned optimizations only. Supported at requirement level by the source/suite evidence above.
26. **Stale optimization field is omitted, not fabricated** — Fresh lock-owned optimizations only. Supported at requirement level by the source/suite evidence above.
27. **Generation never mutates persisted optimization state** — Fresh lock-owned optimizations only. Supported at requirement level by the source/suite evidence above.
28. **Hashes computed for loaded artifacts** — Content hashes. Supported at requirement level by the source/suite evidence above.
29. **Missing artifacts excluded from hashes** — Content hashes. Supported at requirement level by the source/suite evidence above.
30. **Result includes generatedBy marker** — Assembled result. Review CP4 for relevant branch; other branches supported.
31. **Result merges extracted fields and hashes** — Assembled result. Review CP4 for relevant branch; other branches supported.
32. **Result includes fresh optimization fields and provenance** — Assembled result. Review CP4 for relevant branch; other branches supported.
33. **execute accepts specId string** — Input and output. Review CP4 / CP5 for relevant branch; other branches supported.
34. **Returns metadata and hasExtraction flag** — Input and output. Review CP4 / CP5 for relevant branch; other branches supported.
35. **metadata contains extracted fields and hashes** — Input and output. Review CP4 / CP5 for relevant branch; other branches supported.
36. **Result includes a provenance record reflecting the exact call state** — Input and output. Review CP4 / CP5 for relevant branch; other branches supported.
37. **createGenerateSpecMetadata config form derives GenerateSpecMetadataDeps through resolveGenerateSpecMetadataDeps** — Config-based factory delegates through resolveGenerateSpecMetadataDeps. Supported at requirement level by the source/suite evidence above.

### core:validate-specs

Implementation evidence (under packages/core/src): application/use-cases/validate-specs.ts.

Test evidence (under packages/core/test): application/use-cases/validate-specs.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                     | Assessment                                       |
| --------------------------------------------------------------- | ------------------------------------------------ |
| Resolve the active schema                                       | Supported by source/area suite; see scope limits |
| Filter to spec-scoped artifact types                            | Supported by source/area suite; see scope limits |
| Single spec validation mode                                     | Supported by source/area suite; see scope limits |
| Workspace validation mode                                       | Supported by source/area suite; see scope limits |
| All-workspaces validation mode                                  | Supported by source/area suite; see scope limits |
| Per-spec artifact validation                                    | Supported by source/area suite; see scope limits |
| Per-spec cross-artifact validation                              | Supported by source/area suite; see scope limits |
| Aggregated result                                               | Supported by source/area suite; see scope limits |
| Format inference and parser resolution                          | Supported by source/area suite; see scope limits |
| Metadata materialization and validation                         | Review CP2 / CP3                                 |
| Persisted optimization staleness is an independent failure      | Review CP1                                       |
| Transparent validation result cache                             | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveValidateSpecsDeps | Review CP6                                       |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Schema resolution failure propagates** — Resolve the active schema. Supported at requirement level by the source/suite evidence above.
2. **Change-scoped artifacts excluded** — Filter to spec-scoped artifact types. Supported at requirement level by the source/suite evidence above.
3. **Validate a single spec by qualified path** — Single spec validation mode. Supported at requirement level by the source/suite evidence above.
4. **Unknown workspace in specPath throws WorkspaceNotFoundError** — Single spec validation mode. Supported at requirement level by the source/suite evidence above.
5. **Spec not found throws SpecNotFoundError** — Single spec validation mode. Supported at requirement level by the source/suite evidence above.
6. **Invalid specPath rejected** — Single spec validation mode. Supported at requirement level by the source/suite evidence above.
7. **Bare specPath resolved to the default workspace** — Single spec validation mode. Supported at requirement level by the source/suite evidence above.
8. **Comma in specPath is not split** — Single spec validation mode. Supported at requirement level by the source/suite evidence above.
9. **All specs in workspace validated** — Workspace validation mode. Supported at requirement level by the source/suite evidence above.
10. **Unknown workspace throws WorkspaceNotFoundError** — Workspace validation mode. Supported at requirement level by the source/suite evidence above.
11. **All specs across all workspaces validated** — All-workspaces validation mode. Supported at requirement level by the source/suite evidence above.
12. **Missing required artifact recorded as failure** — Per-spec artifact validation. Supported at requirement level by the source/suite evidence above.
13. **Missing optional artifact skipped silently** — Per-spec artifact validation. Supported at requirement level by the source/suite evidence above.
14. **Artifact with no validation rules skipped** — Per-spec artifact validation. Supported at requirement level by the source/suite evidence above.
15. **Artifact with no local rules is still parsed for cross-artifact validation** — Per-spec artifact validation. Supported at requirement level by the source/suite evidence above.
16. **Validation rules evaluated against parsed AST** — Per-spec artifact validation. Supported at requirement level by the source/suite evidence above.
17. **Cross-artifact mismatch becomes a spec failure** — Per-spec cross-artifact validation. Supported at requirement level by the source/suite evidence above.
18. **Deferred rule is surfaced when a participant is not locally valid** — Per-spec cross-artifact validation. Supported at requirement level by the source/suite evidence above.
19. **ValidateSpecs reuses ValidateArtifacts cross-artifact semantics** — Per-spec cross-artifact validation. Supported at requirement level by the source/suite evidence above.
20. **Counts reflect validation outcomes** — Aggregated result. Supported at requirement level by the source/suite evidence above.
21. **Cross-artifact failures and deferred warnings are aggregated per spec** — Aggregated result. Supported at requirement level by the source/suite evidence above.
22. **Format inferred from filename when not explicit** — Format inference and parser resolution. Supported at requirement level by the source/suite evidence above.
23. **No parser available skips artifact silently** — Format inference and parser resolution. Supported at requirement level by the source/suite evidence above.
24. **Stale persisted metadata is self-healed, not a failure** — Metadata materialization and validation. Review CP2 / CP3 for relevant branch; other branches supported.
25. **Materialization failure becomes a validation failure** — Metadata materialization and validation. Review CP2 / CP3 for relevant branch; other branches supported.
26. **Post-materialization dependsOn mismatch becomes a validation failure** — Metadata materialization and validation. Review CP2 / CP3 for relevant branch; other branches supported.
27. **Extracted dependsOn mismatch becomes a validation failure** — Metadata materialization and validation. Review CP2 / CP3 for relevant branch; other branches supported.
28. **Persisted dependency projection remains valid without extraction** — Metadata materialization and validation. Review CP2 / CP3 for relevant branch; other branches supported.
29. **metadata-cache-write-failed is a warning, not a failure** — Metadata materialization and validation. Review CP2 / CP3 for relevant branch; other branches supported.
30. **Stale optimization field fails validation independently** — Persisted optimization staleness is an independent failure. Review CP1 for relevant branch; other branches supported.
31. **Optimization staleness failure is reported even when metadata materialization succeeds** — Persisted optimization staleness is an independent failure. Review CP1 for relevant branch; other branches supported.
32. **No optimizations or only fresh optimizations does not fail this check** — Persisted optimization staleness is an independent failure. Review CP1 for relevant branch; other branches supported.
33. **Hard hit skips full validation work** — Transparent validation result cache. Supported at requirement level by the source/suite evidence above.
34. **Soft hit is invisible to ValidateSpecs** — Transparent validation result cache. Supported at requirement level by the source/suite evidence above.
35. **Miss runs full validation and upserts including failures** — Transparent validation result cache. Supported at requirement level by the source/suite evidence above.
36. **Lock content change forces miss via cacheFingerprint** — Transparent validation result cache. Supported at requirement level by the source/suite evidence above.
37. **Hosts observe identical public behaviour on hit or miss** — Transparent validation result cache. Supported at requirement level by the source/suite evidence above.
38. **Workspace discovery lists with includeMeta** — Transparent validation result cache. Supported at requirement level by the source/suite evidence above.
39. **Warm hard hit does not N×get solely for stamps** — Transparent validation result cache. Supported at requirement level by the source/suite evidence above.
40. **createValidateSpecs config form derives ValidateSpecsDeps through resolveValidateSpecsDeps** — Config-based factory delegates through resolveValidateSpecsDeps. Review CP6 for relevant branch; other branches supported.
41. **resolveValidateSpecsDeps wires one GetSpecMetadata instance per workspace** — Config-based factory delegates through resolveValidateSpecsDeps. Review CP6 for relevant branch; other branches supported.

### core:preview-spec

Implementation evidence (under packages/core/src): application/use-cases/preview-spec.ts.

Test evidence (under packages/core/test): application/use-cases/preview-spec.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                   | Assessment                                       |
| ------------------------------------------------------------- | ------------------------------------------------ |
| Ports and constructor                                         | Supported by source/area suite; see scope limits |
| Input                                                         | Supported by source/area suite; see scope limits |
| Spec ID validation                                            | Supported by source/area suite; see scope limits |
| File discovery via change artifacts                           | Supported by source/area suite; see scope limits |
| Delta application                                             | Supported by source/area suite; see scope limits |
| Artifact file ordering                                        | Supported by source/area suite; see scope limits |
| Diff generation                                               | Supported by source/area suite; see scope limits |
| Result shape                                                  | Supported by source/area suite; see scope limits |
| Error handling                                                | Supported by source/area suite; see scope limits |
| Schema name guard                                             | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolvePreviewSpecDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Constructor receives required dependencies** — Ports and constructor. Supported at requirement level by the source/suite evidence above.
2. **execute receives change name and specId** — Input. Supported at requirement level by the source/suite evidence above.
3. **includeDiff is opt-in** — Input. Supported at requirement level by the source/suite evidence above.
4. **includeDiff enables diff generation** — Input. Supported at requirement level by the source/suite evidence above.
5. **specId not in change throws error** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
6. **Invalid specId rejected before membership check** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
7. **Empty and comma specIds rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
8. **Bare specId normalized then checked against the change** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
9. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
10. **Valid specId outside the change rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
11. **Documented errors** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
12. **Delta files discovered from change artifacts** — File discovery via change artifacts. Supported at requirement level by the source/suite evidence above.
13. **New spec files discovered from change artifacts** — File discovery via change artifacts. Supported at requirement level by the source/suite evidence above.
14. **Delta merged into base spec content** — Delta application. Supported at requirement level by the source/suite evidence above.
15. **No-op delta records status** — Delta application. Supported at requirement level by the source/suite evidence above.
16. **Missing delta file records status** — Delta application. Supported at requirement level by the source/suite evidence above.
17. **All schema artifacts returned** — Delta application. Supported at requirement level by the source/suite evidence above.
18. **spec.md appears first** — Artifact file ordering. Supported at requirement level by the source/suite evidence above.
19. **Remaining files sorted alphabetically** — Artifact file ordering. Supported at requirement level by the source/suite evidence above.
20. **Merged entry includes generated diff** — Diff generation. Supported at requirement level by the source/suite evidence above.
21. **New spec entry uses empty base for diff generation** — Diff generation. Supported at requirement level by the source/suite evidence above.
22. **no-op and missing entries omit diff output** — Diff generation. Supported at requirement level by the source/suite evidence above.
23. **DiffGenerationError produces warning without downgrading merged entry** — Diff generation. Supported at requirement level by the source/suite evidence above.
24. **Base content and status included for delta files** — Result shape. Supported at requirement level by the source/suite evidence above.
25. **Base is null and status is merged for new specs** — Result shape. Supported at requirement level by the source/suite evidence above.
26. **diff field is omitted when diff generation is disabled** — Result shape. Supported at requirement level by the source/suite evidence above.
27. **diff field is present for merged entries when enabled** — Result shape. Supported at requirement level by the source/suite evidence above.
28. **Delta application failure produces warning and missing status** — Error handling. Supported at requirement level by the source/suite evidence above.
29. **Other files still returned on partial failure** — Error handling. Supported at requirement level by the source/suite evidence above.
30. **DiffGenerationError remains a warning-only partial result** — Error handling. Supported at requirement level by the source/suite evidence above.
31. **Schema mismatch throws** — Schema name guard. Supported at requirement level by the source/suite evidence above.
32. **createPreviewSpec config form derives PreviewSpecDeps through resolvePreviewSpecDeps** — Config-based factory delegates through resolvePreviewSpecDeps. Supported at requirement level by the source/suite evidence above.

### core:config

Implementation evidence (under packages/core/src): application/ports/config-schema.ts; infrastructure/fs/config-loader.ts; infrastructure/fs/config-cascade.ts; application/use-cases/\_shared/spec-pattern-matching.ts.

Test evidence (under packages/core/test): infrastructure/fs/config-loader.spec.ts; application/use-cases/compile-context.spec.ts; application/use-cases/\_shared/spec-pattern-matching.spec.ts; code-graph discovery/filter suites (parent general test command used cache). Relevant matching composition factories delegate through resolver helpers.

| Requirement                                               | Assessment                                       |
| --------------------------------------------------------- | ------------------------------------------------ |
| Config file location and format                           | Supported by source/area suite; see scope limits |
| Privacy settings                                          | Supported by source/area suite; see scope limits |
| Environment variable overrides                            | Supported by source/area suite; see scope limits |
| Forced actor provider                                     | Supported by source/area suite; see scope limits |
| Local config override                                     | Supported by source/area suite; see scope limits |
| Cascade identity and removal model                        | Supported by source/area suite; see scope limits |
| Schema reference                                          | Supported by source/area suite; see scope limits |
| Invalidation policy configuration                         | Supported by source/area suite; see scope limits |
| Workspaces                                                | Supported by source/area suite; see scope limits |
| Workspace names and context patterns use the shared rules | Supported by source/area suite; see scope limits |
| Workspace-level graph configuration                       | Supported by source/area suite; see scope limits |
| Project-relative graph path semantics                     | Supported by source/area suite; see scope limits |
| Storage configuration                                     | Supported by source/area suite; see scope limits |
| Named storage adapters                                    | Supported by source/area suite; see scope limits |
| Config path and derived directories                       | Supported by source/area suite; see scope limits |
| Template variables                                        | Supported by source/area suite; see scope limits |
| Schema plugins                                            | Supported by source/area suite; see scope limits |
| Schema overrides                                          | Supported by source/area suite; see scope limits |
| Context spec selection                                    | Supported by source/area suite; see scope limits |
| Context mode                                              | Supported by source/area suite; see scope limits |
| Project context instructions                              | Supported by source/area suite; see scope limits |
| Approvals                                                 | Supported by source/area suite; see scope limits |
| Logging configuration                                     | Supported by source/area suite; see scope limits |
| LLM optimization                                          | Supported by source/area suite; see scope limits |
| Plugin declarations                                       | Review CP7                                       |
| Config writer port                                        | Supported by source/area suite; see scope limits |
| Startup validation                                        | Supported by source/area suite; see scope limits |
| Legacy configuration warnings                             | Supported by source/area suite; see scope limits |
| Project-level graph configuration                         | Supported by source/area suite; see scope limits |
| Graph file size limit                                     | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Discover config walking up to VCS root** — Config file location and format. Supported at requirement level by the source/suite evidence above.
2. **No VCS repo checks only CWD** — Config file location and format. Supported at requirement level by the source/suite evidence above.
3. **Host bootstrap may supply an explicit discovery root** — Config file location and format. Supported at requirement level by the source/suite evidence above.
4. **Mode hash requires salt** — Privacy settings. Supported at requirement level by the source/suite evidence above.
5. **excludeActors defaults applied** — Privacy settings. Supported at requirement level by the source/suite evidence above.
6. **Variable takes precedence over specd.yaml** — Environment variable overrides. Supported at requirement level by the source/suite evidence above.
7. **Selection by name** — Forced actor provider. Supported at requirement level by the source/suite evidence above.
8. **Local standalone file replaces shared config** — Local config override. Supported at requirement level by the source/suite evidence above.
9. **Local file absent** — Local config override. Supported at requirement level by the source/suite evidence above.
10. **Local file joins the cascade when extends is true** — Local config override. Supported at requirement level by the source/suite evidence above.
11. **Local file must be valid when standalone** — Local config override. Supported at requirement level by the source/suite evidence above.
12. **Local named variants apply in filename order** — Local config override. Supported at requirement level by the source/suite evidence above.
13. **Local variant patterns are gitignored** — Local config override. Supported at requirement level by the source/suite evidence above.
14. **Context entry removed by id** — Cascade identity and removal model. Supported at requirement level by the source/suite evidence above.
15. **Plugin entry removed by name identity** — Cascade identity and removal model. Supported at requirement level by the source/suite evidence above.
16. **Workspace removed by name** — Cascade identity and removal model. Supported at requirement level by the source/suite evidence above.
17. **Explicit-base local variant is skipped until its base is active** — Cascade identity and removal model. Supported at requirement level by the source/suite evidence above.
18. **npm package schema** — Schema reference. Supported at requirement level by the source/suite evidence above.
19. **Bare name resolved from default workspace** — Schema reference. Supported at requirement level by the source/suite evidence above.
20. **Hash-prefixed name resolved from default workspace** — Schema reference. Supported at requirement level by the source/suite evidence above.
21. **Workspace-qualified schema reference** — Schema reference. Supported at requirement level by the source/suite evidence above.
22. **Direct path schema** — Schema reference. Supported at requirement level by the source/suite evidence above.
23. **Schema not found** — Schema reference. Supported at requirement level by the source/suite evidence above.
24. **Schema fails validation** — Schema reference. Supported at requirement level by the source/suite evidence above.
25. **Schema field missing** — Schema reference. Supported at requirement level by the source/suite evidence above.
26. **Schema-independent command skips resolution** — Schema reference. Supported at requirement level by the source/suite evidence above.
27. **Root invalidationPolicy accepts the four canonical values** — Invalidation policy configuration. Supported at requirement level by the source/suite evidence above.
28. **Unknown invalidationPolicy is rejected** — Invalidation policy configuration. Supported at requirement level by the source/suite evidence above.
29. **Default workspace only (simple project)** — Workspaces. Supported at requirement level by the source/suite evidence above.
30. **specd init creates default workspace** — Workspaces. Supported at requirement level by the source/suite evidence above.
31. **Non-default workspace resolves outside repo** — Workspaces. Supported at requirement level by the source/suite evidence above.
32. **Non-default workspace with custom schemas path** — Workspaces. Supported at requirement level by the source/suite evidence above.
33. **Workspace-qualified schema with no schemas section declared** — Workspaces. Supported at requirement level by the source/suite evidence above.
34. **Workspace name collision** — Workspaces. Supported at requirement level by the source/suite evidence above.
35. **Missing default workspace** — Workspaces. Supported at requirement level by the source/suite evidence above.
36. **Missing codeRoot in non-default workspace** — Workspaces. Supported at requirement level by the source/suite evidence above.
37. **Allowed paths constrain workspace indexing** — Workspace-level graph configuration. Supported at requirement level by the source/suite evidence above.
38. **excludePaths replaces built-in defaults** — Workspace-level graph configuration. Supported at requirement level by the source/suite evidence above.
39. **graph block absent — no field on workspace config** — Workspace-level graph configuration. Supported at requirement level by the source/suite evidence above.
40. **respectGitignore defaults to true** — Workspace-level graph configuration. Supported at requirement level by the source/suite evidence above.
41. **respectGitignore set to false** — Workspace-level graph configuration. Supported at requirement level by the source/suite evidence above.
42. **Workspace testPaths and ignorePaths configured** — Workspace-level graph configuration. Supported at requirement level by the source/suite evidence above.
43. **Anchored workspace pattern is written against the project root** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
44. **Coderoot-relative form no longer matches** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
45. **Same pattern means the same file in global and workspace discovery** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
46. **Unanchored patterns keep matching at any depth** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
47. **Workspace testPaths and ignorePaths are project-relative** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
48. **allowedPaths are project-relative globs** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
49. **Global exclusion cannot be re-included by a workspace negation** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
50. **Workspace negation only reverses earlier workspace patterns** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
51. **Nested workspaces and the same project-relative pattern** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
52. **Code root outside the project root** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
53. **gitignore keeps absolute priority** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
54. **No migration of earlier semantics** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
55. **Project graph include paths discovered** — Project-level graph configuration. Supported at requirement level by the source/suite evidence above.
56. **Project graph exclude paths discovered** — Project-level graph configuration. Supported at requirement level by the source/suite evidence above.
57. **Project testPaths and ignorePaths configured** — Project-level graph configuration. Supported at requirement level by the source/suite evidence above.
58. **Project testPaths omitted defaults applied** — Project-level graph configuration. Supported at requirement level by the source/suite evidence above.
59. **Project-level size fields are accepted** — Project-level graph configuration. Supported at requirement level by the source/suite evidence above.
60. **An omitted limit is absent in the configuration** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
61. **Zero is accepted** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
62. **A negative limit is rejected** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
63. **A fractional limit is rejected** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
64. **A non-number limit is rejected** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
65. **A workspace value replaces the project value** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
66. **Exemptions are combined** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
67. **Negation within the list is supported** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
68. **Unknown graph keys are still rejected** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
69. **Layers merge scalars and append arrays** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
70. **Storage layout uses generic adapter bindings** — Storage configuration. Supported at requirement level by the source/suite evidence above.
71. **Legacy storage layout is normalized at load time** — Storage configuration. Supported at requirement level by the source/suite evidence above.
72. **Omitted storage section resolves to standard fs defaults** — Storage configuration. Supported at requirement level by the source/suite evidence above.
73. **Workspace selects a registered named adapter** — Named storage adapters. Supported at requirement level by the source/suite evidence above.
74. **Workspace selects an unknown adapter** — Named storage adapters. Supported at requirement level by the source/suite evidence above.
75. **specdPath defaults to repo-local .specd directory** — Config path and derived directories. Supported at requirement level by the source/suite evidence above.
76. **Explicit specdPath stays project-level** — Config path and derived directories. Supported at requirement level by the source/suite evidence above.
77. **configPath also defines change-locks directory** — Config path and derived directories. Supported at requirement level by the source/suite evidence above.
78. **Missing directories throw StorageDirectoryNotFoundError** — Config path and derived directories. Supported at requirement level by the source/suite evidence above.
79. **Archive pattern with year prefix** — Template variables. Supported at requirement level by the source/suite evidence above.
80. **Unknown template variable emits warning** — Template variables. Supported at requirement level by the source/suite evidence above.
81. **Unknown variable without callback is silent** — Template variables. Supported at requirement level by the source/suite evidence above.
82. **Plugin resolved and applied** — Schema plugins. Supported at requirement level by the source/suite evidence above.
83. **Plugin reference not found** — Schema plugins. Supported at requirement level by the source/suite evidence above.
84. **Plugin reference points to a full schema** — Schema plugins. Supported at requirement level by the source/suite evidence above.
85. **Override appends rules to an artifact** — Schema overrides. Supported at requirement level by the source/suite evidence above.
86. **Override removes a workflow hook** — Schema overrides. Supported at requirement level by the source/suite evidence above.
87. **Invalid override structure rejected at startup** — Schema overrides. Supported at requirement level by the source/suite evidence above.
88. **Flag absent — deterministic mode** — LLM optimization. Supported at requirement level by the source/suite evidence above.
89. **Flag false — deterministic mode** — LLM optimization. Supported at requirement level by the source/suite evidence above.
90. **Flag true — LLM mode** — LLM optimization. Supported at requirement level by the source/suite evidence above.
91. **Non-boolean value — startup error** — LLM optimization. Supported at requirement level by the source/suite evidence above.
92. **Plugins section with agents array** — Plugin declarations. Review CP7 for relevant branch; other branches supported.
93. **Agent plugin entry** — Plugin declarations. Review CP7 for relevant branch; other branches supported.
94. **Invalid plugin structure rejected at startup** — Plugin declarations. Review CP7 for relevant branch; other branches supported.
95. **ConfigWriter.addPlugin adds to array** — Plugin declarations. Review CP7 for relevant branch; other branches supported.
96. **ConfigWriter.addPlugin with config** — Plugin declarations. Review CP7 for relevant branch; other branches supported.
97. **ConfigWriter.removePlugin removes from array** — Plugin declarations. Review CP7 for relevant branch; other branches supported.
98. **Project-level patterns always apply** — Context spec selection. Supported at requirement level by the source/suite evidence above.
99. **Workspace-level patterns only apply when workspace is active** — Context spec selection. Supported at requirement level by the source/suite evidence above.
100. **Workspace-level patterns apply when workspace is active** — Context spec selection. Supported at requirement level by the source/suite evidence above.
101. **Qualifier omitted at workspace level resolves to that workspace** — Context spec selection. Supported at requirement level by the source/suite evidence above.
102. **Default project-level include is all default workspace specs** — Context spec selection. Supported at requirement level by the source/suite evidence above.
103. **Default workspace-level include is all specs in that workspace** — Context spec selection. Supported at requirement level by the source/suite evidence above.
104. **Resolution order — project includes, project excludes, workspace includes, workspace excludes** — Context spec selection. Supported at requirement level by the source/suite evidence above.
105. **Project-level exclude applied before workspace-level includes** — Context spec selection. Supported at requirement level by the source/suite evidence above.
106. **Project-level exclude always applied regardless of active workspace** — Context spec selection. Supported at requirement level by the source/suite evidence above.
107. **Workspace declaration order determines workspace-level priority** — Context spec selection. Supported at requirement level by the source/suite evidence above.
108. **Spec matched by multiple patterns appears once** — Context spec selection. Supported at requirement level by the source/suite evidence above.
109. **Workspace-level exclude only applied when workspace is active** — Context spec selection. Supported at requirement level by the source/suite evidence above.
110. **Workspace-level exclude qualifier resolves to that workspace** — Context spec selection. Supported at requirement level by the source/suite evidence above.
111. **Direct include path selects only that spec** — Context spec selection. Supported at requirement level by the source/suite evidence above.
112. **Direct exclude path removes only that spec** — Context spec selection. Supported at requirement level by the source/suite evidence above.
113. **Non-existent spec ID silently skipped at compile time** — Context spec selection. Supported at requirement level by the source/suite evidence above.
114. **Unmatched pattern warns in config validate** — Context spec selection. Supported at requirement level by the source/suite evidence above.
115. **Unknown workspace qualifier warns at runtime** — Context spec selection. Supported at requirement level by the source/suite evidence above.
116. **Unknown workspace qualifier fails config validate** — Context spec selection. Supported at requirement level by the source/suite evidence above.
117. **Workspace becomes active from change metadata** — Context spec selection. Supported at requirement level by the source/suite evidence above.
118. **Workspace not active when absent from change metadata** — Context spec selection. Supported at requirement level by the source/suite evidence above.
119. **Invalid pattern syntax is a startup error** — Context spec selection. Supported at requirement level by the source/suite evidence above.
120. **contextMode summary is the default** — Context mode. Supported at requirement level by the source/suite evidence above.
121. **contextMode list is accepted** — Context mode. Supported at requirement level by the source/suite evidence above.
122. **contextMode summary is accepted** — Context mode. Supported at requirement level by the source/suite evidence above.
123. **contextMode full is accepted** — Context mode. Supported at requirement level by the source/suite evidence above.
124. **contextMode hybrid is accepted** — Context mode. Supported at requirement level by the source/suite evidence above.
125. **legacy lazy value is rejected** — Context mode. Supported at requirement level by the source/suite evidence above.
126. **contextMode inside workspace is rejected** — Context mode. Supported at requirement level by the source/suite evidence above.
127. **Valid minimal config passes validation** — Startup validation. Supported at requirement level by the source/suite evidence above.
128. **Invalid contextMode value rejected** — Startup validation. Supported at requirement level by the source/suite evidence above.
129. **Legacy lazy contextMode rejected** — Startup validation. Supported at requirement level by the source/suite evidence above.
130. **contextMode in workspace entry rejected with specific message** — Startup validation. Supported at requirement level by the source/suite evidence above.
131. **artifactRules rejected at startup** — Startup validation. Supported at requirement level by the source/suite evidence above.
132. **skills field rejected at startup** — Startup validation. Supported at requirement level by the source/suite evidence above.
133. **Invalid level string** — Startup validation. Supported at requirement level by the source/suite evidence above.
134. **remove without extends is rejected** — Startup validation. Supported at requirement level by the source/suite evidence above.
135. **Invalid extends value is rejected** — Startup validation. Supported at requirement level by the source/suite evidence above.
136. **Required root field cannot be removed** — Startup validation. Supported at requirement level by the source/suite evidence above.
137. **Unknown workspace removal target is rejected** — Startup validation. Supported at requirement level by the source/suite evidence above.
138. **Explicit extends outside the active chain is skipped** — Startup validation. Supported at requirement level by the source/suite evidence above.
139. **No VCS repo — containment check skipped** — Startup validation. Supported at requirement level by the source/suite evidence above.
140. **Legacy config format emits warnings** — Legacy configuration warnings. Supported at requirement level by the source/suite evidence above.
141. **Omitted storage defaults do not emit legacy configuration warnings** — Legacy configuration warnings. Supported at requirement level by the source/suite evidence above.
142. **Warning-bearing config remains non-fatal** — Legacy configuration warnings. Supported at requirement level by the source/suite evidence above.
143. **Hosts can consume warnings from resolved config** — Legacy configuration warnings. Supported at requirement level by the source/suite evidence above.
144. **Context entries injected before spec content** — Project context instructions. Supported at requirement level by the source/suite evidence above.
145. **File reference is read and injected verbatim** — Project context instructions. Supported at requirement level by the source/suite evidence above.
146. **Context entry id is accepted for inherited removal** — Project context instructions. Supported at requirement level by the source/suite evidence above.
147. **Missing file emits a warning** — Project context instructions. Supported at requirement level by the source/suite evidence above.
148. **context absent — no effect** — Project context instructions. Supported at requirement level by the source/suite evidence above.
149. **Mixed inline and file entries preserve declaration order** — Project context instructions. Supported at requirement level by the source/suite evidence above.
150. **File path resolved relative to specd.yaml directory** — Project context instructions. Supported at requirement level by the source/suite evidence above.
151. **Absolute file path accepted** — Project context instructions. Supported at requirement level by the source/suite evidence above.
152. **Section present with all fields** — Logging configuration. Supported at requirement level by the source/suite evidence above.
153. **Section absent — defaults applied** — Logging configuration. Supported at requirement level by the source/suite evidence above.
154. **Spec approval gate disabled by default** — Approvals. Supported at requirement level by the source/suite evidence above.
155. **Signoff gate disabled by default** — Approvals. Supported at requirement level by the source/suite evidence above.
156. **Spec approval gate enabled** — Approvals. Supported at requirement level by the source/suite evidence above.
157. **Signoff approval gate enabled** — Approvals. Supported at requirement level by the source/suite evidence above.
158. **ConfigWriter port defines initProject method** — Config writer port. Supported at requirement level by the source/suite evidence above.
159. **ConfigWriter port defines addPlugin method** — Config writer port. Supported at requirement level by the source/suite evidence above.
160. **ConfigWriter port defines removePlugin method** — Config writer port. Supported at requirement level by the source/suite evidence above.
161. **ConfigWriter port defines listPlugins method** — Config writer port. Supported at requirement level by the source/suite evidence above.
162. **Workspace name with one character rejected** — Workspace names and context patterns use the shared rules. Supported at requirement level by the source/suite evidence above.
163. **Qualifier-less pattern keeps its contextual workspace** — Workspace names and context patterns use the shared rules. Supported at requirement level by the source/suite evidence above.
164. **Unknown workspace in a pattern stays a warning** — Workspace names and context patterns use the shared rules. Supported at requirement level by the source/suite evidence above.
165. **Programmatic malformed pattern fails loudly** — Workspace names and context patterns use the shared rules. Supported at requirement level by the source/suite evidence above.
166. **Context compilation supplies the contextual default** — Workspace names and context patterns use the shared rules. Supported at requirement level by the source/suite evidence above.
167. **Prefix segment violating the rule rejected** — Workspace names and context patterns use the shared rules. Supported at requirement level by the source/suite evidence above.

### core:get-persisted-spec-deps

Implementation evidence (under packages/core/src): application/use-cases/get-persisted-spec-deps.ts.

Test evidence (under packages/core/test): application/use-cases/get-persisted-spec-deps.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                            | Assessment                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| Input contract                                                         | Supported by source/area suite; see scope limits |
| Spec ID validation                                                     | Supported by source/area suite; see scope limits |
| Reads persisted state through the repository port                      | Supported by source/area suite; see scope limits |
| Result contract for an initialized spec                                | Supported by source/area suite; see scope limits |
| Result contract for a spec with no persisted state                     | Supported by source/area suite; see scope limits |
| Unknown spec fails with a typed error                                  | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveGetPersistedSpecDepsDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **specId is required** — Input contract. Supported at requirement level by the source/suite evidence above.
2. **The query never reads spec-lock.json or metadata directly** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
3. **Unresolvable spec throws SpecNotFoundError** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
4. **Only readPersistedState reads persisted data** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
5. **Reading creates no state** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
6. **Factory derives deps from the resolver** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
7. **Stored order and duplicates are returned unchanged** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
8. **Stored order is preserved without reordering or deduplication** — Result contract for an initialized spec. Supported at requirement level by the source/suite evidence above.
9. **Uninitialized spec returns an empty list without creating state** — Result contract for a spec with no persisted state. Supported at requirement level by the source/suite evidence above.
10. **Unresolvable spec identity throws instead of returning an empty result** — Unknown spec fails with a typed error. Supported at requirement level by the source/suite evidence above.
11. **Config-based factory resolves one repository per workspace via the shared helper** — Config-based factory delegates through resolveGetPersistedSpecDepsDeps. Supported at requirement level by the source/suite evidence above.
12. **Empty spec ID rejected before any repository access** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
13. **Malformed spec ID rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
14. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
15. **Bare spec ID resolved to the default workspace** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
16. **Qualified spec ID accepted unchanged** — Spec ID validation. Supported at requirement level by the source/suite evidence above.

### core:get-persisted-spec-implementation

Implementation evidence (under packages/core/src): application/use-cases/get-persisted-spec-implementation.ts.

Test evidence (under packages/core/test): application/use-cases/get-persisted-spec-implementation.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                                      | Assessment                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------ |
| Input contract                                                                   | Supported by source/area suite; see scope limits |
| Spec ID validation                                                               | Supported by source/area suite; see scope limits |
| Reads persisted state through the repository port                                | Supported by source/area suite; see scope limits |
| Result contract for an initialized spec                                          | Supported by source/area suite; see scope limits |
| Result contract for a spec with no persisted state                               | Supported by source/area suite; see scope limits |
| Unknown spec fails with a typed error                                            | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveGetPersistedSpecImplementationDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **specId is required** — Input contract. Supported at requirement level by the source/suite evidence above.
2. **The query never reads spec-lock.json or materializes metadata** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
3. **Unresolvable spec throws SpecNotFoundError** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
4. **Only readPersistedState reads persisted data** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
5. **Reading creates no state** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
6. **Factory derives deps from the resolver** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
7. **File-level and symbol-level entries are distinguished and ordered** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
8. **File-level and symbol-level links are distinguished unchanged from storage** — Result contract for an initialized spec. Supported at requirement level by the source/suite evidence above.
9. **Uninitialized spec returns an empty list without creating state** — Result contract for a spec with no persisted state. Supported at requirement level by the source/suite evidence above.
10. **Unresolvable spec identity throws SpecNotFoundError** — Unknown spec fails with a typed error. Supported at requirement level by the source/suite evidence above.
11. **Config-based factory resolves one repository per workspace via the shared helper** — Config-based factory delegates through resolveGetPersistedSpecImplementationDeps. Supported at requirement level by the source/suite evidence above.
12. **Empty spec ID rejected before any repository access** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
13. **Malformed spec ID rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
14. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
15. **Bare spec ID resolved to the default workspace** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
16. **Qualified spec ID accepted unchanged** — Spec ID validation. Supported at requirement level by the source/suite evidence above.

### core:get-persisted-spec-optimizations

Implementation evidence (under packages/core/src): application/use-cases/get-persisted-spec-optimizations.ts.

Test evidence (under packages/core/test): application/use-cases/get-persisted-spec-optimizations.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                                     | Assessment                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------ |
| Input contract                                                                  | Supported by source/area suite; see scope limits |
| Spec ID validation                                                              | Supported by source/area suite; see scope limits |
| Reads persisted state through the repository port                               | Supported by source/area suite; see scope limits |
| Result contract for a spec with no persisted state                              | Supported by source/area suite; see scope limits |
| Result contract for an initialized spec with no optimizations                   | Supported by source/area suite; see scope limits |
| Per-field freshness computation                                                 | Supported by source/area suite; see scope limits |
| Field result shape                                                              | Supported by source/area suite; see scope limits |
| Aggregate freshness                                                             | Supported by source/area suite; see scope limits |
| Unknown spec fails with a typed error                                           | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveGetPersistedSpecOptimizationsDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Field filter restricts the result to a single field** — Input contract. Supported at requirement level by the source/suite evidence above.
2. **Omitting field returns every present optimization field** — Input contract. Supported at requirement level by the source/suite evidence above.
3. **Query never materializes or reads generated metadata** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
4. **Missing field has the explicit missing shape** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
5. **Filter with both fields present** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
6. **Multiple reasons are ordered** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
7. **Unknown spec throws SpecNotFoundError** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
8. **Generated metadata is never read** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
9. **Factory derives deps from the resolver** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
10. **Uninitialized spec returns initialized false without throwing** — Result contract for a spec with no persisted state. Supported at requirement level by the source/suite evidence above.
11. **Initialized spec with no optimizations block returns an empty result** — Result contract for an initialized spec with no optimizations. Supported at requirement level by the source/suite evidence above.
12. **Requested field absent from persisted optimizations is reported as missing** — Result contract for an initialized spec with no optimizations. Supported at requirement level by the source/suite evidence above.
13. **Artifact added since baseline marks the field stale** — Per-field freshness computation. Supported at requirement level by the source/suite evidence above.
14. **Artifact removed since baseline marks the field stale** — Per-field freshness computation. Supported at requirement level by the source/suite evidence above.
15. **Changed content hash marks the field stale** — Per-field freshness computation. Supported at requirement level by the source/suite evidence above.
16. **lastModified-only difference is diagnostic and does not affect freshness** — Per-field freshness computation. Supported at requirement level by the source/suite evidence above.
17. **Schema change marks the field stale even when every artifact hash matches** — Per-field freshness computation. Supported at requirement level by the source/suite evidence above.
18. **Stale field reports value, freshness, and an ordered reasons list** — Field result shape. Supported at requirement level by the source/suite evidence above.
19. **Fresh field has an empty reasons list** — Field result shape. Supported at requirement level by the source/suite evidence above.
20. **Aggregate is fresh only when every present field is fresh** — Aggregate freshness. Supported at requirement level by the source/suite evidence above.
21. **Aggregate reflects only the requested field when filtered** — Aggregate freshness. Supported at requirement level by the source/suite evidence above.
22. **No optimization fields present yields aggregate fresh false** — Aggregate freshness. Supported at requirement level by the source/suite evidence above.
23. **Unresolvable spec identity throws SpecNotFoundError** — Unknown spec fails with a typed error. Supported at requirement level by the source/suite evidence above.
24. **createGetPersistedSpecOptimizations config form derives deps through the resolver** — Config-based factory delegates through resolveGetPersistedSpecOptimizationsDeps. Supported at requirement level by the source/suite evidence above.
25. **Empty spec ID rejected before any repository access** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
26. **Malformed spec ID rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
27. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
28. **Bare spec ID resolved to the default workspace** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
29. **Qualified spec ID accepted unchanged** — Spec ID validation. Supported at requirement level by the source/suite evidence above.

### core:get-persisted-spec-schema

Implementation evidence (under packages/core/src): application/use-cases/get-persisted-spec-schema.ts.

Test evidence (under packages/core/test): application/use-cases/get-persisted-spec-schema.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                              | Assessment                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------ |
| Input contract                                                           | Supported by source/area suite; see scope limits |
| Spec ID validation                                                       | Supported by source/area suite; see scope limits |
| Reads persisted state through the repository port                        | Supported by source/area suite; see scope limits |
| Requires an initialized spec                                             | Supported by source/area suite; see scope limits |
| Result contract                                                          | Supported by source/area suite; see scope limits |
| Unknown spec fails with a typed error                                    | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveGetPersistedSpecSchemaDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **specId is the only input consulted** — Input contract. Supported at requirement level by the source/suite evidence above.
2. **Query never reads spec-lock.json directly or materializes metadata** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
3. **Unresolvable spec throws SpecNotFoundError** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
4. **Only readPersistedState reads persisted data** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
5. **Reading creates no state** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
6. **Factory derives deps from the resolver** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
7. **Unknown spec fails before the initialization check** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
8. **Persisted schema identity is returned exactly** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
9. **Uninitialized spec throws SpecNotInitializedError** — Requires an initialized spec. Supported at requirement level by the source/suite evidence above.
10. **Result returns the exact persisted schema identity** — Result contract. Supported at requirement level by the source/suite evidence above.
11. **Unknown spec throws SpecNotFoundError before the initialization check** — Unknown spec fails with a typed error. Supported at requirement level by the source/suite evidence above.
12. **createGetPersistedSpecSchema config form derives deps through the resolver** — Config-based factory delegates through resolveGetPersistedSpecSchemaDeps. Supported at requirement level by the source/suite evidence above.
13. **Empty spec ID rejected before any repository access** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
14. **Malformed spec ID rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
15. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
16. **Bare spec ID resolved to the default workspace** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
17. **Qualified spec ID accepted unchanged** — Spec ID validation. Supported at requirement level by the source/suite evidence above.

### core:update-persisted-spec-implementation

Implementation evidence (under packages/core/src): application/use-cases/update-persisted-spec-implementation.ts.

Test evidence (under packages/core/test): application/use-cases/update-persisted-spec-implementation.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                                         | Assessment                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| Input contract                                                                      | Supported by source/area suite; see scope limits |
| Spec ID validation                                                                  | Supported by source/area suite; see scope limits |
| File must exist for add                                                             | Supported by source/area suite; see scope limits |
| Canonical file identity and workspace confinement                                   | Supported by source/area suite; see scope limits |
| Add creates or enriches a canonical link                                            | Supported by source/area suite; see scope limits |
| Remove removes canonical links                                                      | Supported by source/area suite; see scope limits |
| Add creates missing persisted state                                                 | Supported by source/area suite; see scope limits |
| Remove against missing state is a no-op                                             | Supported by source/area suite; see scope limits |
| Applying the mutation through the shared patch helper                               | Supported by source/area suite; see scope limits |
| Conflict handling                                                                   | Supported by source/area suite; see scope limits |
| Unknown spec fails with a typed error                                               | Supported by source/area suite; see scope limits |
| Result contract                                                                     | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveUpdatePersistedSpecImplementationDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **action must be add or remove** — Input contract. Supported at requirement level by the source/suite evidence above.
2. **Adding a link for a non-existent file fails without mutating state** — File must exist for add. Supported at requirement level by the source/suite evidence above.
3. **Path outside the workspace codeRoot fails instead of being coerced** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
4. **Nested path is normalized to a forward-slash canonical identity** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
5. **Absolute path outside the codeRoot rejected** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
6. **Parent traversal rejected** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
7. **Sibling directory sharing the codeRoot prefix rejected** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
8. **Qualified path leaving the codeRoot rejected** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
9. **Qualified path naming another workspace rejected** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
10. **Windows drive path is not a workspace qualifier** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
11. **Nested path is stored forward-slashed** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
12. **Add symbols to a file-level link keeps the file-level entry** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
13. **Add without symbols keeps symbol entries** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
14. **Remove symbols, last symbol, and whole entry** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
15. **Add against missing state creates it from the resolved base** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
16. **Remove against missing state is a no-op** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
17. **Expected revision and conflict** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
18. **Unknown spec and readOnly workspace** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
19. **Factory resolves collaborators** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
20. **Adding symbols to an existing file-level link preserves previously recorded symbols** — Add creates or enriches a canonical link. Supported at requirement level by the source/suite evidence above.
21. **Adding without symbols does not alter existing symbol-level entries** — Add creates or enriches a canonical link. Supported at requirement level by the source/suite evidence above.
22. **Removing specific symbols leaves other symbols intact** — Remove removes canonical links. Supported at requirement level by the source/suite evidence above.
23. **Removing the last symbol may remove the entry entirely when no separate file-level link exists** — Remove removes canonical links. Supported at requirement level by the source/suite evidence above.
24. **Removing without symbols removes the whole entry including symbol refinements** — Remove removes canonical links. Supported at requirement level by the source/suite evidence above.
25. **add against a lock-less spec derives an initial base with empty implementation** — Add creates missing persisted state. Supported at requirement level by the source/suite evidence above.
26. **remove against a lock-less spec does not create state** — Remove against missing state is a no-op. Supported at requirement level by the source/suite evidence above.
27. **Only the computed implementation array is patched** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
28. **Stale expectedRevision produces ArtifactConflictError without retry** — Conflict handling. Supported at requirement level by the source/suite evidence above.
29. **Unresolvable spec identity throws SpecNotFoundError** — Unknown spec fails with a typed error. Supported at requirement level by the source/suite evidence above.
30. **created is true only when persisted state was newly created** — Result contract. Supported at requirement level by the source/suite evidence above.
31. **Config-based factory resolves the file reader, workspace lookup, and initializePersistedSpecState collaborator** — Config-based factory delegates through resolveUpdatePersistedSpecImplementationDeps. Supported at requirement level by the source/suite evidence above.
32. **Empty spec ID rejected before any repository access** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
33. **Malformed spec ID rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
34. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
35. **Bare spec ID resolved to the default workspace** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
36. **Qualified spec ID accepted unchanged** — Spec ID validation. Supported at requirement level by the source/suite evidence above.

### core:update-persisted-spec-optimizations

Implementation evidence (under packages/core/src): application/use-cases/update-persisted-spec-optimizations.ts.

Test evidence (under packages/core/test): application/use-cases/update-persisted-spec-optimizations.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                                        | Assessment                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| Input contract                                                                     | Supported by source/area suite; see scope limits |
| Spec ID validation                                                                 | Supported by source/area suite; see scope limits |
| Mutual exclusivity and minimum operation                                           | Supported by source/area suite; see scope limits |
| Set captures a fresh baseline per changed field                                    | Supported by source/area suite; see scope limits |
| Set creates missing persisted state                                                | Supported by source/area suite; see scope limits |
| Clear removes selected fields                                                      | Supported by source/area suite; see scope limits |
| Clear against missing persisted state is a no-op                                   | Supported by source/area suite; see scope limits |
| Applying the mutation through the shared patch helper                              | Supported by source/area suite; see scope limits |
| Conflict handling                                                                  | Supported by source/area suite; see scope limits |
| Unknown spec fails with a typed error                                              | Supported by source/area suite; see scope limits |
| Result contract                                                                    | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveUpdatePersistedSpecOptimizationsDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Set with a single field updates only that field** — Input contract. Supported at requirement level by the source/suite evidence above.
2. **Clear with multiple field names removes every listed field** — Input contract. Supported at requirement level by the source/suite evidence above.
3. **Strict input validation rejects malformed untyped set payloads before I/O** — Input contract. Supported at requirement level by the source/suite evidence above.
4. **Strict input validation rejects malformed untyped clear payloads before I/O** — Input contract. Supported at requirement level by the source/suite evidence above.
5. **Providing both set and clear throws InvalidInputError** — Mutual exclusivity and minimum operation. Supported at requirement level by the source/suite evidence above.
6. **Neither set nor clear throws InvalidInputError** — Mutual exclusivity and minimum operation. Supported at requirement level by the source/suite evidence above.
7. **Empty set object throws InvalidInputError** — Mutual exclusivity and minimum operation. Supported at requirement level by the source/suite evidence above.
8. **Empty clear array throws InvalidInputError** — Mutual exclusivity and minimum operation. Supported at requirement level by the source/suite evidence above.
9. **Changed field receives a freshly captured artifactState baseline** — Set captures a fresh baseline per changed field. Supported at requirement level by the source/suite evidence above.
10. **Unchanged field retains its previous value and baseline** — Set captures a fresh baseline per changed field. Supported at requirement level by the source/suite evidence above.
11. **Recorded schema uses the current persisted schema when state already exists** — Set captures a fresh baseline per changed field. Supported at requirement level by the source/suite evidence above.
12. **Recorded schema uses the effective project schema when creating state** — Set captures a fresh baseline per changed field. Supported at requirement level by the source/suite evidence above.
13. **First set call creates persisted state via resolveInitialPersistedDependsOn** — Set creates missing persisted state. Supported at requirement level by the source/suite evidence above.
14. **Clearing an existing field removes only that field from the written state** — Clear removes selected fields. Supported at requirement level by the source/suite evidence above.
15. **Clearing an already-absent field preserves the written state** — Clear removes selected fields. Supported at requirement level by the source/suite evidence above.
16. **Clearing the last remaining field omits the optimization block from the written state** — Clear removes selected fields. Supported at requirement level by the source/suite evidence above.
17. **Repository round trip preserves partial and final clear removals** — Clear removes selected fields. Supported at requirement level by the source/suite evidence above.
18. **Clear on an uninitialized spec never creates persisted state** — Clear against missing persisted state is a no-op. Supported at requirement level by the source/suite evidence above.
19. **Write uses the observed originalHash as expectedRevision** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
20. **Write uses a null expectedRevision when creating state** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
21. **Missing specId is an input-shape error** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
22. **Empty specId is a spec ID error, not an input-shape error** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
23. **Strict input matrix** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
24. **Set captures a fresh baseline per changed field** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
25. **Created state records the effective project schema** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
26. **Conflict, unknown spec, and readOnly** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
27. **Result flags and omitted block** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
28. **Real repository round trip** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
29. **Revision mismatch at write time propagates ArtifactConflictError** — Conflict handling. Supported at requirement level by the source/suite evidence above.
30. **Unresolvable spec identity throws SpecNotFoundError** — Unknown spec fails with a typed error. Supported at requirement level by the source/suite evidence above.
31. **Result reports created true only when state was newly created** — Result contract. Supported at requirement level by the source/suite evidence above.
32. **Result reports created false for an already-initialized spec** — Result contract. Supported at requirement level by the source/suite evidence above.
33. **Result omits optimizations when none remain after a clear** — Result contract. Supported at requirement level by the source/suite evidence above.
34. **Config factory derives exact dependencies through the resolver** — Config-based factory delegates through resolveUpdatePersistedSpecOptimizationsDeps. Supported at requirement level by the source/suite evidence above.
35. **Initial state creation remains behind the shared service** — Config-based factory delegates through resolveUpdatePersistedSpecOptimizationsDeps. Supported at requirement level by the source/suite evidence above.
36. **Empty spec ID rejected before any repository access** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
37. **Malformed spec ID rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
38. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
39. **Bare spec ID resolved to the default workspace** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
40. **Qualified spec ID accepted unchanged** — Spec ID validation. Supported at requirement level by the source/suite evidence above.

### core:update-persisted-spec-schema

Implementation evidence (under packages/core/src): application/use-cases/update-persisted-spec-schema.ts.

Test evidence (under packages/core/test): application/use-cases/update-persisted-spec-schema.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                                   | Assessment                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------------ |
| Input contract                                                                | Supported by source/area suite; see scope limits |
| Spec ID validation                                                            | Supported by source/area suite; see scope limits |
| Requires an existing lock; never creates one                                  | Supported by source/area suite; see scope limits |
| Unknown spec fails with a typed error                                         | Supported by source/area suite; see scope limits |
| Resolving the target schema                                                   | Supported by source/area suite; see scope limits |
| Loading and parsing declared artifacts under the target schema                | Review CP8                                       |
| Selecting the already-persisted schema is a no-op                             | Supported by source/area suite; see scope limits |
| Dependency compatibility when the target schema does not extract dependencies | Supported by source/area suite; see scope limits |
| Dependency compatibility when the target schema extracts dependencies         | Supported by source/area suite; see scope limits |
| Implementation and optimization values are preserved verbatim                 | Supported by source/area suite; see scope limits |
| Constructing and writing the reassigned state                                 | Supported by source/area suite; see scope limits |
| Conflict handling                                                             | Supported by source/area suite; see scope limits |
| Result contract                                                               | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveUpdatePersistedSpecSchemaDeps   | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **schemaRef is always explicit, unlike initialization** — Input contract. Supported at requirement level by the source/suite evidence above.
2. **Uninitialized spec throws SpecNotInitializedError** — Requires an existing lock; never creates one. Supported at requirement level by the source/suite evidence above.
3. **Never delegates to InitializePersistedSpecState or initial-base construction** — Requires an existing lock; never creates one. Supported at requirement level by the source/suite evidence above.
4. **Unknown spec throws SpecNotFoundError before the initialization check** — Unknown spec fails with a typed error. Supported at requirement level by the source/suite evidence above.
5. **Target schema is resolved in ref mode without project overrides** — Resolving the target schema. Supported at requirement level by the source/suite evidence above.
6. **Parse failure under the target schema aborts without mutation** — Loading and parsing declared artifacts under the target schema. Review CP8 for relevant branch; other branches supported.
7. **Target schema equals the currently persisted schema** — Selecting the already-persisted schema is a no-op. Supported at requirement level by the source/suite evidence above.
8. **Current dependsOn is preserved unchanged** — Dependency compatibility when the target schema does not extract dependencies. Supported at requirement level by the source/suite evidence above.
9. **Extracted dependencies equal to the current list allow reassignment to proceed** — Dependency compatibility when the target schema extracts dependencies. Supported at requirement level by the source/suite evidence above.
10. **Extracted dependencies differing from the current list throw a conflict error** — Dependency compatibility when the target schema extracts dependencies. Supported at requirement level by the source/suite evidence above.
11. **Implementation links and optimizations survive reassignment unchanged** — Implementation and optimization values are preserved verbatim. Supported at requirement level by the source/suite evidence above.
12. **A successful reassignment makes existing optimizations stale via freshness computation, not special-casing** — Implementation and optimization values are preserved verbatim. Supported at requirement level by the source/suite evidence above.
13. **Complete state is constructed directly, bypassing applyPersistedSpecStatePatch for the schema field** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
14. **Write uses the originalHash observed by the initial read as expectedRevision** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
15. **Reassignment succeeds and preserves other state** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
16. **Same schema is a no-op** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
17. **Target schema resolved in ref mode** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
18. **Parse failure aborts without mutation, even without dependency extraction** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
19. **Dependencies preserved when the target does not extract them** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
20. **Extracted dependencies equal the current ones** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
21. **Extracted dependencies differ** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
22. **Optimizations become stale after reassignment** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
23. **Revision, conflict, unknown spec, and readOnly** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
24. **Factory resolves collaborators** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
25. **Revision mismatch at write time propagates ArtifactConflictError** — Conflict handling. Supported at requirement level by the source/suite evidence above.
26. **Successful reassignment reports changed true with the new schema and dependsOn** — Result contract. Supported at requirement level by the source/suite evidence above.
27. **createUpdatePersistedSpecSchema config form derives deps through the resolver** — Config-based factory delegates through resolveUpdatePersistedSpecSchemaDeps. Supported at requirement level by the source/suite evidence above.
28. **Empty spec ID rejected before any repository access** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
29. **Malformed spec ID rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
30. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
31. **Bare spec ID resolved to the default workspace** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
32. **Qualified spec ID accepted unchanged** — Spec ID validation. Supported at requirement level by the source/suite evidence above.

### core:spec-metadata

Implementation evidence (under packages/core/src): domain/services/parse-metadata.ts; application/use-cases/generate-spec-metadata.ts; application/use-cases/materialize-spec-metadata.ts; application/use-cases/persist-spec-metadata.ts; infrastructure/fs/spec-repository.ts.

Test evidence (under packages/core/test): domain/services/parse-metadata.spec.ts; application/use-cases/generate-spec-metadata.spec.ts; application/use-cases/materialize-spec-metadata.spec.ts; application/use-cases/archive-change.spec.ts; infrastructure/fs/spec-repository.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                 | Assessment                                       |
| ------------------------------------------- | ------------------------------------------------ |
| File location and naming                    | Supported by source/area suite; see scope limits |
| Sidecar separation                          | Supported by source/area suite; see scope limits |
| Spec.generatedMetadataStamp is a stamp only | Supported by source/area suite; see scope limits |
| File format                                 | Supported by source/area suite; see scope limits |
| Source provenance                           | Review CP5                                       |
| Structural validation before persistence    | Supported by source/area suite; see scope limits |
| Deterministic generation at archive time    | Supported by source/area suite; see scope limits |
| Freshness assessment is application-owned   | Supported by source/area suite; see scope limits |
| Use by CompileContext                       | Supported by source/area suite; see scope limits |
| Version control                             | Supported by source/area suite; see scope limits |
| Implementation projection                   | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Metadata file present** — File location and naming. Supported at requirement level by the source/suite evidence above.
2. **Metadata file absent** — File location and naming. Supported at requirement level by the source/suite evidence above.
3. **Workspace without prefix stores metadata correctly** — File location and naming. Supported at requirement level by the source/suite evidence above.
4. **Workspace with prefix stores metadata correctly** — File location and naming. Supported at requirement level by the source/suite evidence above.
5. **Explicit metadataPath in workspace config** — File location and naming. Supported at requirement level by the source/suite evidence above.
6. **Auto-derived metadataPath from VCS root** — File location and naming. Supported at requirement level by the source/suite evidence above.
7. **NullVcsAdapter fallback for metadataPath** — File location and naming. Supported at requirement level by the source/suite evidence above.
8. **Valid metadata file with all fields** — File format. Supported at requirement level by the source/suite evidence above.
9. **Title absent — fallback to path** — File format. Supported at requirement level by the source/suite evidence above.
10. **Valid metadata file with only dependsOn** — File format. Supported at requirement level by the source/suite evidence above.
11. **Empty dependsOn** — File format. Supported at requirement level by the source/suite evidence above.
12. **Cross-workspace dependency** — File format. Supported at requirement level by the source/suite evidence above.
13. **Unqualified path resolves to same workspace** — File format. Supported at requirement level by the source/suite evidence above.
14. **Generated metadata includes provenance** — File format. Supported at requirement level by the source/suite evidence above.
15. **optimizedDescription is omitted when its lock baseline is stale** — File format. Supported at requirement level by the source/suite evidence above.
16. **generatedBy is always core for newly generated documents** — File format. Supported at requirement level by the source/suite evidence above.
17. **Provenance records per-artifact hash and diagnostic lastModified** — Source provenance. Review CP4 for relevant branch; other branches supported.
18. **Provenance records persistedStateHash or null when lock absent** — Source provenance. Review CP4 for relevant branch; other branches supported.
19. **Provenance records schema identity, projection version, and projection fingerprint** — Source provenance. Review CP4 for relevant branch; other branches supported.
20. **contentHashes remains derivable from provenance.artifacts** — Source provenance. Review CP4 for relevant branch; other branches supported.
21. **lastModified alone is diagnostic, not a freshness input** — Source provenance. Review CP4 for relevant branch; other branches supported.
22. **Valid metadata accepted** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
23. **Missing title rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
24. **Missing description rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
25. **Invalid keywords rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
26. **Invalid dependsOn format rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
27. **Invalid contentHashes format rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
28. **Invalid rules structure rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
29. **Invalid scenarios structure rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
30. **Unknown top-level keys allowed** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
31. **Empty content rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
32. **Read path remains lenient** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
33. **Schema supports optimized fields and provenance** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
34. **Bare dependsOn entry rejected on persistence** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
35. **Empty dependsOn entry rejected on persistence** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
36. **Malformed dependsOn entry rejected and quoted** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
37. **Bare implementation symbol specId rejected on persistence** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
38. **Keywords, hashes, and scenarios follow the documented formats** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
39. **Existing metadata with a bare entry still reads** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
40. **Metadata generated after archive** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
41. **Manifest dependsOn takes priority over extracted** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
42. **Pre-publication extraction checks final persisted dependsOn during full-batch preflight** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
43. **Metadata-related failure in one spec blocks publication of earlier specs** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
44. **Omitted extraction falls back to the final persisted dependency set** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
45. **Legacy spec may still derive metadata dependsOn from extraction** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
46. **Mismatched extracted dependsOn blocks archive before any batch publication starts** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
47. **Generation failure does not block archive** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
48. **Metadata and sidecar live in different storage locations** — Sidecar separation. Supported at requirement level by the source/suite evidence above.
49. **Legacy spec may have metadata without sidecar** — Sidecar separation. Supported at requirement level by the source/suite evidence above.
50. **get stamp does not replace metadata()** — Spec.generatedMetadataStamp is a stamp only. Supported at requirement level by the source/suite evidence above.
51. **Stamp absence does not imply empty metadata document** — Spec.generatedMetadataStamp is a stamp only. Supported at requirement level by the source/suite evidence above.
52. **Metadata projects archived implementation links from spec-lock** — Implementation projection. Supported at requirement level by the source/suite evidence above.
53. **Content hash mismatch marks metadata stale** — Freshness assessment is application-owned. Supported at requirement level by the source/suite evidence above.
54. **persistedStateHash transition to or from absence marks metadata stale** — Freshness assessment is application-owned. Supported at requirement level by the source/suite evidence above.
55. **Schema identity change marks metadata stale** — Freshness assessment is application-owned. Supported at requirement level by the source/suite evidence above.
56. **Projection version or fingerprint change marks metadata stale** — Freshness assessment is application-owned. Supported at requirement level by the source/suite evidence above.
57. **lastModified alone does not cause staleness** — Freshness assessment is application-owned. Supported at requirement level by the source/suite evidence above.
58. **Repository never classifies freshness** — Freshness assessment is application-owned. Supported at requirement level by the source/suite evidence above.
59. **Freshness comparison is used only by MaterializeSpecMetadata** — Freshness assessment is application-owned. Supported at requirement level by the source/suite evidence above.
60. **dependsOn adds context beyond excludes** — Use by CompileContext. Supported at requirement level by the source/suite evidence above.
61. **Transitive traversal** — Use by CompileContext. Supported at requirement level by the source/suite evidence above.
62. **Canonical metadata dependency projection works without extraction** — Use by CompileContext. Supported at requirement level by the source/suite evidence above.
63. **Materialization returns a confirmed-fresh or just-regenerated value** — Use by CompileContext. Supported at requirement level by the source/suite evidence above.
64. **readMetadataSnapshot is not used by ordinary consumers for freshness decisions** — Use by CompileContext. Supported at requirement level by the source/suite evidence above.
65. **Missing spec in dependsOn skipped with warning** — Use by CompileContext. Supported at requirement level by the source/suite evidence above.
66. **Cycle in dependsOn broken with warning** — Use by CompileContext. Supported at requirement level by the source/suite evidence above.
67. **New project gitignores the metadata cache directory** — Version control. Supported at requirement level by the source/suite evidence above.
68. **Rooted ignore entry does not affect similarly named nested directories** — Version control. Supported at requirement level by the source/suite evidence above.
69. **Existing tracked metadata is not automatically untracked** — Version control. Supported at requirement level by the source/suite evidence above.
70. **Custom metadataPath is the operator's responsibility** — Version control. Supported at requirement level by the source/suite evidence above.
71. **Implementation files projected into metadata** — Version control. Supported at requirement level by the source/suite evidence above.
72. **Implementation symbols projected into metadata** — Version control. Supported at requirement level by the source/suite evidence above.
73. **Semantic repository source prioritized** — Version control. Supported at requirement level by the source/suite evidence above.

### core:config-loader

Implementation evidence (under packages/core/src): infrastructure/fs/config-loader.ts; infrastructure/fs/config-cascade.ts; application/ports/config-schema.ts.

Test evidence (under packages/core/test): infrastructure/fs/config-loader.spec.ts; application/ports/config-schema.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                    | Assessment                                       |
| -------------------------------------------------------------- | ------------------------------------------------ |
| Factory signature and return type                              | Supported by source/area suite; see scope limits |
| Path probe                                                     | Review CP7                                       |
| Discovery mode                                                 | Supported by source/area suite; see scope limits |
| Forced mode                                                    | Supported by source/area suite; see scope limits |
| Layer merge semantics                                          | Supported by source/area suite; see scope limits |
| Native environment file support                                | Supported by source/area suite; see scope limits |
| YAML parsing and structural validation                         | Supported by source/area suite; see scope limits |
| Default workspace is required                                  | Supported by source/area suite; see scope limits |
| Workspace names use the shared rule                            | Supported by source/area suite; see scope limits |
| Path resolution relative to config directory                   | Supported by source/area suite; see scope limits |
| Storage path containment                                       | Supported by source/area suite; see scope limits |
| isExternal inference for workspaces                            | Supported by source/area suite; see scope limits |
| Config file stays inside the repository root                   | Supported by source/area suite; see scope limits |
| Default values for workspace fields                            | Supported by source/area suite; see scope limits |
| Graph size limit fields                                        | Supported by source/area suite; see scope limits |
| contextIncludeSpecs and contextExcludeSpecs pattern validation | Supported by source/area suite; see scope limits |
| Schema plugins, schema overrides, and context entry mapping    | Supported by source/area suite; see scope limits |
| Approvals default to false                                     | Supported by source/area suite; see scope limits |
| All errors are ConfigValidationError                           | Review CP7                                       |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Factory returns a ConfigLoader** — Factory signature and return type. Supported at requirement level by the source/suite evidence above.
2. **startDir preserves discovery semantics for host-selected roots** — Factory signature and return type. Supported at requirement level by the source/suite evidence above.
3. **Discovery mode returns resolved chain root path** — Path probe. Review CP7 for relevant branch; other branches supported.
4. **Discovery mode returns null when no config found** — Path probe. Review CP7 for relevant branch; other branches supported.
5. **Discovery mode can return a shared root even when later local layers will attach** — Path probe. Review CP7 for relevant branch; other branches supported.
6. **Forced mode returns resolved absolute path without existence check** — Path probe. Review CP7 for relevant branch; other branches supported.
7. **resolvePath never throws** — Path probe. Review CP7 for relevant branch; other branches supported.
8. **Config found in startDir** — Discovery mode. Supported at requirement level by the source/suite evidence above.
9. **Config found in ancestor directory** — Discovery mode. Supported at requirement level by the source/suite evidence above.
10. **Explicit-base variant is skipped when base is inactive** — Discovery mode. Supported at requirement level by the source/suite evidence above.
11. **Standalone local file resets the chain** — Discovery mode. Supported at requirement level by the source/suite evidence above.
12. **Walk stops at VCS root** — Discovery mode. Supported at requirement level by the source/suite evidence above.
13. **No VCS repo — checks only startDir** — Discovery mode. Supported at requirement level by the source/suite evidence above.
14. **No config file found** — Discovery mode. Supported at requirement level by the source/suite evidence above.
15. **Forced path loads exact entrypoint chain** — Forced mode. Supported at requirement level by the source/suite evidence above.
16. **Forced path resolves relative path** — Forced mode. Supported at requirement level by the source/suite evidence above.
17. **Forced path file not found** — Forced mode. Supported at requirement level by the source/suite evidence above.
18. **Forced mode extends target not found** — Forced mode. Supported at requirement level by the source/suite evidence above.
19. **Forced mode extends true without base file** — Forced mode. Supported at requirement level by the source/suite evidence above.
20. **Later scalar overrides earlier scalar** — Layer merge semantics. Supported at requirement level by the source/suite evidence above.
21. **Object keys deep-merge by path** — Layer merge semantics. Supported at requirement level by the source/suite evidence above.
22. **Inherited arrays append by default** — Layer merge semantics. Supported at requirement level by the source/suite evidence above.
23. **Array removal deletes inherited context by id** — Layer merge semantics. Supported at requirement level by the source/suite evidence above.
24. **Standalone layer discards earlier inherited state** — Layer merge semantics. Supported at requirement level by the source/suite evidence above.
25. **.env.local takes precedence over .env** — Native environment file support. Supported at requirement level by the source/suite evidence above.
26. **Invalid YAML syntax** — YAML parsing and structural validation. Supported at requirement level by the source/suite evidence above.
27. **Missing required field** — YAML parsing and structural validation. Supported at requirement level by the source/suite evidence above.
28. **Invalid adapter value** — YAML parsing and structural validation. Supported at requirement level by the source/suite evidence above.
29. **Validation precedes path resolution** — YAML parsing and structural validation. Supported at requirement level by the source/suite evidence above.
30. **Missing default workspace** — Default workspace is required. Supported at requirement level by the source/suite evidence above.
31. **Relative spec path resolved from config directory** — Path resolution relative to config directory. Supported at requirement level by the source/suite evidence above.
32. **Storage paths resolved from config directory** — Path resolution relative to config directory. Supported at requirement level by the source/suite evidence above.
33. **Explicit metadataPath resolved from config directory** — Path resolution relative to config directory. Supported at requirement level by the source/suite evidence above.
34. **Absent metadataPath auto-derived from VCS root** — Path resolution relative to config directory. Supported at requirement level by the source/suite evidence above.
35. **Absent metadataPath with NullVcsAdapter fallback** — Path resolution relative to config directory. Supported at requirement level by the source/suite evidence above.
36. **Storage path outside VCS root** — Storage path containment. Supported at requirement level by the source/suite evidence above.
37. **Storage path at VCS root is valid** — Storage path containment. Supported at requirement level by the source/suite evidence above.
38. **No VCS repo — containment check skipped** — Storage path containment. Supported at requirement level by the source/suite evidence above.
39. **Drive-letter case does not push storage outside the root** — Storage path containment. Supported at requirement level by the source/suite evidence above.
40. **A longer prefix is still outside** — Storage path containment. Supported at requirement level by the source/suite evidence above.
41. **A non-fs storage binding skips the inside-root check** — Storage path containment. Supported at requirement level by the source/suite evidence above.
42. **Workspace specsPath inside VCS root** — isExternal inference for workspaces. Supported at requirement level by the source/suite evidence above.
43. **Workspace specsPath outside VCS root** — isExternal inference for workspaces. Supported at requirement level by the source/suite evidence above.
44. **No VCS repo — all workspaces are not external** — isExternal inference for workspaces. Supported at requirement level by the source/suite evidence above.
45. **Specs inside the root are not external** — isExternal inference for workspaces. Supported at requirement level by the source/suite evidence above.
46. **A non-fs specs adapter is not external** — isExternal inference for workspaces. Supported at requirement level by the source/suite evidence above.
47. **Default workspace ownership defaults to owned** — Default values for workspace fields. Supported at requirement level by the source/suite evidence above.
48. **Non-default workspace ownership defaults to readOnly** — Default values for workspace fields. Supported at requirement level by the source/suite evidence above.
49. **Default workspace codeRoot defaults to config directory** — Default values for workspace fields. Supported at requirement level by the source/suite evidence above.
50. **Non-default workspace missing codeRoot** — Default values for workspace fields. Supported at requirement level by the source/suite evidence above.
51. **Default workspace schemasPath defaults when omitted** — Default values for workspace fields. Supported at requirement level by the source/suite evidence above.
52. **Non-default workspace schemasPath is null when omitted** — Default values for workspace fields. Supported at requirement level by the source/suite evidence above.
53. **Declared values are exposed exactly** — Graph size limit fields. Supported at requirement level by the source/suite evidence above.
54. **Undeclared values are not defaulted** — Graph size limit fields. Supported at requirement level by the source/suite evidence above.
55. **An invalid limit names the key and its location** — Graph size limit fields. Supported at requirement level by the source/suite evidence above.
56. **Layer merge applies unchanged** — Graph size limit fields. Supported at requirement level by the source/suite evidence above.
57. **Unknown keys remain rejected** — Graph size limit fields. Supported at requirement level by the source/suite evidence above.
58. **Valid bare wildcard** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
59. **Valid qualified wildcard** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
60. **Valid prefix wildcard** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
61. **Wildcard in disallowed position** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
62. **Invalid workspace qualifier** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
63. **Workspace-level patterns are also validated** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
64. **Pattern with an uppercase segment rejected** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
65. **Segment with a leading digit accepted** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
66. **One-character workspace qualifier rejected** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
67. **Loader keeps no private copy of the expressions** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
68. **Context entry with id is preserved** — Schema plugins, schema overrides, and context entry mapping. Supported at requirement level by the source/suite evidence above.
69. **Agent plugin identity is name** — Schema plugins, schema overrides, and context entry mapping. Supported at requirement level by the source/suite evidence above.
70. **Approvals section absent** — Approvals default to false. Supported at requirement level by the source/suite evidence above.
71. **Partial approvals section** — Approvals default to false. Supported at requirement level by the source/suite evidence above.
72. **All validation errors use ConfigValidationError** — All errors are ConfigValidationError. Review CP7 for relevant branch; other branches supported.
73. **Invalid cascade chain still uses ConfigValidationError** — All errors are ConfigValidationError. Review CP7 for relevant branch; other branches supported.
74. **Git-style separators do not reject an inside config** — Config file stays inside the repository root. Supported at requirement level by the source/suite evidence above.
75. **A config outside the root is rejected** — Config file stays inside the repository root. Supported at requirement level by the source/suite evidence above.
76. **Invalid workspace name rejected** — Workspace names use the shared rule. Supported at requirement level by the source/suite evidence above.
77. **Two-character workspace name accepted** — Workspace names use the shared rule. Supported at requirement level by the source/suite evidence above.
78. **Device name rejected** — Workspace names use the shared rule. Supported at requirement level by the source/suite evidence above.

### core:spec-repository-port

Implementation evidence (under packages/core/src): application/ports/spec-repository.ts; infrastructure/fs/spec-repository.ts.

Test evidence (under packages/core/test): infrastructure/fs/spec-repository.spec.ts; application/ports/spec-repository.spec.ts; domain/services/parse-spec-lock.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                       | Assessment                                       |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| Inheritance from Repository base                                  | Supported by source/area suite; see scope limits |
| Workspace scoping                                                 | Supported by source/area suite; see scope limits |
| get returns a Spec or null                                        | Supported by source/area suite; see scope limits |
| list returns spec metadata with optional prefix filter            | Supported by source/area suite; see scope limits |
| SpecListEntry port shape                                          | Supported by source/area suite; see scope limits |
| artifact loads a single artifact file                             | Supported by source/area suite; see scope limits |
| Spec artifact access is limited to expected artifact files        | Supported by source/area suite; see scope limits |
| Spec artifact path confinement                                    | Supported by source/area suite; see scope limits |
| Spec artifact resolution debug logging                            | Supported by source/area suite; see scope limits |
| save persists a single artifact with conflict detection           | Supported by source/area suite; see scope limits |
| delete removes the entire spec directory                          | Supported by source/area suite; see scope limits |
| resolveFromPath resolves storage paths to spec identity           | Supported by source/area suite; see scope limits |
| readMetadataSnapshot and writeMetadataSnapshot                    | Supported by source/area suite; see scope limits |
| Aggregate persisted state, Meta observations, and specFingerprint | Supported by source/area suite; see scope limits |
| readPersistedState lenient dependsOn option                       | Supported by source/area suite; see scope limits |
| search returns specs matching a text query                        | Supported by source/area suite; see scope limits |
| Abstract class with abstract methods                              | Supported by source/area suite; see scope limits |
| Spec counting                                                     | Supported by source/area suite; see scope limits |
| Spec list reindex                                                 | Supported by source/area suite; see scope limits |
| Filesystem-backed specs capability                                | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Extends Repository with immutable accessors** — Inheritance from Repository base. Supported at requirement level by the source/suite evidence above.
2. **Count matches list meta.total from index source** — Spec counting. Supported at requirement level by the source/suite evidence above.
3. **reindex rebuilds workspace spec list cache** — Spec list reindex. Supported at requirement level by the source/suite evidence above.
4. **Port declares its full abstract storage method roster** — Abstract class with abstract methods. Supported at requirement level by the source/suite evidence above.
5. **Removed field-wise and hash-only methods are not part of the abstract roster** — Abstract class with abstract methods. Supported at requirement level by the source/suite evidence above.
6. **Operations are limited to the bound workspace** — Workspace scoping. Supported at requirement level by the source/suite evidence above.
7. **Spec exists** — get returns a Spec or null. Supported at requirement level by the source/suite evidence above.
8. **Spec does not exist** — get returns a Spec or null. Supported at requirement level by the source/suite evidence above.
9. **List all specs as SpecListEntry rows** — list returns spec metadata with optional prefix filter. Supported at requirement level by the source/suite evidence above.
10. **List with prefix filter** — list returns spec metadata with optional prefix filter. Supported at requirement level by the source/suite evidence above.
11. **Empty workspace** — list returns spec metadata with optional prefix filter. Supported at requirement level by the source/suite evidence above.
12. **Title falls back to path segment** — SpecListEntry port shape. Supported at requirement level by the source/suite evidence above.
13. **Summary and Meta respect include flags** — SpecListEntry port shape. Supported at requirement level by the source/suite evidence above.
14. **includeMeta omitted leaves Meta fields absent** — SpecListEntry port shape. Supported at requirement level by the source/suite evidence above.
15. **Resolution errors still return an entry with title fallback** — SpecListEntry port shape. Supported at requirement level by the source/suite evidence above.
16. **Artifact exists** — artifact loads a single artifact file. Supported at requirement level by the source/suite evidence above.
17. **Artifact does not exist** — artifact loads a single artifact file. Supported at requirement level by the source/suite evidence above.
18. **Expected spec artifact file can be read** — Spec artifact access is limited to expected artifact files. Supported at requirement level by the source/suite evidence above.
19. **Unexpected extra file is rejected** — Spec artifact access is limited to expected artifact files. Supported at requirement level by the source/suite evidence above.
20. **spec-lock is not exposed as a normal artifact** — Spec artifact access is limited to expected artifact files. Supported at requirement level by the source/suite evidence above.
21. **Read rejects escaping path** — Spec artifact path confinement. Supported at requirement level by the source/suite evidence above.
22. **Save rejects escaping path** — Spec artifact path confinement. Supported at requirement level by the source/suite evidence above.
23. **Debug logs cover expected-file resolution and rejection** — Spec artifact resolution debug logging. Supported at requirement level by the source/suite evidence above.
24. **ReadOnly workspace rejects save** — save persists a single artifact with conflict detection. Supported at requirement level by the source/suite evidence above.
25. **First write creates spec directory** — save persists a single artifact with conflict detection. Supported at requirement level by the source/suite evidence above.
26. **Conflict detected on save** — save persists a single artifact with conflict detection. Supported at requirement level by the source/suite evidence above.
27. **Force save bypasses conflict detection** — save persists a single artifact with conflict detection. Supported at requirement level by the source/suite evidence above.
28. **Spec directory is fully removed** — delete removes the entire spec directory. Supported at requirement level by the source/suite evidence above.
29. **Absolute path resolves within workspace** — resolveFromPath resolves storage paths to spec identity. Supported at requirement level by the source/suite evidence above.
30. **Relative path resolves within workspace** — resolveFromPath resolves storage paths to spec identity. Supported at requirement level by the source/suite evidence above.
31. **Relative path escapes workspace** — resolveFromPath resolves storage paths to spec identity. Supported at requirement level by the source/suite evidence above.
32. **Invalid spec link** — resolveFromPath resolves storage paths to spec identity. Supported at requirement level by the source/suite evidence above.
33. **Missing metadata reports kind missing** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
34. **Invalid persisted metadata reports kind invalid** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
35. **Present metadata reports kind present with revision** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
36. **writeMetadataSnapshot creates metadata when expectedRevision is null** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
37. **writeMetadataSnapshot replaces metadata when expectedRevision matches** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
38. **writeMetadataSnapshot rejects a stale expectedRevision** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
39. **writeMetadataSnapshot is not subject to the readOnly guard** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
40. **readMetadataSnapshot never reports freshness** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
41. **Matching specs returned with score** — search returns specs matching a text query. Supported at requirement level by the source/suite evidence above.
42. **No matching specs returns empty array** — search returns specs matching a text query. Supported at requirement level by the source/suite evidence above.
43. **Results sorted by score descending** — search returns specs matching a text query. Supported at requirement level by the source/suite evidence above.
44. **Limit option respected** — search returns specs matching a text query. Supported at requirement level by the source/suite evidence above.
45. **Search scoped to single workspace** — search returns specs matching a text query. Supported at requirement level by the source/suite evidence above.
46. **persistedStateMeta hash remains stable when state is unchanged** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
47. **persistedStateMeta hash changes when lock state is modified** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
48. **persistedStateMeta without includeHash omits hash** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
49. **persistedStateMeta returns null when sidecar is absent** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
50. **there is no persistedStateHash method on the port** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
51. **specFingerprint orders artifact hashes by filename** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
52. **readPersistedState returns the complete persisted snapshot** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
53. **readPersistedState returns null when no persisted state exists** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
54. **writePersistedState creates state when expectedRevision is null** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
55. **writePersistedState replaces state when expectedRevision matches** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
56. **writePersistedState rejects a stale expectedRevision** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
57. **artifactMeta returns lastModified without hash by default** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
58. **artifactMeta returns hash only when includeHash is true** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
59. **generatedMetadataMeta observes the metadata cache file** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
60. **Filesystem-backed repository exposes canonical specsPath** — Filesystem-backed specs capability. Supported at requirement level by the source/suite evidence above.
61. **Non-filesystem repository does not require specsPath** — Filesystem-backed specs capability. Supported at requirement level by the source/suite evidence above.
62. **Strict read rejects an invalid dependsOn entry** — readPersistedState lenient dependsOn option. Supported at requirement level by the source/suite evidence above.
63. **Lenient read returns invalid dependsOn entries as stored** — readPersistedState lenient dependsOn option. Supported at requirement level by the source/suite evidence above.
64. **Lenient read still validates other fields** — readPersistedState lenient dependsOn option. Supported at requirement level by the source/suite evidence above.
65. **Revision check reads leniently** — readPersistedState lenient dependsOn option. Supported at requirement level by the source/suite evidence above.

### core:archived-change-index-entry

Implementation evidence: `packages/core/src/domain/archived-change-index-entry.ts` defines the required `ArchiveListEntry` fields without `artifacts` or `workspaces`, and keeps the old type as a deprecated alias. `workspacesFromSpecIds` calls `parseSpecId` for every ID and returns the unique workspace names in encounter order. Archive list projection remains index-backed; full details belong to repository `get`. Test evidence: `packages/core/test/domain/archived-change-index-entry.spec.ts` covers order, bare default normalization, empty input and typed invalid-ID failure; archive repository and list use-case suites cover projection and avoidance of per-entry manifests. The corrected merged requirements do not assign a singular workspace to a change. No new discrepancy confirmed.

| Requirement           | Assessment                                                 |
| --------------------- | ---------------------------------------------------------- |
| Index entry fields    | Supported by current interface, helper and area tests      |
| No manifest-only data | Supported by archive list/index code and integration tests |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **ArchiveListEntry contains required fields** — Index entry fields. Supported by interface and archive list tests.
2. **archivedBy appears only when includeArchivedBy is set** — Index entry fields. Supported by archive projection/tests.
3. **Spec workspaces are derived through the validator** — Index entry fields. Supported by `workspacesFromSpecIds` and its tests.
4. **Invalid ID in the input is rejected** — Index entry fields. Supported by `parseSpecId` and typed-error test.
5. **List rows do not claim a change workspace** — Index entry fields. Supported by interface and list result projection.
6. **ArchiveListEntry is sufficient for listing without manifest reads** — No manifest-only data. Supported by index-backed repository/list tests.

## Dependency consistency and globals

Direct dependency union retrieved from status and read via canonical specs show commands: core:{spec-metadata,content-extraction,schema-format,spec-id-format,spec-repository-port,composition-resolver,spec-optimization,validate-artifacts,storage,workspace,validation-result-cache-port,spec-lock,get-spec-metadata,delta-format,artifact-parser-port,change-layout,file-reader-port,diff-generator,vcs-adapter-port,update-implementation-tracking,initialize-persisted-spec-state,get-active-schema,config,change,composition,schema-merge,vcs-adapter,repository-port,search-specs}, default:\_global/{architecture,logging}. In-change versions were taken from merged previews, not raw canonical text where the change overrides them. Global architecture/conventions/testing/cross-platform/error/logging constraints were included from project context. The archive-index correction agrees with the plural workspace model: workspace ownership belongs to individual specs, and archive list rows claim no change-level workspace.

- Domain ID rules remain pure and application use cases validate before spec repository work; expected failures use typed SpecdError subclasses.
- Persisted queries use semantic repository reads and never materialize metadata; persisted writes retain optimistic revision tokens, readOnly checks, and shared creation/patch paths.
- Config-based factories continue to delegate through their resolver helpers. CP6 records a literal dependency-shape drift.
- Windows path confinement uses node:path and qualified prefixes are distinguished from drive letters; portable separator tests and path-sensitive test assertions cover intended branches. No new portability issue confirmed.
- Strict metadata writes reject bare/invalid IDs while reads remain lenient. Strict/lenient persisted lock reads and lenient revision comparison match the new repair contract.
- CP3/CP4 identify a genuine contract decision between lock-less artifact-derived dependencies and validation against an empty canonical persisted baseline. CP7 identifies contradictory wording between neighboring specs; CP8 identifies a requirement/test discrepancy.

## Missing tests and validation interpretation

Tests are present for each assigned area's principal behavior, including invalid/empty/malformed/unknown-workspace IDs, bare-ID normalization, readOnly errors, revision conflicts, null-state no-ops, optimization field filtering/freshness, path escape rejection, target-schema parsing, config patterns/workspace grammar, cache hits, and lenient lock repair. Confirmed uncovered branches are CP1 optimization-staleness validation, CP2 warning propagation, CP3 lock-less mismatch validation, CP4 full generator result shape, and CP5 absence-to-presence snapshot consistency. Broader 1:1 coverage of every unchanged scenario has not been established independently; the inventory is a requirement-level static matrix, not a coverage instrument report.

## Summary counts

- Assigned specs: 15.
- Requirement headings: 187.
- Compiled scenarios inventoried: 685.
- Confirmed introduced implementation discrepancies: 0.
- Confirmed baseline discrepancy groups: 8 (CP1–CP8).
- Production/source/spec modifications by this auditor: 0.
- Required decision: reconcile or explicitly defer baseline findings; do not silently treat full-mode compliance as clean.
