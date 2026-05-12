# Proposal: spec-show-artifact-flag

## Motivation

Users and scripts currently have to manually parse the output of `specd spec show` to extract specific artifact content. This is error-prone and inefficient, especially for automated workflows that only need one part of a spec (e.g., just the requirements or just the verification scenarios).

## Current behaviour

The `specd spec show <specId>` command prints all artifacts declared with scope `spec` in the schema. In `text` mode, it uses headers like `--- spec.md ---` to separate them. In `json`/`toon` mode, it returns an array of all artifacts. There is no way to filter for a single artifact ID.

## Proposed solution

Add an `--artifact <artifactId>` flag to `specd spec show`.

- The CLI will look up the `<artifactId>` in the active schema.
- It will resolve the artifact's filename based on the schema's `output` pattern.
- Only the content of the matching artifact will be printed.
- If the artifact does not exist on disk, the command will exit with an error or skip it based on standard `show` behavior, but specifically for that requested artifact.

## Specs affected

### New specs

_none_

### Modified specs

- `cli:cli/spec-show`: Add `--artifact <name>` flag requirement and behavior description.
  - Depends on (added): none

## Impact

- `specd spec show` command implementation in `packages/cli`.
- Potential addition to the core use case if filtering logic is moved there (though standard `show` often handles filtering in the delivery layer).

## Technical context

- The artifact ID (e.g., `specs`, `verify`) must be resolved to the filename (e.g., `spec.md`, `verify.md`) using the schema definition.
- Standard `@specd/schema-std` mapping:
  - `specs` -> `spec.md`
  - `verify` -> `verify.md`
- The flag should support all output formats (`text`, `json`, `toon`).

## Open questions

- Should we exit with code 1 if the requested artifact ID exists in the schema but the file is missing on disk? (Standard `show` skips missing files silently, but an explicit request for one might warrant an error).
