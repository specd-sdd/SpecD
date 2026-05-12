# Tasks: php-adapter-dynamic-deps

## 1. Interface

- [x] 1.1 Add `resolveQualifiedNameToPath?` to `LanguageAdapter`
      `packages/code-graph/src/domain/value-objects/language-adapter.ts`: add optional method `resolveQualifiedNameToPath?(qualifiedName: string, codeRoot: string, repoRoot?: string): string | undefined` after `buildQualifiedName?`, with JSDoc

## 2. PHP adapter — PSR-4 resolution

- [x] 2.1 Add `node:path` import to PHP adapter
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: add `import path from 'node:path'`

- [x] 2.2 Add PSR-4 cache field
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: add `private readonly psr4Cache = new Map<string, Array<[string, string]>>()` as class field

- [x] 2.3 Implement `buildPsr4Map` private method
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: new private method `buildPsr4Map(codeRoot: string, repoRoot?: string): Array<[string, string]>` — reads `composer.json` via `findManifestField`, merges `autoload.psr-4` and `autoload-dev.psr-4`, sorts by prefix length descending, caches under `codeRoot`, returns `[]` if no manifest found

- [x] 2.4 Implement `resolveQualifiedNameToPath` public method
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: new public method satisfying the `LanguageAdapter` interface — calls `buildPsr4Map`, iterates sorted entries for longest-prefix match, replaces `\` with `path.sep`, appends `.php`, returns absolute path or `undefined`

## 3. PHP adapter — require/include detection

- [x] 3.1 Rename `_content` parameter to `content` in `extractRelations`
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `extractRelations` — remove the `// eslint-disable-next-line` comment, rename parameter, call `parse('php', content)` at the top

- [x] 3.2 Implement `extractRequireRelations` private method
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: new private method `extractRequireRelations(filePath: string, root: SgNode): Relation[]` — walks AST for `require_expression`, `require_once_expression`, `include_expression`, `include_once_expression`; extracts string literal argument (skips dynamic/concatenated expressions); resolves path relative to the file directory (strip workspace prefix first); emits `RelationType.Imports` relations

- [x] 3.3 Call `extractRequireRelations` from `extractRelations`
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: in `extractRelations`, parse AST, call `extractRequireRelations` and push results into the relations array

## 4. PHP adapter — dynamic loader detection

- [x] 4.1 Define `DYNAMIC_LOADER_PATTERNS` module-level constant
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: add `const DYNAMIC_LOADER_PATTERNS` before the class definition — array of `{ via, matchMethod, matchClass?, chained?, globalFn?, valueArgIndex?, moduleLoadInclude? }` entries covering all 21 patterns from the design: CakePHP 1.x–4.x, CodeIgniter, Magento 1.x, Drupal 6/7/8+, TYPO3 4.x/6.x+, Yii 1.x/2.x, Zend 1.x

- [x] 4.2 Implement `extractDynamicLoaderRelations` private method
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: new private method `extractDynamicLoaderRelations(filePath: string, root: SgNode): Relation[]` — walks AST for `member_call_expression`, `static_call_expression`, and `function_call_expression`; matches against `DYNAMIC_LOADER_PATTERNS`; extracts argument by `valueArgIndex` (default 0) or concatenates args[1]+'/'+args[2] for `moduleLoadInclude: true`; resolves to candidate target files and emits `RelationType.Imports` for resolvable targets only; silently drops non-literal or unresolvable arguments

- [x] 4.3 Call `extractDynamicLoaderRelations` from `extractRelations`
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: in `extractRelations`, call `extractDynamicLoaderRelations` with the parsed root and push results

## 5. Indexer — PSR-4 wiring

- [x] 5.1 Build `workspaceByName` map before Pass 2
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: before the Pass 2 loop, add `const workspaceByName = new Map(options.workspaces.map((ws) => [ws.name, ws]))`

- [x] 5.2 Update `resolveImports` signature to return `fileImports`
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: change return type to `{ importMap: Map<string, string>; fileImports: string[] }`, add `codeRoot?: string` and `repoRoot?: string` parameters, initialize `const fileImports: string[] = []` at the top, return `{ importMap, fileImports }`

- [x] 5.3 Add PSR-4 fallback inside `resolveImports`
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: after the existing `resolvePackageFromSpecifier` block (for non-relative, non-resolved imports), add: if `adapter.resolveQualifiedNameToPath && codeRoot`, call it with `imp.specifier`, `codeRoot`, `repoRoot`; if a path is returned, push to `fileImports` and `continue`

- [x] 5.4 Thread `codeRoot`/`repoRoot` and destructure return value in Pass 2 loop
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: in the Pass 2 inner loop, extract `wsName`, look up workspace from `workspaceByName`, destructure `{ importMap, fileImports }` from `resolveImports` call; after `allRelations.push(...relations)`, iterate `fileImports` and push a `RelationType.Imports` relation for each (source = `prefixedPath`, target = resolved absolute path)

## 6. Tests — PHP adapter unit tests

- [x] 6.1 PSR-4 resolution test group
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: add `describe('resolveQualifiedNameToPath')` — tests: resolves class to path, longest prefix wins, no matching prefix returns undefined, no composer.json returns undefined, cache hit (call twice, verify manifest read once using a spy or temp dir with read counter)

- [x] 6.2 require/include detection test group
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: add `describe('extractRelations — require/include')` — tests: `require_once` with relative literal emits IMPORTS, `include` emits IMPORTS, dynamic expression (variable/constant) emits nothing, `require_once` alongside `use` both produce relations

- [x] 6.3 Dynamic loader detection test group
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: add `describe('extractRelations — dynamic loaders')` — tests: `loadModel` emits IMPORTS when target resolves, `App::uses` emits IMPORTS when target resolves, `$this->load->model` emits IMPORTS, `Yii::import` emits IMPORTS, variable argument emits nothing, unrelated `->get()` emits nothing, multiple loaders in same file all detected

## 7. Tests — integration

- [x] 7.1 PHP PSR-4 integration test
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`: add a test that sets up a minimal PHP workspace in a temp dir (with `composer.json` containing PSR-4 mapping, a controller file with `use App\Models\User`, and `src/Models/User.php`); indexes it; verifies the graph contains an `IMPORTS` relation from the controller to `User.php`

## 8. PHP adapter — loaded-instance CALLS extraction (new scope)

- [x] 8.1 Implement local alias tracker for loaded dependencies
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: add helper logic to map resolved dynamic loader names (e.g. `Article`) to local aliases used in the same method/function (`$this->Article`, `$Article`, simple variable assignments)

- [x] 8.2 Implement `extractLoadedInstanceCalls` private method
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: detect member calls on tracked aliases inside the same method/function body and emit `RelationType.Calls` when both caller and callee symbols are resolvable

- [x] 8.3 Wire loaded-instance calls into `extractRelations`
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: call `extractLoadedInstanceCalls` from `extractRelations` and merge resulting CALLS with existing relations

- [x] 8.4 Add unit tests for loaded-instance call extraction
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: add `describe('extractRelations — loaded-instance calls')` with cases for `$this->Article->save()`, local alias assignment and call, unresolved alias (no relation), and cross-method usage (intentionally ignored)

## 9. Extensible loader resolver coverage (new scope)

- [x] 9.1 Introduce loader resolver registry abstraction
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: extract framework-specific loader handling into resolver entries/modules with unified detect/extract/resolve contract

- [x] 9.2 Add CakePHP resolver coverage for additional loaders
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: support `loadController(...)` and `loadComponent(...)` in same resolution flow as `loadModel(...)`

- [x] 9.3 Add resolver-oriented unit tests
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: verify new loader APIs produce expected `IMPORTS` (and alias metadata for later CALLS extraction) and keep backward compatibility for existing patterns
