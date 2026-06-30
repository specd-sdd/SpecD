---
'@specd/specd': minor
---

20260626 - 05-core-config-list-plugins: Removes kernel.project.listPlugins and the ListPlugins use case so plugin declarations are read from the in-memory SpecdConfig snapshot (getConfig or loadConfig). CLI plugins list, install, and update now use a local getDeclaredPlugins helper; kernel.project spec mapping is aligned with the implemented project surface.

Modified packages:

- @specd/core
- @specd/cli

Specs affected:

- `core:kernel`
- `cli:plugins-list`
- `cli:plugins-install`
- `cli:plugins-update`
