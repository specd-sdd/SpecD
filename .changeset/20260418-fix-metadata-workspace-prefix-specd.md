---
    "@specd/specd": patch
---
20260418- - fix-metadata-workspace-prefix: Fix metadata storage path to include workspace name — metadata should be stored at .specd/metadata/<workspace>/<prefix>/<spec> not just .specd/metadata/<prefix>/<spec>

Modified packages: 
- @specd/core

Specs affected:
- `core:core/spec-metadata`

