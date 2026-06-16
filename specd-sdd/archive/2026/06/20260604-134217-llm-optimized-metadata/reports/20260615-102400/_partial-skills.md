# Spec Compliance Audit Report: skills

This report documents the compliance audit of the `@specd/skills` package against the specifications associated with the `llm-optimized-metadata` change.

## 1. Requirements Summary

| ID       | Requirement Name                        | Specification                   | Status            | Verified By / Notes                                                                                     |
| :------- | :-------------------------------------- | :------------------------------ | :---------------- | :------------------------------------------------------------------------------------------------------ |
| **WA-1** | Diagnostic Priority                     | `skills:workflow-automation`    | **Compliant**     | `shared.md.tpl` (L43-L50)                                                                               |
| **WA-2** | Data Extraction                         | `skills:workflow-automation`    | **Compliant**     | `shared.md.tpl` (L51-L55)                                                                               |
| **WA-3** | On-demand outline retrieval             | `skills:workflow-automation`    | **Compliant**     | `shared.md.tpl` (L353-L365)                                                                             |
| **WA-4** | Repair Strategy                         | `skills:workflow-automation`    | **Compliant**     | `shared.md.tpl` (L147-L154)                                                                             |
| **WA-5** | Canonical Command References            | `skills:workflow-automation`    | **Compliant**     | `shared.md.tpl` (L47-L54, L178)                                                                         |
| **WA-6** | Command Necessity and Freshness         | `skills:workflow-automation`    | **Compliant**     | `shared.md.tpl` (L57-L93)                                                                               |
| **WA-7** | Structural Validation vs Content Review | `skills:workflow-automation`    | **Compliant**     | `shared.md.tpl` (L212-L238)                                                                             |
| **WA-8** | Implementation Traceability Policy      | `skills:workflow-automation`    | **Compliant**     | `specd-implement/SKILL.md.tpl`, `specd-archive/SKILL.md.tpl`                                            |
| **WA-9** | Context Optimization Policy             | `skills:workflow-automation`    | **Compliant**     | `shared.md.tpl` (L13-L26)                                                                               |
| **AG-1** | Optimizer agents                        | `skills:agents`                 | **Compliant**     | Directory structure, `skill-repository.spec.ts` L11-12                                                  |
| **AG-2** | Agent prompt policy                     | `skills:agents`                 | **Compliant**     | `specd-project-context-optimizer/SPECD-AGENT.md.tpl`, `specd-spec-context-optimizer/SPECD-AGENT.md.tpl` |
| **AG-3** | Output density                          | `skills:agents`                 | **Compliant**     | Inherent in LLM optimizer prompts.                                                                      |
| **AG-4** | Agent template purity                   | `skills:agents`                 | **Compliant**     | `SPECD-AGENT.md.tpl` starts with `{{{frontmatter}}}` and has no static YAML.                            |
| **AG-5** | Fallback behavior                       | `skills:agents`                 | **Compliant**     | Emitted as plain Markdown files.                                                                        |
| **SK-1** | Skill interface                         | `skills:skill`                  | **Compliant**     | `src/domain/skill.ts` (L23-L48), `skill.spec.ts`                                                        |
| **SK-2** | SkillTemplate interface                 | `skills:skill`                  | **Compliant**     | `src/domain/skill.ts` (L6-L18), `skill.spec.ts`                                                         |
| **SK-3** | No I/O in domain                        | `skills:skill`                  | **Compliant**     | `src/domain/` imports no I/O libraries.                                                                 |
| **SK-4** | Lazy content loading                    | `skills:skill`                  | **Compliant**     | `TemplateReader` and `FileSkillTemplate.getContent()`. `skill.spec.ts` L15                              |
| **SK-5** | Typed errors for skill operations       | `skills:skill`                  | **Compliant**     | `src/domain/errors/` subclasses of `SpecdSkillsError`.                                                  |
| **RE-1** | list() method                           | `skills:skill-repository`       | **Compliant**     | `src/infrastructure/repository/skill-repository.ts` (L118)                                              |
| **RE-2** | get() method                            | `skills:skill-repository`       | **Compliant**     | `src/infrastructure/repository/skill-repository.ts` (L177)                                              |
| **RE-3** | getBundle() method                      | `skills:skill-repository`       | **Non-compliant** | Missing template reference validation for undeclared shared templates.                                  |
| **RE-4** | listSharedFiles() method                | `skills:skill-repository`       | **Compliant**     | `src/infrastructure/repository/skill-repository.ts` (L282)                                              |
| **RI-1** | File reading                            | `skills:skill-repository-infra` | **Compliant**     | Uses `node:fs/promises`.                                                                                |
| **RI-2** | TemplateReader                          | `skills:skill-repository-infra` | **Compliant**     | `src/infrastructure/repository/template-reader.ts`.                                                     |
| **RI-3** | createSkillRepository factory           | `skills:skill-repository-infra` | **Non-compliant** | Returns `SkillRepository` instead of `SkillRepositoryPort` type.                                        |
| **TS-1** | Template directory structure            | `skills:skill-templates-source` | **Compliant**     | Physical directory structure.                                                                           |
| **TS-2** | Template metadata contract              | `skills:skill-templates-source` | **Non-compliant** | `kind` is missing from `skill.meta.json` files on disk; reader lacks validation.                        |
| **TS-3** | Capability-aware rendering              | `skills:skill-templates-source` | **Compliant**     | `TemplateRenderer.render()`.                                                                            |
| **TS-4** | Graph impact terminology in templates   | `skills:skill-templates-source` | **Compliant**     | `shared.md.tpl` (L497-505).                                                                             |
| **TS-5** | Frontmatter source                      | `skills:skill-templates-source` | **Compliant**     | Structured frontmatter variables.                                                                       |
| **TS-6** | Frontmatter injection                   | `skills:skill-templates-source` | **Compliant**     | `TemplateRenderer` L38-52.                                                                              |
| **TS-7** | Agent frontmatter matrix                | `skills:skill-templates-source` | **Compliant**     | Supported in plugin frontmatter type contracts.                                                         |
| **TS-8** | No frontmatter in skills package        | `skills:skill-templates-source` | **Compliant**     | Verified in templates on disk.                                                                          |
| **TS-9** | Implementation tracking instructions    | `skills:skill-templates-source` | **Compliant**     | `shared.md.tpl` (L139-199), `specd-implement/SKILL.md.tpl`, `specd-archive/SKILL.md.tpl`.               |

---

## 2. Detailed Implementation Status

### `skills:workflow-automation`

The requirements of workflow automation are successfully incorporated into the global `shared.md.tpl` file and the individual workflow templates (such as `specd-implement/SKILL.md.tpl` and `specd-archive/SKILL.md.tpl`).

- **Diagnostic Priority & Data Extraction**: Standardized text-based flags (`--format text`) are strictly recommended for all diagnostics, and `--format toon` is required for extraction.
- **Implementation Traceability**: Detailed steps instructing the use of `specd changes implementation add`, `review`, `resolve`, and `ignore` commands are present within both the implementation and archive templates.
- **On-demand outline retrieval**: Clear instructions exist directing the use of `specd specs outline`.

### `skills:agents`

- **Optimizer agents**: Both specialized agents (`specd-project-context-optimizer` and `specd-spec-context-optimizer`) are fully set up in the directory `packages/skills/templates/agents/`.
- ** smart caveman style**: Both system prompt templates utilize a terse, article-free style to enforce token savings of 50-70% at runtime.
- **Template Purity**: The agent templates contain no YAML block content and rely entirely on `{{{frontmatter}}}` injection, conforming to requirements.

### `skills:skill`

- **Domain Purity**: The file `src/domain/skill.ts` is a pure interface declaration file with zero I/O imports.
- **Lazy Content Loading**: Verified that templates are returned as instances of `FileSkillTemplate`, which only reads file contents on demand during `getContent()` resolution.
- **Typed Errors**: Error classes (e.g. `SkillNotFoundError`) inherit from `SpecdSkillsError` which in turn inherits from `@specd/core`'s `SpecdError`.

### `skills:skill-repository` & `skills:skill-repository-infra`

- **FS Backing**: `FsSkillRepository` reads from standard skills and agents directories, dynamically setting the `kind` field.
- **Bundle Rendering**: Employs Handlebars to normalize capabilities and compile output filenames (replacing `.tpl` with `.md`).
- **Discrepancy (Shared reference check)**: While `requiredSharedTemplates` are verified to exist, the repository does not physically parse the template body to confirm it doesn't reference other undeclared shared files.
- **Discrepancy (Interface return type)**: `createSkillRepository` exports `SkillRepository` instead of `SkillRepositoryPort`.

### `skills:skill-templates-source`

- **Discrepancy (Metadata `kind`)**: Standard skills' `skill.meta.json` files on disk do not specify the `"kind": "skill"` property, which is marked as mandatory in the templates source specification.
- **Terminology alignment**: Workflow templates successfully use `dependents` / `dependencies` and `--file` instead of `--changes`.
- **Frontmatter injection**: Checked that frontmatter blocks are correctly composed from `variables.frontmatter` and skipped when the `frontmatter` capability is missing.

---

## 3. Discrepancies Found

### Discrepancy 1: Missing `kind` property in standard skill metadata

- **Specification**: `skills:skill-templates-source`
  > Each skill or agent template directory MUST declare a metadata file (`skill.meta.json` or `specd-agent.meta.json`) with this shape:
  >
  > ```json
  > {
  >   "kind": "skill" | "agent",
  >   ...
  > }
  > ```
  >
  > `kind` (required) MUST categorize the template...
- **Code**: `packages/skills/templates/skills/*/skill.meta.json`
- **Rationale**: The `skill.meta.json` files on disk (e.g., `specd/skill.meta.json` and `specd-archive/skill.meta.json`) do not declare the `kind` property. Furthermore, the `SkillTemplateMetadataReader.validateMetadata` method ignores `value['kind']` from the JSON payload and uses the `kind` parameter passed down from repository discovery instead:
  ```typescript
  // packages/skills/src/infrastructure/repository/skill-template-metadata-reader.ts
  private validateMetadata(filename: string, value: unknown, kind: 'skill' | 'agent'): SkillTemplateMetadata {
    // ...
    return {
      kind, // from parameter, not value['kind']
      // ...
    }
  }
  ```
  This represents a minor contradiction between the spec requirement and the implementation.

### Discrepancy 2: No check for undeclared shared templates in template content

- **Specification**: `skills:skill-repository`
  > ...validate that templates do not rely on undeclared shared template requirements
- **Code**: `packages/skills/src/infrastructure/repository/skill-repository.ts` (`getBundle` method)
- **Rationale**: The `getBundle()` method ensures that all templates declared in `requiredSharedTemplates` exist, but it does not check if the template source itself references other shared templates (e.g., via `@{{sharedFolder}}/xxx.md`) that are _not_ declared in the metadata. Such references will silently fail to be resolved in the bundle since they are not loaded by the repository.

### Discrepancy 3: Port interface name mismatch in infra factory

- **Specification**: `skills:skill-repository-infra`
  > The module MUST export `createSkillRepository(): SkillRepositoryPort` as the main factory function.
  > Spec Dependencies: `skills:skill-repository-port`
- **Code**: `packages/skills/src/infrastructure/repository/skill-repository.ts` L394
  ```typescript
  export function createSkillRepository(options: SkillRepositoryOptions = {}): SkillRepository
  ```
- **Rationale**: The exported factory returns `SkillRepository`, not `SkillRepositoryPort`. In fact, there is no `SkillRepositoryPort` interface in the codebase at all (only `SkillRepository` exists in `src/application/ports/skill-repository.ts`).

---

## 4. Test Coverage Details

The package `@specd/skills` contains 23 tests, all of which are passing:

### Domain Model Tests (`test/domain/`)

- `test/domain/skill.spec.ts`
  - _lazy loading check_: "given SkillTemplate, when getContent is called, then it loads template lazily and returns Promise<string>" (**SK-4**)
  - _validation check_: "given missing required capabilities, when getBundle is called, then throws InvalidSkillTemplateMetadataError" (**SK-5**, **RE-3**)
- `test/domain/skill-bundle.spec.ts`
  - _install check_: "given a resolved bundle, when install is called, then files are written to target dir" (**TS-6**)
  - _uninstall check_: "given installed files, when uninstall is called twice, then uninstall is idempotent" (**TS-6**)

### Repository Integration Tests (`test/infrastructure/`)

- `test/infrastructure/skill-repository.spec.ts`
  - _list check_: "given canonical templates, when list is called, then returns metadata-only skills and agents" (**RE-1**, **TS-1**)
  - _get skill check_: "given a valid skill name, when get is called, then returns that skill with kind: skill" (**RE-2**, **SK-1**)
  - _get agent check_: "given a valid agent name, when get is called, then returns that agent with kind: agent" (**RE-2**, **SK-1**)
  - _missing check_: "given a missing name, when get is called, then returns undefined" (**RE-2**)
  - _lazy template suffix check_: "given skill templates migrated to .md.tpl, when list is called, then metadata still loads" (**RI-2**, **TS-1**)
  - _agent custom suffix check_: "given agent templates using custom convention, when list is called, then SPECD-AGENT.md.tpl is found" (**AG-4**, **TS-1**)
  - _bundle variables resolution_: "given unresolved variables, when getBundle is called, then placeholders are preserved" (**RE-3**)
  - _agent bundle emission_: "given agent bundle resolution, when getBundle is called, then SPECD-AGENT.md is emitted" (**AG-5**, **TS-3**)
  - _frontmatter capability absent_: "given variables.frontmatter without frontmatter capability, when getBundle is called, then frontmatter is not emitted" (**TS-6**)
  - _frontmatter capability present_: "given variables.frontmatter with frontmatter capability, when getBundle is called, then frontmatter is emitted only for non-shared files" (**TS-6**, **TS-8**)
  - _prose policy resolution_: "given capability-aware shared templates, when getBundle is called, then output contains prose policies" (**WA-9**, **TS-3**)
  - _shared files list_: "given shared templates, when listSharedFiles is called, then returns shared file entries" (**RE-4**)

### Use Case Tests (`test/resolve-bundle.spec.ts`)

- Tests in this file verify that `ResolveBundle` executes properly and correctly resolves `sharedFolder` relative to the configuration context (**RE-3**, **TS-3**).

---

## 5. Missing/Insufficient Tests

1.  **Undeclared Shared Templates check**: No test asserts that resolving a bundle with templates containing undeclared shared template references causes an error or is blocked (since the check itself is missing).
2.  **`kind` field presence in metadata**: No test asserts that a `skill.meta.json` or `specd-agent.meta.json` must contain a `kind` property or that loading fails when it is missing or invalid.
3.  **Port signature conformity**: No tests verify that `createSkillRepository` complies with any `SkillRepositoryPort` type signature since that symbol does not exist.

---

## 6. Summary Counts

- **Total Checked Requirements**: 35
- **Compliant Requirements**: 32
- **Non-compliant Requirements**: 3
- **Total Test Files**: 4
- **Total Tests Executed**: 23 (all passing)
- **Identified Discrepancies**: 3
