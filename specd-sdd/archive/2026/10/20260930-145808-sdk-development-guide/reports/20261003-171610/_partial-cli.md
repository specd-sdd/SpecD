# CLI verification audit — `sdk-development-guide`

## Requirements Summary

This read-only audit reviewed the merged verification artifacts for `cli:guide-sdk`,
`cli:entrypoint`, and `cli:guide`, and the direct runtime dependencies that deliver
their behavior. The merged verify artifacts contain 22 requirements / 101 scenarios
for `cli:guide-sdk`, 18 / 63 for `cli:guide`, and 33 / 95 for `cli:entrypoint`.
The latter two contain broader pre-existing coverage; this audit is limited to the
requirements reached by the SDK-guide change.

- `cli:guide-sdk`: bounded SDK catalog listing; independent `--scope` and
  `--collection`; structured text/JSON/TOON envelopes; topic metadata, section and
  line-window reads; short unknown-topic errors; title suggestions; and SDK search.
- `cli:guide`: preserves the existing user-guide behavior while adding a structured
  discovery pointer to the sibling `specd guide-sdk` command and a matching listing
  envelope.
- `cli:entrypoint`: exposes the command through the root Commander program without
  eagerly loading the generated SDK catalog.

## Implementation Status

Implemented and exercised:

- `packages/cli/src/program.ts` registers `guide` and `guide-sdk`. The latter receives
  a memoized lazy dynamic import of `@specd/guide/sdk`, so non-SDK commands do not
  load the generated catalog.
- `packages/cli/src/commands/guide-sdk/index.ts` registers `guide-sdk [topic]` and
  `guide-sdk search [query]`; validates scope/collection; uses the shared pagination,
  formatter, and error routes; and delegates topic retrieval, sections, metadata, and
  search to `GuideEngine`.
- `packages/cli/src/commands/guide/index.ts` retains the user guide and emits the
  `sdkGuide` discovery data for listings. `packages/cli/src/commands/guide/formatters.ts`
  serializes the shared structured envelopes and deliberately suppresses generated
  declaration paths from public topic metadata and search hits.
- The direct implementation chain is present in the graph and has high blast-radius
  visibility: `guide-sdk/index.ts` -> guide formatters/listing options/error mapping
  -> `@specd/guide/sdk` engine; `program.ts` -> both guide command registrations.

## Discrepancies

### Verification artifact contradicts the shipped public-output policy (blocking spec/verify drift)

The merged `cli:guide-sdk` verification scenarios still require the generated-topic
metadata and body to report the declaration source path (notably the scenarios headed
`Generated topic metadata carries the package and the import` and `The generated body
surfaces the import without requiring metadata`). The actual implementation in
`runTopic` omits `file` for generated topics, and `toPublicSearchHit` omits it for
generated search results. This implementation matches the active change decision that
generated source paths are repository-internal and must not appear in public output.

This is an artifact-level inconsistency, not an implementation defect: the verification
scenario must be revised to require omission of generated declaration paths. As written,
those scenarios fail against the intended implementation.

### Stale example in CLI help

`packages/cli/src/commands/guide-sdk/index.ts` still shows
`sdk:interfaces/ArtifactDag --meta` in its examples. The merged requirement and current
catalog address the symbol as `sdk:classes/ArtifactDag`. This is a user-visible stale
example. The focused tests do not assert that help example, so the suite remains green.

No additional implementation discrepancy was found for the audited command routing,
lazy SDK loading, scope/collection composition, listing envelope, discovery field, or
the tested topic/search paths.

## Test Coverage

Executed:

```text
pnpm --filter @specd/cli test -- test/commands/guide-sdk/guide-sdk.test.ts \
  test/commands/guide/guide.test.ts test/entrypoint.spec.ts
```

Result: 87 test files and 1,097 tests passed.

`packages/cli/test/commands/guide-sdk/guide-sdk.test.ts` gives substantial behavioral
coverage for default suppression, collection and scope composition, invalid flags,
pagination/envelope fields, text/structured renders, metadata, unknown-topic hints,
section windows, generated-topic path suppression, and search. `guide.test.ts` covers
the user-guide discovery pointer in text, JSON, and TOON. `entrypoint.spec.ts` covers
root program mechanics; the registration is also visible through the graph's direct
dependency chain from `program.ts`.

## Missing Tests

- Add an assertion that `guide-sdk --help` uses the canonical
  `sdk:classes/ArtifactDag` example (and does not retain the interface path).
- Add an end-to-end root-program assertion that `specd --help` exposes `guide-sdk` and
  that resolving it uses the lazy SDK factory. Existing guide-sdk tests register the
  command directly, which does not prove the real root registration path by itself.
- After correcting the stale verify scenarios, add/retain explicit assertions that
  generated topic metadata, body, and search hits never expose `file`, while hand-written
  topics continue to expose their source file.

## Spec Dependency Chain

```text
cli:entrypoint
  -> packages/cli/src/program.ts (root Commander registration)
     -> cli:guide (user-guide adapter)
        -> commands/guide/formatters.ts (shared envelope + SDK discovery)
        -> @specd/guide (user collection engine)
     -> cli:guide-sdk (SDK-guide adapter)
        -> commands/guide-sdk/index.ts
           -> listing-options.ts / formatters.ts / CLI errors
           -> @specd/guide/sdk (lazy SDK GuideEngine)
```

The graph reports `guide-sdk/index.ts` as HIGH risk with direct dependents including
`program.ts`, guide formatters, listing options, error handling, and the focused SDK
command test. Its covering specs include `cli:entrypoint` and `cli:guide`.

## Summary counts

| Item                                            |      Count |
| ----------------------------------------------- | ---------: |
| Audited spec IDs                                |          3 |
| Merged requirements inspected (artifact totals) |         73 |
| Merged scenarios inspected (artifact totals)    |        259 |
| Focused test files requested                    |          3 |
| Test files passed by Vitest run                 |         87 |
| Tests passed                                    |      1,097 |
| Implementation discrepancies                    |          0 |
| Artifact/verification discrepancies             | 1 blocking |
| Stale help examples                             |          1 |
| Missing-test areas                              |          3 |
