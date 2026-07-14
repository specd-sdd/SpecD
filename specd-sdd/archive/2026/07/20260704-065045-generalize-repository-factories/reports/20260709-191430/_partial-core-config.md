# Spec-Compliance Audit Report: Configuration Subsystem

This report presents the compliance audit for the specifications `core:config` and `core:config-writer-port` within the change `generalize-repository-factories`.

---

## 1. Specification: `core:config`

### 1.1 Metadata and Locations

- **Spec Source:** [`specs/core/config/spec.md`](file:///Users/monki/Documents/Proyectos/specd/specs/core/config/spec.md) (and paired [`verify.md`](file:///Users/monki/Documents/Proyectos/specd/specs/core/config/verify.md))
- **Port Interfaces:** [`packages/core/src/application/ports/config-loader.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/ports/config-loader.ts) & [`packages/core/src/application/specd-config.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/specd-config.ts)
- **Adapter Implementation:** [`packages/core/src/infrastructure/fs/config-loader.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/config-loader.ts)
- **Composition Factory:** [`packages/core/src/composition/config-loader.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/config-loader.ts)
- **Test Suite:** [`packages/core/test/infrastructure/fs/config-loader.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/fs/config-loader.spec.ts)

### 1.2 Compliance Verification

- **Cascade Config Merging:** The implementation in `FsConfigLoader` fully conforms to cascade merging requirements (standalone, `extends: true` previous, `extends: <path>` explicit, and `remove` overrides).
- **Validation & Constraints:**
  - Mode `hash` for privacy settings correctly requires a `salt` (verified by a custom refinement in `SpecdYamlZodSchema`).
  - `contextMode` inside workspace is properly rejected at startup using custom Zod path issue checks.
  - Misplaced wildcards or empty patterns in `contextIncludeSpecs`/`contextExcludeSpecs` are validated and rejected at startup with a `ConfigValidationError`.
  - Legacy fields `artifactRules` and `skills` are rejected at startup with clear migration instructions.
  - Inherited removals targeting the required `schema` field or targeting unknown workspaces/storage keys are rejected at validation time.
- **Hexagonal & Global Consistency:**
  - **ESM Conventions:** All imports in ports, adapters, and composition code correctly use ESM resolution format with `.js` extensions.
  - **Hexagonal Boundaries:** The `ConfigLoader` port defines the application-level contract. Concrete filesystem implementation (`FsConfigLoader`) is isolated in `infrastructure/fs/`, and delivery hosts obtain it strictly through the composition helper `createConfigLoader()`.
  - **Validation Boundary:** Strict validation is enforced at the I/O boundary using `SpecdYamlZodSchema.safeParse` inside the `load()` method.

### 1.3 Test Coverage

- **Tests Count:** 123 tests inside `config-loader.spec.ts`.
- **Scenario Coverage:** 100% scenario coverage. Every single scenario described in `specs/core/config/verify.md` has a matching test block in the suite. All tests pass successfully.

---

## 2. Specification: `core:config-writer-port`

### 2.1 Metadata and Locations

- **Spec Source:** [`specs/core/config-writer-port/spec.md`](file:///Users/monki/Documents/Proyectos/specd/specs/core/config-writer-port/spec.md) (and paired [`verify.md`](file:///Users/monki/Documents/Proyectos/specd/specs/core/config-writer-port/verify.md))
- **Port Interface:** [`packages/core/src/application/ports/config-writer.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/ports/config-writer.ts)
- **Adapter Implementation:** [`packages/core/src/infrastructure/fs/config-writer.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/config-writer.ts)
- **Composition Factory:** [`packages/core/src/composition/config-writer.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/config-writer.ts)
- **Test Suite:** [`packages/core/test/infrastructure/fs/config-writer.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/fs/config-writer.spec.ts)

### 2.2 Compliance Divergences & Gaps

While the TypeScript port interface, composition factory, and basic method wiring conform to standard hexagonal and ESM conventions, **two major compliance divergences** exist in the implementation of `FsConfigWriter.initProject`:

#### Divergence 1: Storage Block Omission Requirement Violation

> [!IMPORTANT]
> **Spec Requirement:**
> _"Create a `specd.yaml` file in `projectRoot` with the schema and default workspace configuration. The `storage` block is omitted by default, allowing storage paths to resolve automatically to standard `fs` defaults under `specdPath`."_
>
> **Implementation Behavior:**
> `FsConfigWriter.initProject` explicitly adds a hardcoded `storage` block containing the default subdirectories:
>
> ```typescript
> storage: {
>   changes: fsAdapter('.specd/changes/'),
>   drafts: fsAdapter('.specd/drafts/'),
>   discarded: fsAdapter('.specd/discarded/'),
>   archive: fsAdapter('.specd/archive/'),
> }
> ```
>
> **Test Violation:**
> The test suite in `config-writer.spec.ts` actively reinforces this incorrect behavior with `expect(parsed['storage']).toBeDefined()`.

#### Divergence 2: Legacy Configuration Format Generation

> [!IMPORTANT]
> **Spec Requirement (from `core:config`):**
> Workspace and storage adapter configurations must use the new generalized shape:
>
> ```yaml
> specs:
>   adapter:
>     type: fs
>     config:
>       path: specs/
> ```
>
> **Implementation Behavior:**
> `FsConfigWriter.initProject` utilizes a helper `fsAdapter` that writes the deprecated legacy layout:
>
> ```typescript
> const fsAdapter = (p: string) => ({ adapter: 'fs', fs: { path: p } })
> ```
>
> Consequently, initializing a fresh project generates `specd.yaml` in the legacy format, which immediately triggers legacy warnings in `ConfigLoader` upon loading.
>
> **Test Violation:**
> The test suite in `config-writer.spec.ts` asserts the deprecated format:
>
> ```typescript
> const specs = ws['specs'] as Record<string, unknown>
> const fsConf = specs['fs'] as Record<string, unknown>
> expect(fsConf['path']).toBe('my-specs/')
> ```

### 2.3 Test Coverage & Gaps

- **Tests Count:** 14 tests in `config-writer.spec.ts`.
- **Scenario Coverage:** Basic scenarios are present, but there is a **test-spec alignment gap**:
  - Instead of verifying that the `storage` block is omitted, the test suite asserts that it is present.
  - Instead of verifying that workspace specs configurations are initialized with the generalized format (`adapter.config.path`), the tests assert they match the legacy structure (`fs.path`).

---

## 3. Summary of Action Items

1. **Modify `FsConfigWriter.initProject`:**
   - Omit the `storage` section from the generated configuration document.
   - Write the default workspace's `specs` block in the new generalized adapter format:
     ```yaml
     workspaces:
       default:
         specs:
           adapter:
             type: fs
             config:
               path: specs/
     ```
2. **Update `config-writer.spec.ts`:**
   - Align assertions with the updated configuration output (asserting `storage` is undefined/omitted, and specs path uses the new structure).
