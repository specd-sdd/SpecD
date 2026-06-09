# Audit Report: core-update-metadata

## Specs Audited

- `core:update-spec-metadata`
- `core:update-project-metadata`

## Summary

The implementation for both use cases is compliant with the requirements and follows the project's architectural standards.

## core:update-spec-metadata

### Requirements Verification

- **Deterministic extraction before merge**: COMPLIANT. The use case calls `GenerateSpecMetadata` to get fresh deterministic data before merging.
- **Merging optimized fields**: COMPLIANT. Merges `optimizedDescription` and `optimizedContext` from the payload into the deterministic base.
- **Persistence**: COMPLIANT. Calls `SaveSpecMetadata` to persist the merged result.

### Test Coverage

- Verified in `packages/core/test/application/use-cases/update-spec-metadata.spec.ts`.
- Covers merging logic and interaction with dependencies.

---

## core:update-project-metadata

### Requirements Verification

- **Hash computation**: COMPLIANT. Computes SHA-256 hashes for `specd.yaml`, context files, and included spec metadata.
- **Atomicity**: COMPLIANT. Uses `FsFileWriter` which leverages `writeFileAtomic`.
- **Payload separation**: COMPLIANT. Only accepts `optimizedContext` in the payload, computing all other metadata internally.

### Test Coverage

- Verified in `packages/core/test/application/use-cases/update-project-metadata.spec.ts`.
- Covers hash computation for all input types and structure of the persisted JSON.

## Global Compliance

- **Architecture**: Follows hexagonal architecture by using ports (`FileReader`, `FileWriter`, `ContentHasher`) and use cases.
- **Conventions**: Uses ESM, TypeScript, and follows naming conventions.
- **Error Handling**: Throws appropriate domain errors (`SpecNotFoundError`, `ConfigNotFoundError`).
