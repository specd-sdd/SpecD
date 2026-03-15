# Workspace Integration — Verification

## FileNode path format

WHEN a file `src/index.ts` is discovered in workspace `core` with codeRoot `/project/packages/core`
THEN `FileNode.path` SHALL be `core/src/index.ts`
AND `FileNode.workspace` SHALL be `core`

WHEN two workspaces `core` and `cli` both contain `src/index.ts`
THEN their FileNode paths SHALL be `core/src/index.ts` and `cli/src/index.ts` respectively
AND both SHALL be stored in the same graph without conflict

## SymbolNode ID format

WHEN a function `main` is found at line 1 of `src/index.ts` in workspace `core`
THEN `SymbolNode.id` SHALL be `core/src/index.ts:function:main:1`
AND `SymbolNode.filePath` SHALL be `core/src/index.ts`

## SpecNode workspace

WHEN a spec is discovered in workspace `core`
THEN `SpecNode.workspace` SHALL be `core`

WHEN a spec is discovered in workspace `_global`
THEN `SpecNode.workspace` SHALL be `_global`

## Multi-workspace indexing

WHEN IndexOptions contains workspaces `[{name: 'core', ...}, {name: 'cli', ...}]`
THEN the indexer SHALL discover files from each workspace's codeRoot separately
AND prefix all paths with the workspace name
AND store all results in a single bulkLoad call

WHEN IndexOptions contains a single workspace
THEN the indexer SHALL behave identically to multi-workspace with one entry

## Cross-workspace import resolution

WHEN workspace `cli` imports `createKernel` from `@specd/core`
AND the monorepo map resolves `@specd/core` to the `core` workspace prefix
THEN the import SHALL resolve to the symbol in `core/src/...`

## Per-workspace result breakdown

WHEN indexing completes for workspaces `core` (100 files) and `cli` (50 files)
THEN `IndexResult.workspaces` SHALL contain two entries
AND each entry SHALL report its own filesDiscovered, filesIndexed, filesSkipped, filesRemoved, specsDiscovered, specsIndexed

## Spec resolution via SpecRepository

WHEN a workspace provides a `specs` callback backed by SpecRepository
THEN the indexer SHALL call it to get specs instead of walking the filesystem
AND the returned specs SHALL be stored with the workspace name

WHEN a spec has artifacts `spec.md`, `verify.md`, and `.specd-metadata.yaml`
THEN the contentHash SHALL be computed from all artifacts concatenated
AND `spec.md` SHALL be ordered first, then the rest alphabetically

WHEN `core` and `cli` both have a spec named `spec-metadata`
THEN specIds SHALL be `core:core/spec-metadata` and `cli:cli/spec-metadata` respectively
AND no primary key collision SHALL occur

## Single-workspace indexing isolation

WHEN indexing with `--workspace core`
THEN only files with workspace `core` SHALL be considered for deletion
AND files from `cli` and `code-graph` workspaces SHALL remain untouched in the store

## .gitignore handling

WHEN codeRoot is `/project/packages/core` and git root is `/project`
THEN `.gitignore` from `/project` SHALL be loaded and applied
AND any `.gitignore` files in subdirectories SHALL also be applied

## Backward compatibility

WHEN an existing `.specd/code-graph.lbug` has paths without workspace prefixes
THEN `--force` re-index SHALL be required to rebuild with the new format
