# Services

`@specd/core` exports one domain service function: `hashFiles`. It is a pure function with no I/O dependencies.

## hashFiles

```typescript
import { hashFiles } from '@specd/core'

function hashFiles(files: Record<string, string>): Record<string, string>
```

Computes a SHA-256 hash for each entry in a map of file path → file content. Returns a new map of file path → `sha256:<hex-digest>`.

An empty input produces an empty result.

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `files` | `Record<string, string>` | A map of file path → UTF-8 file content. |

### Returns

`Record<string, string>` — a map of file path → `sha256:<hex>` for each input entry.

### Example

```typescript
import { hashFiles } from '@specd/core'

const hashes = hashFiles({
  'proposal.md': '# Proposal\n\nThis change adds OAuth login.',
  'spec.md': '# Auth / OAuth\n\n## Requirements\n\n...',
})

// hashes['proposal.md'] === 'sha256:a3f1...'
// hashes['spec.md']     === 'sha256:c7d2...'
```

### When to use it

Use `hashFiles` when constructing the `artifactHashes` field required by `ApproveSpec` and `ApproveSignoff`. The approval use cases expect hashes in this exact format so the recorded hashes are consistent with those computed internally by `ValidateArtifacts`.

```typescript
import { hashFiles, ApproveSpec } from '@specd/core'

// Load the current content of each artifact in the change
const proposalContent = await changeRepo.artifact(change, 'proposal.md')
const specContent = await changeRepo.artifact(change, 'spec.md')

const hashes = hashFiles({
  'proposal.md': proposalContent?.content ?? '',
  'spec.md': specContent?.content ?? '',
})

await approveSpec.execute({
  name: change.name,
  reason: 'Spec reviewed and approved.',
  artifactHashes: hashes,
  approvalsSpec: true,
})
```
