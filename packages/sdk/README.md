# @specd/sdk

Core SDK for spec-driven development, code graph analysis, specification synthesis, and automated lifecycle orchestration.

## Features

- **SuggestSpecs (`openSuggestSpecs`, `SuggestSpecs`)**: Discovers candidate specifications and audits spec coverage gaps across multi-workspace polyglot codebases.
- **SuggestImplementationLinks (`createSuggestImplementationLinks`)**: Maps spec requirements to implementation source files using CodeGraph AST symbol evidence.
- **SuggestSpecDependencies (`createSuggestSpecDependencies`)**: Resolves inter-spec dependency DAGs with pure transitive reduction (`TransitiveReductionEngine`).
- **CodeGraph Integration**: High-performance SQLite-backed call graph indexing, impact analysis, and hotspot detection.

## Quick Start

```typescript
import { openSuggestSpecs } from '@specd/sdk'

// Initialize use case using project config
const suggestSpecs = openSuggestSpecs()

// Execute brownfield discovery across codebase
const result = await suggestSpecs.execute({
  ignoreCurrentSpecs: true,
  minConfidence: 0.8,
  limit: 10,
})

console.log(`Suggested ${result.summary.totalSpecsSuggested} specifications`)
for (const spec of result.suggestedSpecs) {
  console.log(`- ${spec.id} (${(spec.confidence * 100).toFixed(0)}%): ${spec.title}`)
}
```
