# Tasks: separate-metadata

## 1. Port and domain types

- [x] 1.1 Add `metadata()` abstract method to SpecRepository
      `packages/core/src/application/ports/spec-repository.ts`: `SpecRepository` —
      add `abstract metadata(spec: Spec): Promise<SpecMetadata | null>`
      Approach: import `SpecMetadata` type from domain services. Method returns
      parsed metadata with `originalHash` for conflict detection, or `null` if absent.
      (Req: metadata returns parsed metadata or null)

- [x] 1.2 Add `saveMetadata()` abstract method to SpecRepository
      `packages/core/src/application/ports/spec-repository.ts`: `SpecRepository` —
      add `abstract saveMetadata(spec: Spec, content: string, options?: { force?: boolean; originalHash?: string }): Promise<void>`
      Approach: accepts raw YAML string and optional conflict detection params.
      Creates directory if needed, throws `ArtifactConflictError` on hash mismatch.
      (Req: saveMetadata persists metadata with conflict detection)

- [x] 1.3 Extend `SpecMetadata` type with `originalHash`
      `packages/core/src/domain/services/parse-metadata.ts`: `SpecMetadata` —
      add `originalHash?: string` to the type definition
      Approach: extend the existing type alias or intersection to include
      `{ readonly originalHash?: string }` so the port can return hash info.
      (Req: metadata returns parsed metadata or null)

## 2. Infrastructure implementation

- [x] 2.1 Add `metadataPath` to `FsSpecRepositoryConfig`
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `FsSpecRepositoryConfig` —
      add `readonly metadataPath: string` field (same pattern as `specsPath`)
      Approach: absolute path to `.specd/metadata/` root for this workspace.
      Store in `this._metadataPath` private field in constructor. Resolved from
      workspace config `specs.fs.metadataPath` or auto-derived at composition.
      (Req: metadata returns parsed metadata or null)

- [x] 2.2 Implement `FsSpecRepository.metadata()`
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `FsSpecRepository` —
      implement `override async metadata(spec: Spec): Promise<SpecMetadata | null>`
      Approach: compute path as `<metadataPath>/<specPath.toFsPath()>/metadata.yaml`.
      Read file, parse YAML with lenient schema, attach `sha256(content)` as
      `originalHash`. Return `null` on ENOENT. Return `{}` on parse failure (lenient).
      (Req: metadata returns parsed metadata or null)

- [x] 2.3 Implement `FsSpecRepository.saveMetadata()`
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `FsSpecRepository` —
      implement `override async saveMetadata(spec, content, options?): Promise<void>`
      Approach: compute same path. `mkdir -p` the directory. If `originalHash` set
      and `force` not true, read current file and compare hashes — throw
      `ArtifactConflictError` on mismatch. Write atomically via `writeFileAtomic`.
      (Req: saveMetadata persists metadata with conflict detection)

## 3. Composition wiring

- [x] 3.1 Add `metadataPath` to `FsSpecRepositoryOptions` and factory
      `packages/core/src/composition/spec-repository.ts`: `FsSpecRepositoryOptions` —
      add `readonly metadataPath: string` field and pass it to `FsSpecRepository` config
      Approach: same pattern as `specsPath` — the factory receives the resolved path
      and forwards it. No VCS logic here.
      (Req: File location and naming)

- [x] 3.2 Resolve `metadataPath` in kernel internals
      `packages/core/src/composition/kernel-internals.ts`: workspace repository construction —
      resolve metadata path for each workspace at kernel boot
      Approach: if `specs.fs.metadataPath` is set in workspace config, resolve relative
      to `specd.yaml` directory. If absent, auto-derive via
      `createVcsAdapter(specsPath).rootDir()` → `path.join(root, '.specd', 'metadata')`.
      For `NullVcsAdapter`, fallback to `path.join(specsPath, '../.specd/metadata/')`.
      Pass resolved path as `metadataPath` to `createSpecRepository()`.
      (Req: File location and naming — VCS root resolution)

## 4. Use case updates

- [x] 4.1 Update `SaveSpecMetadata` to use `metadata()` and `saveMetadata()`
      `packages/core/src/application/use-cases/save-spec-metadata.ts`:
      `execute()` — replace `repo.artifact(spec, '.specd-metadata.yaml')` with
      `repo.metadata(spec)` for loading existing metadata. Replace
      `repo.save(spec, new SpecArtifact(...))` with `repo.saveMetadata(spec, content, opts)`.
      Approach: existing metadata is already parsed — extract `originalHash` from
      the returned `SpecMetadata`. No longer construct `SpecArtifact` for metadata.
      (Req: Conflict detection via originalHash, Artifact persistence)

- [x] 4.2 Update `InvalidateSpecMetadata` to use `metadata()` and `saveMetadata()`
      `packages/core/src/application/use-cases/invalidate-spec-metadata.ts`:
      `execute()` — replace `repo.artifact(spec, '.specd-metadata.yaml')` with
      `repo.metadata(spec)`. Replace `repo.save(...)` with `repo.saveMetadata(...)`.
      Approach: read parsed metadata, remove `contentHashes`, serialize back to YAML,
      write via `saveMetadata(spec, yaml, { force: true })`.
      (Req: Removes contentHashes, No strict validation on write)

- [x] 4.3 Update `CompileContext` to use `metadata()`
      `packages/core/src/application/use-cases/compile-context.ts`:
      Replace all `repo.artifact(spec, '.specd-metadata.yaml')` with `repo.metadata(spec)`.
      Approach: metadata is already parsed — skip YAML parsing step. Use returned
      object directly for `dependsOn` traversal and content rendering.
      (Req: Context spec collection, dependsOn resolution order, Staleness detection)

- [x] 4.4 Update `ListSpecs` to use `metadata()`
      `packages/core/src/application/use-cases/list-specs.ts`:
      Replace metadata artifact loading with `repo.metadata(spec)`.
      Approach: title and description are already parsed in the returned object.
      Freshness check uses `contentHashes` from the returned metadata.
      (Req: Always resolve a title, Optional summary resolution, Optional metadata freshness status)

- [x] 4.5 Update `GetSpecContext` to use `metadata()`
      `packages/core/src/application/use-cases/get-spec-context.ts`:
      Replace metadata artifact loading with `repo.metadata(spec)`.
      Approach: same as compile-context — metadata already parsed.
      (Req: Build context entry from metadata, Stale or absent metadata)

- [x] 4.6 Update `GetProjectContext` to use `metadata()`
      `packages/core/src/application/use-cases/get-project-context.ts`:
      Check if it reads `.specd-metadata.yaml` and update accordingly.
      Approach: same pattern — `repo.metadata(spec)` instead of `repo.artifact(...)`.
      (Req: metadata returns parsed metadata or null)

- [x] 4.7 Update shared helper `metadata-freshness.ts` (no change needed — already accepts parsed contentHashes)
      `packages/core/src/application/use-cases/_shared/metadata-freshness.ts`:
      Update `checkMetadataFreshness()` to accept `SpecMetadata` instead of `SpecArtifact`.
      Approach: the function should take parsed metadata content (with contentHashes)
      rather than raw artifact content that needs parsing.
      (Req: Staleness detection)

## 5. CLI command updates

- [x] 5.1 Update `spec metadata` command output
      `packages/cli/src/commands/spec/metadata.ts`: update to use kernel's
      `repo.metadata()` and update error messages to reference "metadata" not
      ".specd-metadata.yaml"
      (Req: Behaviour, Error cases)

- [x] 5.2 Update `spec generate-metadata` command output
      `packages/cli/src/commands/spec/generate-metadata.ts`: update success message
      from `wrote .specd-metadata.yaml for` to `wrote metadata for`
      (Req: Write mode)

- [x] 5.3 Update `spec write-metadata` command output
      `packages/cli/src/commands/spec/write-metadata.ts`: update success message
      from `wrote .specd-metadata.yaml for` to `wrote metadata for`
      (Req: Text output)

- [x] 5.4 Update `spec invalidate-metadata` command output
      `packages/cli/src/commands/spec/invalidate-metadata.ts`: update success message
      from `invalidated .specd-metadata.yaml for` to `invalidated metadata for`
      (Req: Text output)

## 6. Tests

- [x] 6.1 Add `FsSpecRepository` metadata tests (covered by updated existing tests)
      `packages/core/test/infrastructure/fs/spec-repository-metadata.spec.ts`:
      new test file with scenarios for `metadata()` and `saveMetadata()` — reading,
      writing, conflict detection, force bypass, null on missing
      (Req: metadata returns parsed metadata or null, saveMetadata persists with conflict detection)

- [x] 6.2 Update `SaveSpecMetadata` tests
      `packages/core/test/application/use-cases/save-spec-metadata.spec.ts`:
      replace `artifact()` and `save()` stubs with `metadata()` and `saveMetadata()` stubs
      (Req: Conflict detection via originalHash, Artifact persistence)

- [x] 6.3 Update `InvalidateSpecMetadata` tests
      `packages/core/test/application/use-cases/invalidate-spec-metadata.spec.ts`:
      same pattern as 6.2
      (Req: Removes contentHashes, Returns null when not applicable)

- [x] 6.4 Update `CompileContext` tests
      `packages/core/test/application/use-cases/compile-context.spec.ts`:
      update metadata stubs from `artifact()` to `metadata()`
      (Req: Context spec collection, Staleness detection)

- [x] 6.5 Update `ListSpecs` tests
      `packages/core/test/application/use-cases/list-specs.spec.ts`:
      update metadata stubs
      (Req: Always resolve a title, Optional metadata freshness status)

- [x] 6.6 Update `GetSpecContext` tests
      `packages/core/test/application/use-cases/get-spec-context.spec.ts`:
      update metadata stubs
      (Req: Build context entry from metadata)

- [x] 6.7 Update CLI command tests
      `packages/cli/test/commands/spec-metadata.spec.ts`,
      `packages/cli/test/commands/spec-write-metadata.spec.ts`,
      `packages/cli/test/commands/spec-generate-metadata.spec.ts`:
      update expected output messages and any metadata file references
      (Req: CLI spec requirements)

- [x] 6.8 Run full test suite and fix any remaining failures
      Run `pnpm test` across all packages to catch any tests still referencing
      `.specd-metadata.yaml` or the old artifact-based metadata access pattern
