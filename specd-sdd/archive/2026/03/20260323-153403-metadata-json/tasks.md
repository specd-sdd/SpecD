# Tasks: metadata-json

## 1. Core use cases

- [x] 1.1 Change `_metadataFilePath()` from `metadata.yaml` to `metadata.json`
- [x] 1.2 Replace YAML parse with JSON parse in `FsSpecRepository.metadata()`

- [x] 1.3 Update `SaveSpecMetadata` — remove `YamlSerializer`, use `JSON.parse`
- [x] 1.4 Update `InvalidateSpecMetadata` — remove `YamlSerializer`, use `JSON.stringify`
- [x] 1.5 Update `ArchiveChange` — use `JSON.stringify` for metadata serialization
- [x] 1.6 Update `parseMetadata` shared helper — `parseYaml` → `JSON.parse`

## 2. Composition wiring

- [x] 2.1 Remove `NodeYamlSerializer` from `save-spec-metadata` factory
- [x] 2.2 Remove `NodeYamlSerializer` from `invalidate-spec-metadata` factory
- [x] 2.3 Update kernel constructor calls

## 3. CLI

- [x] 3.1 Replace YAML stringify with JSON stringify in `generate-metadata`
- [x] 3.2 Update `write-metadata` — `parseYaml` → `JSON.parse`, error messages

## 4. Tests

- [x] 4.1 Update `save-spec-metadata` tests
- [x] 4.2 Update `invalidate-spec-metadata` tests
- [x] 4.3 Update `parse-metadata` tests
- [x] 4.4 Update `write-metadata` CLI tests
- [x] 4.5 Run full test suite
