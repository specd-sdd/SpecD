---
    "@specd/code-graph": minor
    "@specd/cli": minor
    "@specd/skills": patch
---

20260424 - multi-language-call-resolution: Implements issues 52 and 54 by extending code-graph dependency resolution across the current built-in language adapters with deterministic binding/call facts, shared scoped resolution, and first-class USES_TYPE / CONSTRUCTS relations. The change also removes noisy self-relations and updates graph impact CLI/docs/skills to prefer the clearer dependents / dependencies direction aliases while preserving upstream / downstream compatibility.

Specs affected:

- `code-graph:code-graph/language-adapter`
- `code-graph:code-graph/indexer`
- `code-graph:code-graph/symbol-model`
- `cli:cli/graph-impact`
- `skills:skill-templates-source`
- `default:_global/docs`
