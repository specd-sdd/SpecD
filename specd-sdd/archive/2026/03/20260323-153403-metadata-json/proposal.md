# Proposal: metadata-json

## Motivation

Per ADR-0019, machine-generated files should use JSON rather than YAML. Spec metadata is entirely machine-generated and machine-consumed — humans never edit it. Using YAML for metadata introduces unnecessary parsing ambiguity, requires the `yaml` library where `JSON.parse` is built-in, and mixes the format signal (YAML = human-editable, JSON = machine-only).

## Current behaviour

Metadata files are stored as `metadata.yaml` under `.specd/metadata/<specPath>/`. The entire metadata pipeline uses YAML:

- `FsSpecRepository.metadata()` reads with `parseYaml()`
- `SaveSpecMetadata` validates input with `YamlSerializer.parse()`
- `InvalidateSpecMetadata` re-serializes with `YamlSerializer.stringify()`
- `ArchiveChange` serializes generated metadata with `YamlSerializer.stringify()`
- `parseMetadata()` shared helper uses `parseYaml()`
- CLI `spec write-metadata` validates input with `parseYaml()`
- CLI `spec generate-metadata` serializes output with YAML `stringify()`

## Proposed solution

Switch all metadata serialization from YAML to JSON:

1. **File format** — `metadata.yaml` → `metadata.json`
2. **Reading** — `parseYaml()` → `JSON.parse()` in `FsSpecRepository`, `parseMetadata()`, `SaveSpecMetadata`
3. **Writing** — `YamlSerializer.stringify()` → `JSON.stringify(, null, 2)` in `InvalidateSpecMetadata`, `ArchiveChange`
4. **CLI input** — `spec write-metadata` validates JSON instead of YAML
5. **CLI output** — `spec generate-metadata` already outputs JSON (done)
6. **Remove `YamlSerializer` dependency** from `SaveSpecMetadata`, `InvalidateSpecMetadata`, and `ArchiveChange` — no longer needed for metadata
7. **Migration** — delete existing `.yaml` files, regenerate as `.json`

## Specs affected

### Modified specs

- `core:core/spec-metadata` — file format YAML → JSON, filename `metadata.yaml` → `metadata.json`
- `core:core/spec-repository-port` — `saveMetadata` contract clarified to accept JSON content
- `core:core/save-spec-metadata` — remove `YamlSerializer` dependency, validate with `JSON.parse`
- `core:core/invalidate-spec-metadata` — remove `YamlSerializer` dependency, serialize with `JSON.stringify`
- `core:core/archive-change` — serialize metadata as JSON instead of YAML
- `cli:cli/spec-write-metadata` — validate input as JSON instead of YAML

## Impact

| Layer                             | Change                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Spec** (`spec-metadata`)        | File format YAML → JSON, filename change                                                                                   |
| **Port** (`spec-repository-port`) | `saveMetadata` accepts JSON strings                                                                                        |
| **Use cases**                     | `SaveSpecMetadata`, `InvalidateSpecMetadata`, `ArchiveChange` — remove `YamlSerializer`, use `JSON.parse`/`JSON.stringify` |
| **Shared helper**                 | `parseMetadata()` — `parseYaml` → `JSON.parse`                                                                             |
| **Composition**                   | Remove `NodeYamlSerializer` wiring from factories and kernel                                                               |
| **CLI**                           | `write-metadata` validates JSON; `generate-metadata` already done                                                          |
| **Migration**                     | Delete `.yaml` metadata, regenerate as `.json`                                                                             |

## Open questions

None.
