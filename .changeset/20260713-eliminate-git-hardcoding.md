---
    "@specd/core": patch
    "@specd/code-graph": patch
    "@specd/cli": patch
---

20260713 - eliminate-git-hardcoding: This change removes git-specific hardcoding from config loading, actor resolution, and graph indexing by routing repository detection and identity lookups through the VcsAdapter contract. It introduces VCS-neutral root handling across git, hg, svn, and null environments, replaces the public default config-loader factory name with createDefaultConfigLoader, and aligns first-party code, tests, and documentation with that contract. The result is one shared VCS detection path with less duplicated composition logic and consistent behavior across CLI, SDK, and code-graph entry points.

Specs affected:

- `core:vcs-adapter-port`
- `core:vcs-adapter`
- `core:actor-resolver-port`
- `core:actor-resolver`
- `core:actor-resolver-git`
- `core:actor-resolver-hg`
- `core:actor-resolver-svn`
- `core:actor-provider`
- `core:config-loader`
- `code-graph:indexer`
- `core:config`
- `code-graph:workspace-integration`
- `cli:entrypoint`
- `cli:host-context`
- `core:vcs-actor-resolver`
- `core:composition`
- `sdk:host-context`
