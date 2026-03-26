# Services

`@specd/core` exports a set of domain service functions. All are pure functions with no I/O dependencies — they accept typed values and return new values without side effects.

Services are organised into logical groups below.

---

## Hashing

### hashFiles

```typescript
import { hashFiles } from '@specd/core'

function hashFiles(
  files: Record<string, string>,
  hashContent: (content: string) => string,
): Record<string, string>
```

Applies `hashContent` to each entry in a map of file path → file content. Returns a new map of file path → hash string. An empty input produces an empty result.

The `hashContent` function is injected so the caller controls the hashing algorithm. The built-in `NodeContentHasher` from the composition layer produces `sha256:<hex>` strings and is the standard choice.

| Parameter     | Type                          | Description                                                   |
| ------------- | ----------------------------- | ------------------------------------------------------------- |
| `files`       | `Record<string, string>`      | A map of file path → UTF-8 file content.                      |
| `hashContent` | `(content: string) => string` | A function that computes a hash string for the given content. |

**Returns:** `Record<string, string>` — a map of file path → hash string for each input entry.

```typescript
import { hashFiles, NodeContentHasher } from '@specd/core'

const hasher = new NodeContentHasher()
const hashes = hashFiles(
  {
    'proposal.md': '# Proposal\n\nThis change adds OAuth login.',
    'spec.md': '# Auth / OAuth\n\n## Requirements\n\n...',
  },
  (content) => hasher.hash(content),
)

// hashes['proposal.md'] === 'sha256:a3f1...'
// hashes['spec.md']     === 'sha256:c7d2...'
```

---

### applyPreHashCleanup

```typescript
import { applyPreHashCleanup } from '@specd/core'

function applyPreHashCleanup(content: string, cleanups: readonly PreHashCleanup[]): string
```

Applies a sequence of regex-based substitutions to artifact content before hashing. Pre-hash cleanup rules are declared in the schema and strip variable content (timestamps, volatile whitespace, etc.) so that cosmetic changes do not invalidate recorded hashes.

| Parameter  | Type                        | Description                                    |
| ---------- | --------------------------- | ---------------------------------------------- |
| `content`  | `string`                    | The raw artifact content to clean.             |
| `cleanups` | `readonly PreHashCleanup[]` | Pre-hash cleanup rules from the active schema. |

**Returns:** `string` — the cleaned content with all substitutions applied.

---

## Schema building

### buildSchema

```typescript
import { buildSchema } from '@specd/core'

function buildSchema(
  ref: string,
  data: SchemaYamlData,
  templates: ReadonlyMap<string, string>,
): Schema
```

Constructs a fully-typed `Schema` value object from validated intermediate data and pre-loaded template file contents. This is a pure function — all I/O (reading the YAML file, loading templates) must be done before calling it.

Performs semantic validation: duplicate artifact IDs, circular `requires` dependencies, duplicate workflow step names, duplicate hook IDs, and invalid step names. Throws `SchemaValidationError` on any violation.

| Parameter   | Type                          | Description                                          |
| ----------- | ----------------------------- | ---------------------------------------------------- |
| `ref`       | `string`                      | The schema reference string, used in error messages. |
| `data`      | `SchemaYamlData`              | The validated intermediate data from YAML parsing.   |
| `templates` | `ReadonlyMap<string, string>` | Map from template relative path to file content.     |

**Returns:** `Schema` — a fully-constructed schema instance.

**Throws:** `SchemaValidationError` — when semantic validation fails.

---

### mergeSchemaLayers

```typescript
import { mergeSchemaLayers } from '@specd/core'

function mergeSchemaLayers(base: SchemaYamlData, layers: readonly SchemaLayer[]): SchemaYamlData
```

Applies an ordered sequence of customisation layers to a base schema's intermediate representation. Each layer carries a source type (`'extends'`, `'plugin'`, or `'override'`) and a set of merge operations. Operations within each layer are applied in fixed order: `remove` → `create` → `prepend` → `append` → `set`.

After all layers are applied, validates the result for duplicate IDs and dangling `requires` references.

| Parameter | Type                     | Description                           |
| --------- | ------------------------ | ------------------------------------- |
| `base`    | `SchemaYamlData`         | The base schema data to customise.    |
| `layers`  | `readonly SchemaLayer[]` | Ordered layers to apply, in sequence. |

**Returns:** `SchemaYamlData` — the merged intermediate representation.

**Throws:** `SchemaValidationError` — on identity collisions, missing entries, or post-merge violations.

---

### buildSelector

```typescript
import { buildSelector } from '@specd/core'

function buildSelector(raw: SelectorRaw): Selector
```

Converts a raw selector shape (as produced by the YAML parser) into the typed domain `Selector` value object. Recursively converts the optional `parent` field.

---

## Spec ID parsing

### parseSpecId

```typescript
import { parseSpecId } from '@specd/core'

function parseSpecId(
  specId: string,
  defaultWorkspace?: string,
): { workspace: string; capPath: string }
```

Splits a spec identifier of the form `workspace:capabilityPath` into its two components. When the identifier contains no colon, `defaultWorkspace` (defaults to `'default'`) is used as the workspace name and the entire string is treated as the capability path.

| Parameter          | Type     | Description                                                        |
| ------------------ | -------- | ------------------------------------------------------------------ |
| `specId`           | `string` | A spec identifier, e.g. `"billing:payments/checkout"`.             |
| `defaultWorkspace` | `string` | Workspace to use when `specId` has no colon. Default: `'default'`. |

**Returns:** `{ workspace: string; capPath: string }`

```typescript
import { parseSpecId } from '@specd/core'

parseSpecId('billing:payments/checkout')
// → { workspace: 'billing', capPath: 'payments/checkout' }

parseSpecId('auth/oauth')
// → { workspace: 'default', capPath: 'auth/oauth' }
```

---

## Spec content

### extractSpecSummary

```typescript
import { extractSpecSummary } from '@specd/core'

function extractSpecSummary(content: string): string | null
```

Extracts a short summary from the content of a `spec.md` file.

Resolution order (first match wins):

1. First non-empty paragraph immediately after the `# H1` heading.
2. First paragraph of the first `## Overview`, `## Summary`, or `## Purpose` section.

Returns `null` when no summary can be extracted.

| Parameter | Type     | Description                            |
| --------- | -------- | -------------------------------------- |
| `content` | `string` | Raw Markdown content of the spec file. |

**Returns:** `string | null` — a single-line summary, or `null` if none was found.

---

### shiftHeadings

```typescript
import { shiftHeadings } from '@specd/core'

function shiftHeadings(markdown: string, delta: number): string
```

Shifts all Markdown ATX heading levels in a text block by a given delta. Lines inside fenced code blocks are left untouched. Heading levels are clamped to 1–6.

| Parameter  | Type     | Description                                         |
| ---------- | -------- | --------------------------------------------------- |
| `markdown` | `string` | The Markdown text to transform.                     |
| `delta`    | `number` | Amount to shift heading levels (positive = deeper). |

**Returns:** `string` — transformed Markdown with adjusted heading levels.

---

### inferFormat

```typescript
import { inferFormat } from '@specd/core'

function inferFormat(filename: string): ArtifactFormat | undefined
```

Infers the artifact format name from a filename extension. Recognises `.md` → `'markdown'`, `.json` → `'json'`, `.yaml` / `.yml` → `'yaml'`, and `.txt` → `'plaintext'`. Returns `undefined` for unrecognised extensions.

---

## Metadata extraction

### extractMetadata

```typescript
import { extractMetadata } from '@specd/core'

function extractMetadata(
  extraction: MetadataExtraction,
  astsByArtifact: ReadonlyMap<string, { root: SelectorNode }>,
  renderers: ReadonlyMap<string, SubtreeRenderer>,
  transforms?: ReadonlyMap<string, (values: string[]) => string[]>,
): ExtractedMetadata
```

Orchestrates metadata extraction across multiple artifact ASTs. For each declared field in the schema's `metadataExtraction` block, looks up the corresponding artifact AST, runs the configured extractor, and assembles the result into an `ExtractedMetadata` object.

| Parameter        | Type                                                             | Description                                           |
| ---------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| `extraction`     | `MetadataExtraction`                                             | The schema's metadata extraction declarations.        |
| `astsByArtifact` | `ReadonlyMap<string, { root: SelectorNode }>`                    | Parsed ASTs keyed by artifact type ID.                |
| `renderers`      | `ReadonlyMap<string, SubtreeRenderer>`                           | Subtree renderers keyed by artifact type ID.          |
| `transforms`     | `ReadonlyMap<string, (values: string[]) => string[]>` (optional) | Named transform callbacks, e.g. spec-path resolution. |

**Returns:** `ExtractedMetadata` — all available metadata fields populated.

---

### extractContent

```typescript
import { extractContent } from '@specd/core'

function extractContent(
  root: SelectorNode,
  extractor: Extractor,
  renderer: SubtreeRenderer,
  transforms?: ReadonlyMap<string, (values: string[]) => string[]>,
): string[] | GroupedExtraction[] | StructuredExtraction[]
```

Generic extraction engine — runs a single extractor configuration against an AST root. Supports simple string extraction, grouped extraction (nodes grouped by label), and structured extraction (field-mapped objects). Used internally by `extractMetadata` and available for custom extraction when building a port.

---

## Metadata parsing

### specMetadataSchema

```typescript
import { specMetadataSchema } from '@specd/core'
```

A lenient Zod schema for parsing `metadata.json` files. Accepts unknown extra fields (`passthrough`). Used by the read path — never throws on partially-valid or legacy metadata files.

### strictSpecMetadataSchema

```typescript
import { strictSpecMetadataSchema } from '@specd/core'
```

A strict Zod schema for validating `metadata.json` content before writing. Requires `title` and `description` to be non-empty strings. Used by `SaveSpecMetadata`.

---

## AST selector matching

### findNodes

```typescript
import { findNodes } from '@specd/core'

function findNodes(root: SelectorNode, selector: Selector): SelectorNode[]
```

Finds all nodes matching the given selector within a root node, returned in document order.

---

### nodeMatches

```typescript
import { nodeMatches } from '@specd/core'

function nodeMatches(
  node: SelectorNode,
  selector: Selector,
  ancestors?: readonly SelectorNode[],
): boolean
```

Returns `true` if a single node matches all criteria in a selector.

---

### selectBySelector

```typescript
import { selectBySelector } from '@specd/core'

function selectBySelector(root: SelectorNode, selector: Selector): SelectorNode[]
```

Selects nodes from the AST using a selector, supporting parent-scoped selection and `selector.index` for targeting a specific match. Used by the rule evaluator.

---

### collectAllNodes

```typescript
import { collectAllNodes } from '@specd/core'

function collectAllNodes(root: SelectorNode): SelectorNode[]
```

Recursively collects all nodes in the AST, including the root, in document order.

---

## Validation rule evaluation

### evaluateRules

```typescript
import { evaluateRules } from '@specd/core'

function evaluateRules(
  rules: readonly ValidationRule[],
  root: SelectorNode,
  artifactId: string,
  parser: RuleEvaluatorParser,
): RuleEvaluationResult
```

Evaluates a list of validation rules against an AST root. Returns all failures (required rules not satisfied) and warnings (optional rules not satisfied).

| Parameter    | Type                        | Description                                                |
| ------------ | --------------------------- | ---------------------------------------------------------- |
| `rules`      | `readonly ValidationRule[]` | The rules to evaluate.                                     |
| `root`       | `SelectorNode`              | The AST root to evaluate against.                          |
| `artifactId` | `string`                    | The artifact type ID, used in failure/warning attribution. |
| `parser`     | `RuleEvaluatorParser`       | Provides `renderSubtree()` for `contentMatches` checks.    |

**Returns:** `RuleEvaluationResult` — `{ failures: RuleEvaluationFailure[], warnings: RuleEvaluationWarning[] }`.

---

## Utilities

### safeRegex

```typescript
import { safeRegex } from '@specd/core'

function safeRegex(pattern: string, flags?: string): RegExp | null
```

Attempts to compile a user-supplied pattern string into a `RegExp`. Returns `null` when the pattern is syntactically invalid or contains nested quantifiers that could cause catastrophic backtracking (ReDoS). Safe to use with schema-declared patterns.

---

### selectByJsonPath

```typescript
import { selectByJsonPath } from '@specd/core'

function selectByJsonPath(root: SelectorNode, path: string): SelectorNode[]
```

Navigates an AST using a simplified JSONPath expression (e.g. `$.children[*]`). Used internally by `selectNodes` when validation rules specify a `path` rather than a `selector`.

---

### tokenizeJsonPath

```typescript
import { tokenizeJsonPath } from '@specd/core'

function tokenizeJsonPath(path: string): string[]
```

Tokenises a JSONPath expression into its component segments. Exported for use in custom validation tooling.
