# Design: separate-metadata

## Non-goals

- **Migration command** — moving existing `.specd-metadata.yaml` files to `.specd/metadata/` is deferred to a separate change
- **New SpecMetadata domain entity** — the `metadata()` port method returns parsed YAML content typed as `SpecMetadata` (the existing type from `parse-metadata.ts`), not a new rich entity
- **Changing metadata schema or validation** — the Zod schemas (`specMetadataSchema`, `strictSpecMetadataSchema`) remain unchanged

## Affected areas

### Port: `SpecRepository`

**File:** `packages/core/src/application/ports/spec-repository.ts`

Add two abstract methods: `metadata(spec)` and `saveMetadata(spec, content, options?)`. No existing methods are modified or removed.

### Infrastructure: `FsSpecRepository`

**File:** `packages/core/src/infrastructure/fs/spec-repository.ts`

Implement `metadata()` and `saveMetadata()`. These resolve the metadata path via `.specd/metadata/<specPath>/metadata.yaml` relative to the VCS root of the specs path. Requires a new constructor parameter for the metadata root path, or computing it lazily from the VCS adapter.

### Infrastructure: `FsSpecRepositoryConfig` / Composition

**File:** `packages/core/src/infrastructure/fs/spec-repository.ts`

Add `metadataPath` to `FsSpecRepositoryConfig` — same level as `specsPath`. This is the absolute path to the metadata root for this workspace (e.g. `/project/.specd/metadata`).

**File:** `packages/core/src/composition/spec-repository.ts`

The factory `createSpecRepository()` receives `metadataPath` as part of `FsSpecRepositoryOptions` and passes it to `FsSpecRepository`.

**File:** `packages/core/src/composition/kernel-internals.ts`

Resolves the metadata path for each workspace at kernel boot. The resolved config workspace entry includes `specs.fs.metadataPath` — if explicit, use it directly; if absent, resolve automatically via `createVcsAdapter(specsPath).rootDir()` + `/.specd/metadata/`. For `NullVcsAdapter`, fallback to `path.join(specsPath, '../.specd/metadata/')`.

### Config: workspace specs config

The workspace config gains an optional `metadataPath` under `specs.fs`:

```yaml
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/core
        metadataPath: .specd/metadata # optional — auto-resolved if absent
```

When absent, the config resolver derives it from the VCS root of `specs.fs.path`. When present, it's resolved relative to `specd.yaml` like `path` is.

### Use case: `SaveSpecMetadata`

**File:** `packages/core/src/application/use-cases/save-spec-metadata.ts`

Replace `repo.artifact(spec, '.specd-metadata.yaml')` with `repo.metadata(spec)` for reading existing metadata. Replace `repo.save(spec, new SpecArtifact('.specd-metadata.yaml', content))` with `repo.saveMetadata(spec, content, options)`. The `SpecArtifact` construction for metadata disappears entirely from this use case.

### Use case: `InvalidateSpecMetadata`

**File:** `packages/core/src/application/use-cases/invalidate-spec-metadata.ts`

Replace `repo.artifact(spec, '.specd-metadata.yaml')` with `repo.metadata(spec)`. Replace `repo.save(...)` with `repo.saveMetadata(...)`.

### Use case: `CompileContext`

**File:** `packages/core/src/application/use-cases/compile-context.ts`
**File:** `packages/core/src/application/use-cases/_shared/parse-metadata.ts` (if exists)

Replace all `repo.artifact(spec, '.specd-metadata.yaml')` calls with `repo.metadata(spec)`. The metadata is already parsed by the port — no need for the manual YAML parse step at the use case level.

### Use case: `ListSpecs`

**File:** `packages/core/src/application/use-cases/list-specs.ts`

Replace `repo.artifact(spec, '.specd-metadata.yaml')` with `repo.metadata(spec)`.

### Use case: `GetSpecContext`

**File:** `packages/core/src/application/use-cases/get-spec-context.ts`

Replace `repo.artifact(spec, '.specd-metadata.yaml')` with `repo.metadata(spec)`.

### Use case: `GetProjectContext`

**File:** `packages/core/src/application/use-cases/get-project-context.ts`

Replace `repo.artifact(spec, '.specd-metadata.yaml')` with `repo.metadata(spec)` if it reads metadata.

### Shared helper: `metadata-freshness.ts`

**File:** `packages/core/src/application/use-cases/_shared/metadata-freshness.ts`

The `checkMetadataFreshness()` function may need updating if it takes a `SpecArtifact` as input — it should accept the parsed metadata object from `repo.metadata()` instead.

### CLI commands

**Files:**

- `packages/cli/src/commands/spec/metadata.ts`
- `packages/cli/src/commands/spec/generate-metadata.ts`
- `packages/cli/src/commands/spec/write-metadata.ts`
- `packages/cli/src/commands/spec/invalidate-metadata.ts`

Update output messages from `wrote .specd-metadata.yaml for` to `wrote metadata for`, etc. CLI commands delegate to use cases so the core logic changes are handled upstream.

### Test files

All test files under `packages/core/test/` and `packages/cli/test/` that reference `.specd-metadata.yaml` need updating. The test fixtures and assertions change from `artifact(spec, '.specd-metadata.yaml')` to `metadata(spec)`, and file paths change from spec directories to `.specd/metadata/` directories.

### Exports

**File:** `packages/core/src/application/ports/index.ts`

The `SpecRepository` re-export already exists — no change needed since the type expands with new methods.

## New constructs

### `FsSpecRepository.metadata()` method

- **Location:** `packages/core/src/infrastructure/fs/spec-repository.ts`
- **Shape:**
  ```typescript
  override async metadata(spec: Spec): Promise<SpecMetadata | null>
  ```
  Reads `<metadataRoot>/<specPath>/metadata.yaml`, parses YAML via lenient schema, returns parsed object with `originalHash` attached. Returns `null` if file doesn't exist.
- **Responsibility:** Loads and parses spec metadata from the metadata directory. Does not validate against strict schema.
- **Relationships:** Called by all use cases that previously used `artifact(spec, '.specd-metadata.yaml')`.

### `FsSpecRepository.saveMetadata()` method

- **Location:** `packages/core/src/infrastructure/fs/spec-repository.ts`
- **Shape:**
  ```typescript
  override async saveMetadata(
    spec: Spec,
    content: string,
    options?: { force?: boolean; originalHash?: string },
  ): Promise<void>
  ```
  Writes raw YAML content to `<metadataRoot>/<specPath>/metadata.yaml`. Supports conflict detection via `originalHash` and `force` bypass. Creates directory if needed.
- **Responsibility:** Persists metadata to the metadata directory with conflict detection. Does not validate content.
- **Relationships:** Called by `SaveSpecMetadata` and `InvalidateSpecMetadata`.

### `SpecMetadata` type with `originalHash`

- **Location:** `packages/core/src/domain/services/parse-metadata.ts` (extend existing type)
- **Shape:**
  ```typescript
  export type SpecMetadata = z.infer<typeof specMetadataSchema> & {
    readonly originalHash?: string
  }
  ```
- **Responsibility:** Represents parsed metadata with optional hash for conflict detection.

### `metadataPath` on `FsSpecRepositoryConfig`

- **Location:** `packages/core/src/infrastructure/fs/spec-repository.ts`
- **Shape:**
  ```typescript
  export interface FsSpecRepositoryConfig extends SpecRepositoryConfig {
    readonly specsPath: string
    readonly prefix?: string
    readonly metadataPath: string // NEW — absolute path to .specd/metadata/ root
  }
  ```
- **Responsibility:** Tells the adapter where to store metadata files, decoupled from specs path. Resolved from workspace config `specs.fs.metadataPath` or auto-derived at composition time.

## Approach

### Order of operations

1. **Port first** — Add abstract `metadata()` and `saveMetadata()` to `SpecRepository`. This immediately breaks `FsSpecRepository` compilation, forcing the implementation.

2. **Infrastructure** — Implement both methods on `FsSpecRepository`. The metadata path is: `<metadataPath>/<specPath.toFsPath()>/metadata.yaml`. `metadataPath` comes from the fs adapter config.

3. **Composition** — Update `createSpecRepository()` factory to accept `metadataPath` in `FsSpecRepositoryOptions`. Update `kernel-internals.ts` to resolve the metadata path for each workspace:
   - If `specs.fs.metadataPath` is set in workspace config: use it (resolved relative to `specd.yaml`)
   - If absent: `createVcsAdapter(specsPath)` → `rootDir()` → join `.specd/metadata/`
   - `NullVcsAdapter` fallback: `path.join(specsPath, '../.specd/metadata/')`

4. **Use cases** — Update each use case to call `repo.metadata(spec)` / `repo.saveMetadata(spec, ...)` instead of `repo.artifact(spec, '.specd-metadata.yaml')` / `repo.save(...)`. The `SaveSpecMetadata` use case changes most — it no longer constructs `SpecArtifact` for metadata.

5. **CLI** — Update output messages in the 4 CLI commands.

6. **Tests** — Update all test files to use the new methods and expect files in `.specd/metadata/`.

### Spec requirement coverage

| Spec requirement                                  | Implementation path                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `metadata()` returns parsed metadata or null      | `FsSpecRepository.metadata()`                                                         |
| `saveMetadata()` persists with conflict detection | `FsSpecRepository.saveMetadata()`                                                     |
| File location `.specd/metadata/`                  | `metadataPath` fs adapter config + `_metadataFilePath()` helper                       |
| VCS root resolution for external workspaces       | Config resolver / composition uses `createVcsAdapter()` to auto-derive `metadataPath` |
| `NullVcsAdapter` fallback                         | Falls back to specs root parent                                                       |
| Configurable metadata path                        | `specs.fs.metadataPath` in workspace config                                           |
| All call sites updated                            | Use cases + CLI commands                                                              |

## Key decisions

**Decision: `metadata()` returns parsed content, not raw YAML** → Use cases currently parse the raw artifact content themselves. Having the port return parsed `SpecMetadata` eliminates duplicate parse logic across 6+ call sites. The port uses the lenient schema (`specMetadataSchema`) for reading — same as current behaviour. **Alternative rejected:** returning raw `SpecArtifact` — would keep the same parse-at-every-callsite pattern.

**Decision: `metadataPath` as an fs adapter config field** → Same pattern as `path` — the adapter receives a resolved path and doesn't care how it was derived. The config resolver or composition layer handles VCS root detection. This keeps VCS concerns out of the spec repository and makes the metadata location configurable per workspace. **Alternative rejected:** injecting `VcsAdapter` into `FsSpecRepository` — leaks VCS concerns; computing lazily — adds async complexity to every metadata access.

**Decision: `saveMetadata()` accepts raw YAML string, not parsed object** → The `SaveSpecMetadata` use case validates content against the strict schema before writing, and `InvalidateSpecMetadata` writes back modified YAML. Both produce raw strings. Accepting raw strings keeps the port simple. **Alternative rejected:** accepting `SpecMetadata` object — would require re-serialization in the port.

## Trade-offs

**[Risk: Composition complexity]** → The metadata root resolution adds async VCS detection at startup. **Mitigation:** This happens once per workspace at kernel construction time — same pattern as existing workspace setup.

**[Risk: Test fixtures need metadata directory setup]** → Tests that write metadata need to create `.specd/metadata/` directories in temp dirs. **Mitigation:** The `FsSpecRepository.saveMetadata()` creates directories automatically (same as `save()`).

**[Risk: Existing `.specd-metadata.yaml` files orphaned]** → After this change, the old files are no longer read. **Mitigation:** Migration is a separate task — the old files remain harmless in spec directories until migrated.

## Testing

### Automated tests

**New test files:**

- `packages/core/test/infrastructure/fs/spec-repository-metadata.spec.ts` — Tests for `metadata()` and `saveMetadata()` on `FsSpecRepository`

**Modified test files:**

- `packages/core/test/application/use-cases/save-spec-metadata.spec.ts` — Update to use `repo.metadata()` and `repo.saveMetadata()`
- `packages/core/test/application/use-cases/invalidate-spec-metadata.spec.ts` — Same
- `packages/core/test/application/use-cases/compile-context.spec.ts` — Update metadata stubbing
- `packages/core/test/application/use-cases/list-specs.spec.ts` — Same
- `packages/core/test/application/use-cases/get-spec-context.spec.ts` — Same
- `packages/cli/test/commands/spec-metadata.spec.ts` — Update expected output messages
- `packages/cli/test/commands/spec-write-metadata.spec.ts` — Same
- `packages/cli/test/commands/spec-generate-metadata.spec.ts` — Same
- `packages/cli/test/commands/spec-invalidate-metadata.spec.ts` — Same (if exists)

### Manual verification

- Run `specd spec metadata <specPath>` and verify it reads from `.specd/metadata/`
- Run `specd spec generate-metadata <specPath> --write` and verify it writes to `.specd/metadata/`
- Verify spec directories no longer receive `.specd-metadata.yaml` files after archive
