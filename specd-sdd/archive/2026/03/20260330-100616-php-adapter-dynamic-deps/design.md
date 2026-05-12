# Design: php-adapter-dynamic-deps

## Overview

Five coordinated changes:

1. **`LanguageAdapter` interface** — add optional method `resolveQualifiedNameToPath?`
2. **`PhpLanguageAdapter`** — implement PSR-4 resolution and require/include detection
3. **`PhpLanguageAdapter` dynamic loaders** — resolve loader calls to file-level `IMPORTS` when possible
4. **`PhpLanguageAdapter` loaded-instance calls** — infer method-local alias calls and emit `CALLS` heuristically
5. **`IndexCodeGraph` use case** — wire `resolveQualifiedNameToPath` into Pass 2 as fallback for unresolved PHP imports

---

## 1. `LanguageAdapter` interface

**File:** `packages/code-graph/src/domain/value-objects/language-adapter.ts`

Add one optional method after `buildQualifiedName?`:

```typescript
/**
 * Resolves a fully qualified class/type name to an absolute file path
 * by reading the language's autoloader configuration (e.g. composer.json PSR-4).
 * Complements the in-memory qualified name map: handles classes not present
 * in the indexed codebase. Performs I/O. SHOULD cache the parsed map per codeRoot.
 * @param qualifiedName - Fully qualified name (e.g. `App\Models\User`)
 * @param codeRoot - Absolute path to the workspace's code root.
 * @param repoRoot - Optional repo root to bound the manifest search.
 * @returns Absolute file path, or undefined if unresolvable.
 */
resolveQualifiedNameToPath?(
  qualifiedName: string,
  codeRoot: string,
  repoRoot?: string,
): string | undefined
```

---

## 2. `PhpLanguageAdapter`

**File:** `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`

### 2a. PSR-4 resolution

Add a private cache field at the top of the class:

```typescript
private readonly psr4Cache = new Map<string, Array<[string, string]>>()
```

Add a private helper `buildPsr4Map(codeRoot: string, repoRoot?: string): Array<[string, string]>`:

- Use `findManifestField` (already imported) to find `composer.json` at or above `codeRoot`
- Parse JSON, merge `autoload['psr-4']` and `autoload-dev['psr-4']` into one object
- Return an array of `[namespacePrefix, absoluteDir]` tuples, sorted by prefix length descending (longest first for greedy match)
- Cache under `codeRoot` key
- Return `[]` if no `composer.json` found or sections absent

Implement `resolveQualifiedNameToPath(qualifiedName, codeRoot, repoRoot?)`:

```typescript
resolveQualifiedNameToPath(qualifiedName: string, codeRoot: string, repoRoot?: string): string | undefined {
  const map = this.psr4Cache.get(codeRoot) ?? this.buildPsr4Map(codeRoot, repoRoot)
  for (const [prefix, dir] of map) {
    if (qualifiedName.startsWith(prefix)) {
      const relative = qualifiedName.slice(prefix.length).replace(/\\/g, path.sep)
      return path.join(dir, relative + '.php')
    }
  }
  return undefined
}
```

`findManifestField` currently reads a single field. For PSR-4 we need both `autoload.psr-4` and `autoload-dev.psr-4`. Use `findManifestField` with a callback that reads both sections:

```typescript
private buildPsr4Map(codeRoot: string, repoRoot?: string): Array<[string, string]> {
  const entries = findManifestField(
    codeRoot,
    'composer.json',
    (content) => {
      const pkg = JSON.parse(content) as {
        autoload?: { 'psr-4'?: Record<string, string> }
        'autoload-dev'?: { 'psr-4'?: Record<string, string> }
      }
      const merged = { ...pkg.autoload?.['psr-4'], ...pkg['autoload-dev']?.['psr-4'] }
      return Object.keys(merged).length > 0 ? merged : undefined
    },
    repoRoot,
  )
  if (!entries) {
    this.psr4Cache.set(codeRoot, [])
    return []
  }
  const map: Array<[string, string]> = Object.entries(entries).map(([prefix, relDir]) => [
    prefix,
    path.resolve(codeRoot, relDir),
  ])
  map.sort((a, b) => b[0].length - a[0].length)
  this.psr4Cache.set(codeRoot, map)
  return map
}
```

**Note:** `path` import (`node:path`) must be added.

### 2b. `extractRelations` — use content

`extractRelations` currently ignores `_content`. Change the parameter name to `content` and use it to:

1. Parse the AST once
2. Walk for require/include expressions
3. Walk for dynamic loader call patterns
4. Combine with existing DEFINES relations

New signature (parameter rename, no interface change):

```typescript
extractRelations(
  filePath: string,
  content: string,       // was _content
  symbols: SymbolNode[],
  importMap: Map<string, string>,
): Relation[]
```

### 2c. require/include detection

Add private method `extractRequireRelations(filePath: string, root: SgNode): Relation[]`:

- Walk all nodes recursively
- Match kinds: `require_expression`, `require_once_expression`, `include_expression`, `include_once_expression`
- For each, get the first child that is a `string` kind node
- Extract the string value (strip surrounding quotes)
- If the value contains `$` or concatenation operators (`.`), skip silently
- Resolve relative to the file's directory. Since `filePath` is workspace-prefixed (e.g. `myapp:app/controllers/Posts.php`), strip the workspace prefix to get the path, then use `path.resolve(path.dirname(strippedPath), value)` to get the absolute path. Emit `IMPORTS` from `filePath` to the resolved path.
- For absolute paths (starts with `/`), use as-is

**Implementation note:** the file path in IMPORTS should be workspace-prefixed for consistency with how other IMPORTS are stored. Since we only have the absolute resolved path here (not workspace-relative), emit the absolute path as the target — the indexer's file-existence check will handle non-existent targets gracefully.

### 2d. Dynamic loader detection

Add private method `extractDynamicLoaderRelations(filePath: string, root: SgNode): Relation[]`:

Use a static lookup table (defined once as a module-level constant):

```typescript
const DYNAMIC_LOADER_PATTERNS: ReadonlyArray<{
  via: string
  matchMethod: string
  matchClass?: string
  chained?: string // for $this->load->model: matchClass='load', matchMethod='model', chained='load'
  globalFn?: true // for plain function calls like uses() and vendor()
}> = [
  { via: 'loadModel', matchMethod: 'loadModel' },
  { via: 'load.model', matchMethod: 'model', chained: 'load' },
  { via: 'load.library', matchMethod: 'library', chained: 'load' },
  { via: 'load.helper', matchMethod: 'helper', chained: 'load' },
  { via: 'App::uses', matchMethod: 'uses', matchClass: 'App' },
  { via: 'ClassRegistry::init', matchMethod: 'init', matchClass: 'ClassRegistry' },
  { via: 'Yii::import', matchMethod: 'import', matchClass: 'Yii' },
  { via: 'Yii::createObject', matchMethod: 'createObject', matchClass: 'Yii' },
  { via: 'Zend_Loader::loadClass', matchMethod: 'loadClass', matchClass: 'Zend_Loader' },
  { via: 'Drupal::service', matchMethod: 'service', matchClass: 'Drupal' },
  { via: 'uses', matchMethod: 'uses', globalFn: true },
  { via: 'vendor', matchMethod: 'vendor', globalFn: true },
  { via: 'loadModel', matchMethod: 'loadModel', globalFn: true },
  { via: 'App::import', matchMethod: 'import', matchClass: 'App', valueArgIndex: 1 },
  { via: 'Mage::getModel', matchMethod: 'getModel', matchClass: 'Mage' },
  { via: 'Mage::getSingleton', matchMethod: 'getSingleton', matchClass: 'Mage' },
  { via: 'Mage::helper', matchMethod: 'helper', matchClass: 'Mage' },
  {
    via: 'module_load_include',
    matchMethod: 'module_load_include',
    globalFn: true,
    moduleLoadInclude: true,
  },
  { via: 'drupal_load', matchMethod: 'drupal_load', globalFn: true, valueArgIndex: 1 },
  { via: 't3lib_div::makeInstance', matchMethod: 'makeInstance', matchClass: 't3lib_div' },
  {
    via: 'GeneralUtility::makeInstance',
    matchMethod: 'makeInstance',
    matchClass: 'GeneralUtility',
  },
]
```

The `valueArgIndex` field (default `0`) specifies which argument index provides the `value` for metadata. Special cases:

- `App::import`: `valueArgIndex: 1` — arg[0] is the type string (`'Model'`), arg[1] is the class name
- `drupal_load`: `valueArgIndex: 1` — arg[0] is the resource type, arg[1] is the name
- `module_load_include`: the `moduleLoadInclude: true` flag signals special handling — `value` is `arg[1] + '/' + arg[2]`

Walk AST for:

- **`member_call_expression`** — check if the method name matches, and if `chained` is set, check that the object is itself a member access with the chained name (for `$this->load->model`)
- **`static_call_expression`** — check class and method name match
- **`function_call_expression`** — for entries with `globalFn: true`, check that the function name matches (e.g. `uses`, `vendor`) with no receiver/class

For each match, extract the first argument. If it is a `string` kind node, get the value (strip quotes), resolve to candidate file path(s), and emit `IMPORTS` only when the target exists/is indexable:

```typescript
createRelation({
  source: filePath,
  target: resolvedTargetPath,
  type: RelationType.Imports,
})
```

If no target path can be resolved, skip relation emission for that match.

### 2e. Loaded-instance call extraction (heuristic)

Add private method `extractLoadedInstanceCalls(filePath: string, content: string, symbols: SymbolNode[]): Relation[]`:

- Scope analysis to each `function_definition` / `method_declaration` body independently
- Detect dynamic loader invocations already covered in 2d and build a local map:
  - logical dependency name (e.g. `Article`)
  - resolved target class symbol(s) for that dependency
  - known aliases used in code (`$this->Article`, `$Article`, locally assigned vars)
- Walk member calls in the same body:
  - `$this->Article->save(...)`
  - `$Article->find(...)`
  - `$model->delete(...)` when `$model` is assigned from a known loaded alias
- Resolve called method name against candidate target class symbols and emit:

```typescript
createRelation({
  source: callerSymbolId,
  target: calleeSymbolId,
  type: RelationType.Calls,
})
```

Rules:

- Only emit `CALLS` when both caller symbol and callee symbol are resolved.
- No interprocedural propagation in this change (no cross-method alias tracking).
- Ignore highly ambiguous aliases to avoid noisy false positives.

### 2f. importMap usage in `extractRelations`

For completeness (and to satisfy the spec requirement that `extractRelations` uses the importMap), iterate over `ImportDeclaration` entries that are resolved in `importMap` and emit `IMPORTS` relations:

```typescript
for (const [localName, targetId] of importMap) {
  // targetId may be a symbol id — IMPORTS is file→file, so extract file from id
  const targetFile = targetId.substring(0, targetId.lastIndexOf(':function:'))
    || targetId.substring(0, targetId.lastIndexOf(':class:'))
    || ... // parse id format: "workspace:path:kind:name:line"
  // Simpler: extract file portion before the third colon segment
  relations.push(createRelation({ source: filePath, target: targetFile, type: RelationType.Imports }))
}
```

**Actually**, on reflection: the PHP adapter's job is to emit relations, not re-derive them from the importMap. The importMap entries were already turned into IMPORTS by the indexer for TS. For PHP, the IMPORTS from `use` statements are best emitted directly by the indexer after resolving, not by the adapter. So the adapter does NOT need to iterate importMap to emit IMPORTS — the PSR-4 path is handled in the indexer (step 3 below). Leave importMap unused in PHP's `extractRelations`.

### 2g. Extensible loader resolver registry

Refactor loader matching into a registry-based design:

- Define `LoaderResolver` shape:
  - `id`, `framework`, `detect(...)`, `extractValue(...)`, `resolveTarget(...)`, `targetKind`
- Keep extractor flow generic:
  - detect loader call
  - resolve file/symbol target
  - emit `IMPORTS` and optional loaded-instance alias metadata for subsequent `CALLS`
- Ship initial resolver set for current patterns and extend with:
  - CakePHP: `loadController`, `loadComponent`
  - existing `loadModel`/`App::uses`/`ClassRegistry::init`
  - placeholders for framework-specific future resolvers

This keeps framework growth additive and avoids coupling extraction logic to one loader API.

---

## 3. `IndexCodeGraph` — Pass 2 wiring

**File:** `packages/code-graph/src/application/use-cases/index-code-graph.ts`

### 3a. Thread `codeRoot` and `repoRoot` into `resolveImports`

The workspace info is available in Pass 2 via `options.workspaces`. Build a lookup map before Pass 2 starts:

```typescript
const workspaceByName = new Map(options.workspaces.map((ws) => [ws.name, ws]))
```

In the Pass 2 loop, extract workspace name from `prefixedPath`:

```typescript
const wsName = prefixedPath.substring(0, prefixedPath.indexOf(':'))
const ws = workspaceByName.get(wsName)
const codeRoot = ws?.codeRoot
const repoRoot = ws?.repoRoot
```

Pass these to `resolveImports`.

### 3b. Update `resolveImports` signature

```typescript
private resolveImports(
  imports: ImportDeclaration[],
  filePath: string,
  adapter: LanguageAdapter,
  index: SymbolIndex,
  qualifiedNames: Map<string, string>,
  packageToWorkspace: Map<string, string>,
  codeRoot?: string,
  repoRoot?: string,
): { importMap: Map<string, string>; fileImports: string[] }
```

The new return type adds `fileImports` — an array of absolute file paths resolved via PSR-4.

### 3c. PSR-4 fallback inside `resolveImports`

After the existing qualified name and package resolution attempts, add:

```typescript
// PSR-4 fallback for namespace-based imports not resolved via symbol index
if (adapter.resolveQualifiedNameToPath && codeRoot) {
  const resolvedPath = adapter.resolveQualifiedNameToPath(imp.specifier, codeRoot, repoRoot)
  if (resolvedPath) {
    fileImports.push(resolvedPath)
    continue
  }
}
```

### 3d. Emit file-to-file IMPORTS from `fileImports`

In the Pass 2 loop, after `extractRelations`:

```typescript
const { importMap, fileImports } = this.resolveImports(...)
const relations = adapter.extractRelations(prefixedPath, content, symbols, importMap)
allRelations.push(...relations)

for (const targetPath of fileImports) {
  allRelations.push(
    createRelation({ source: prefixedPath, target: targetPath, type: RelationType.Imports }),
  )
}
```

---

## Test coverage

**File:** `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`

Add test groups for each new capability following the existing spec structure. All tests are pure (pass content strings, no filesystem):

- **PSR-4 resolution**: requires a temp directory with `composer.json` (I/O test — use `os.tmpdir()` + unique subfolder, clean up after). Test: namespace resolves to path, no manifest returns undefined, cache hit (spy on `findManifestField`).
- **require/include**: pass PHP source strings to `extractRelations`. Test: relative path → IMPORTS, dynamic expression → no relation, `require` and `require_once` both handled.
- **Dynamic loaders**: pass PHP source strings to `extractRelations`. Test: `loadModel`, `App::uses`, `$this->load->model`, dynamic argument → dropped, unrelated `->get()` → not detected.

**File:** `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts` (or new `index-code-graph-php.spec.ts`)

Integration test: index a minimal PHP workspace with a `composer.json`, a source file with `use App\Models\User`, and `src/Models/User.php`. Verify the graph contains an IMPORTS relation from the controller to the model.

---

## File touch summary

| File                                                                               | Change type                                                                                                               |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `packages/code-graph/src/domain/value-objects/language-adapter.ts`                 | Add `resolveQualifiedNameToPath?` method                                                                                  |
| `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`       | Add PSR-4 resolution, require/include detection, dynamic loader `IMPORTS`, loaded-instance `CALLS`, and resolver registry |
| `packages/code-graph/src/application/use-cases/index-code-graph.ts`                | Wire `resolveQualifiedNameToPath` into `resolveImports`, thread codeRoot/repoRoot                                         |
| `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts` | New test cases                                                                                                            |
| `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`        | New PHP integration test                                                                                                  |
