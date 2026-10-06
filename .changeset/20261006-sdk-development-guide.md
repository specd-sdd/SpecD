---
    "@specd/cli": patch
    "@specd/guide": patch
---

20261006 - sdk-development-guide: Add a 'specd guide-sdk' command serving an SDK/extension development guide for integrators — a build-time bundle of the package-reference docs (docs/sdk, docs/core, docs/code-graph, docs/skills, docs/schemas) plus a generated public API surface reference, addressable as collection:topic, with a discovery note in the 'specd guide' catalog output. Also refresh the @specd/guide README topic catalog.

Specs affected:

- `cli:guide-sdk`
- `cli:entrypoint`
- `guide:guide-model`
- `guide:bundle-guides`
- `guide:composition`
- `guide:conventions`
- `guide:list-guides`
- `guide:get-guide`
- `guide:get-guide-outline`
- `guide:search-guides`
- `guide:slice-guide-content`
- `default:_global/docs`
- `guide:errors`
- `cli:guide`
- `default:_global/architecture`
