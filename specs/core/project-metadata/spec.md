# core:project-metadata

## Purpose

Project-level context can be large and benefit from LLM optimization. To avoid repeated manual assembly and allow for efficient agent consumption, we need a dedicated storage and schema for project-level metadata. The `project-metadata.json` file stores optimized context alongside freshness hashes to ensure the cached content remains valid as the project configuration or included specs change.

## Requirements

### Requirement: Persistence location

Project metadata SHALL be stored in a file named `project-metadata.json` within the resolved `configPath` of the project.

### Requirement: Data schema

The file SHALL use a structured schema containing:

- `version`: schema versioning
- `optimized`: a block containing LLM-generated content (e.g., `context`)
- `freshness`: a block containing SHA-256 hashes of all inputs used to generate the optimized content
- `generated`: timestamp and metadata about the generation event

### Requirement: Input tracking

The `freshness` block SHALL track:

- The hash of the `specd.yaml` configuration file
- The hashes of any `contextFiles` referenced in the configuration
- The metadata hashes of all specs included in the project context

### Requirement: Config-based factory delegates through resolveGetProjectMetadataDeps

The config-based `createGetProjectMetadata(config, options?)` form MUST derive `GetProjectMetadataDeps` through `resolveGetProjectMetadataDeps(resolver)` and then delegate to canonical `createGetProjectMetadata(deps)`.

`resolveGetProjectMetadataDeps(resolver)` MUST resolve:

- `config: SpecdConfig`
- `files: FileReader`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Spec Dependencies

- [`core:config`](../config/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
