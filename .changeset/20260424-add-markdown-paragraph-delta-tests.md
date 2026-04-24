---
'@specd/core': minor
---

20260424 - add-markdown-paragraph-delta-tests: Add nature flags (isCollection, isSequence, isSequenceItem, isContainer, isLeaf) to NodeTypeDescriptor for declarative node-type classification. Replace all hardcoded type vectors in applyDelta with descriptor lookups, implement semantic validation (validateContent/Value/Rename) with error/warning matrix, and wrap apply return in DeltaApplicationResult. Warnings now propagate through change validate to the CLI.

Specs affected:

- `core:core/delta-format`
- `core:core/artifact-parser-port`
- `core:core/artifact-ast`
