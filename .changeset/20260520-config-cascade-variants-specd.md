---
'@specd/specd': minor
---

20260520 - config-cascade-variants: Add layered config cascade for specd.yaml variants with standalone local fallback. Introduces extends (true and explicit path), remove directives, deep merge semantics, and ordered candidate discovery (specd.yaml → specd._.yaml → specd.local.yaml → specd.local._.yaml). Backward-compatible: specd.local.yaml without extends remains a standalone replacement.

Modified packages:

- @specd/core

Specs affected:

- `core:config`
- `core:config-loader`
- `core:init-project`
- `core:config-writer-port`
