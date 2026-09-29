---
'@specd/specd': patch
---

20260925 - windows-platform-compatibility: Normalize VCS roots and path containment, run hooks safely under cmd.exe, and make atomic writes, hashes, and graph locks work on Windows.

Modified packages:

- @specd/core
- @specd/code-graph

Specs affected:

- `core:config-loader`
- `core:vcs-adapter`
- `core:hook-runner-port`
- `core:template-variables`
- `core:content-hasher-port`
- `core:snapshot-hasher`
- `core:fs-change-repository`
- `core:fs-spec-repository`
- `core:fs-archive-repository`
- `core:file-reader-port`
- `core:refresh-implementation-tracking`
- `core:change`
- `code-graph:sqlite-graph-store`
- `code-graph:isolated-index-worker`
- `code-graph:indexer`
- `code-graph:workspace-integration`
- `default:_global/testing`
- `core:workspace`
- `core:spec-id-format`
- `default:_global/continuous-integration`
- `core:hook-execution-model`
- `core:run-step-hooks`
- `default:_global/docs`
