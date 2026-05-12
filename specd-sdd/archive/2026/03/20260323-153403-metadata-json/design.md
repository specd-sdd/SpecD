# Design: metadata-json

## Non-goals

- **Changing the metadata schema** — the Zod schemas (`specMetadataSchema`, `strictSpecMetadataSchema`) remain identical
- **Changing the `GenerateSpecMetadata` core use case** — it returns a plain object; serialization is the caller's responsibility

## Affected areas

### Infrastructure: `FsSpecRepository`

**File:** `packages/core/src/infrastructure/fs/spec-repository.ts`

- `_metadataFilePath()`: `metadata.yaml` → `metadata.json`
- `metadata()`: `parseYaml()` → `JSON.parse()`, remove `yaml` import

### Use case: `SaveSpecMetadata`

**File:** `packages/core/src/application/use-cases/save-spec-metadata.ts`

- Replace `this._yaml.parse(input.content)` with `JSON.parse(input.content)`
- Remove `YamlSerializer` from constructor — no longer needed
- Update error message from `content must be a YAML mapping` to `content must be a JSON object`

### Use case: `InvalidateSpecMetadata`

**File:** `packages/core/src/application/use-cases/invalidate-spec-metadata.ts`

- Replace `this._yaml.stringify(withoutHashes)` with `JSON.stringify(withoutHashes, null, 2) + '\n'`
- Remove `YamlSerializer` from constructor

### Use case: `ArchiveChange`

**File:** `packages/core/src/application/use-cases/archive-change.ts`

- Replace `this._yaml.stringify(metadata)` with `JSON.stringify(metadata, null, 2) + '\n'`
- Remove `YamlSerializer` usage for metadata serialization (keep it if used elsewhere in the file)

### Shared helper: `parse-metadata.ts`

**File:** `packages/core/src/application/use-cases/_shared/parse-metadata.ts`

- Replace `parseYaml()` with `JSON.parse()`, remove `yaml` import

### Composition: factory files

**Files:**

- `packages/core/src/composition/use-cases/save-spec-metadata.ts` — remove `NodeYamlSerializer` wiring
- `packages/core/src/composition/use-cases/invalidate-spec-metadata.ts` — remove `NodeYamlSerializer` wiring
- `packages/core/src/composition/kernel.ts` — update constructor calls, remove yaml from SaveSpecMetadata and InvalidateSpecMetadata

### CLI: `spec generate-metadata`

**File:** `packages/cli/src/commands/spec/generate-metadata.ts`

- Already done — `JSON.stringify` instead of YAML `stringify`

### CLI: `spec write-metadata`

**File:** `packages/cli/src/commands/spec/write-metadata.ts`

- Replace `parseYaml()` validation with `JSON.parse()` validation
- Update error message from `invalid YAML` to `invalid JSON`
- Remove `yaml` import

## Approach

1. **Core use cases** — remove `YamlSerializer` from `SaveSpecMetadata` and `InvalidateSpecMetadata`, use `JSON.parse`/`JSON.stringify`
2. **Shared helper** — update `parseMetadata()` to use `JSON.parse`
3. **Infrastructure** — already done
4. **Composition** — remove `NodeYamlSerializer` wiring from factory files and kernel
5. **CLI** — update `write-metadata` validation
6. **ArchiveChange** — update metadata serialization
7. **Tests** — update all affected test files
8. **Migration** — delete `.yaml`, regenerate as `.json`

## Key decisions

**Decision: `JSON.stringify(metadata, null, 2) + '\n'`** → Pretty-printed with trailing newline for clean git diffs.

**Decision: `SaveSpecMetadata` no longer needs `YamlSerializer`** → The only reason it had it was to parse YAML input. With JSON, `JSON.parse()` is built-in. The constructor simplifies to just `specRepos`.

## Testing

### Modified test files

- `packages/core/test/application/use-cases/save-spec-metadata.spec.ts` — remove yaml mocking, update content strings
- `packages/core/test/application/use-cases/invalidate-spec-metadata.spec.ts` — remove yaml mocking
- `packages/core/test/application/use-cases/helpers.ts` — update StubSpecRepository if needed
- `packages/core/test/domain/services/parse-metadata.spec.ts` — update content from YAML to JSON
- `packages/cli/test/commands/spec-generate-metadata.spec.ts` — already done
- `packages/cli/test/commands/spec-write-metadata.spec.ts` — update YAML references to JSON
