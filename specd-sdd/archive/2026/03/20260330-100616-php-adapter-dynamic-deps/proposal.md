# Proposal: php-adapter-dynamic-deps

## Motivation

The PHP language adapter only extracts static `use` namespace declarations syntactically but never resolves them to file paths, and completely misses implicit dependencies established through dynamic loader calls (`$this->loadModel('User')`, `$this->load->model('User_model')`, `require_once`) used heavily in legacy PHP frameworks (CakePHP 1.x–4.x, CodeIgniter 1.x–3.x, Yii 1.x–2.x, Zend 1.x, Drupal). As a result, the code graph for PHP projects — especially older codebases — is missing the majority of real dependencies.

## Current behaviour

- `extractImportedNames` parses `use` declarations syntactically but the indexer has no way to resolve them to file paths — PHP is not handled in Pass 2 resolution because neither `resolveRelativeImportPath` nor `resolvePackageFromSpecifier` applies to PHP's namespace-based imports.
- `extractRelations` ignores the `importMap` it receives and only emits `DEFINES` relations. The comment in the implementation reads: _"PHP `use` statements reference namespace-based classes, not file paths. Resolving them requires knowledge of the autoloader (PSR-4) mapping, which is deferred to a future version."_
- Dynamic loader calls (`$this->loadModel('User')`, `App::uses('Controller', 'Controller')`, `Yii::import(...)`, etc.) are not detected at all — they generate no file-level `IMPORTS` relations in the graph.
- `require` / `require_once` / `include` / `include_once` expressions with string literal paths are not detected — no `IMPORTS` relation is created.
- Calls made through dynamically loaded model/service instances are not linked to target symbols (`CALLS`), so hotspots underrepresent real usage in legacy code.

## Proposed solution

Five capabilities added to the PHP adapter, with a corresponding update to the indexer's Pass 2 contract:

1. **`require`/`include` detection** — Walk the AST for `require_expression`, `require_once_expression`, `include_expression`, `include_once_expression` nodes. When the argument is a string literal, emit an `IMPORTS` relation from the current file to the resolved path (relative to the file's directory). Paths with PHP constants or dynamic expressions are silently dropped.

2. **Dynamic loader detection with file resolution** — Walk the AST for known method calls and static calls whose string-literal arguments name a class, model, or component, resolve them to candidate files using framework conventions and available project mappings, and emit `IMPORTS` (`File -> File`) for resolvable targets only. Patterns covered:

   | Call pattern                              | Framework           |
   | ----------------------------------------- | ------------------- |
   | `$this->loadModel('Model')`               | CakePHP 1.x–4.x     |
   | `$this->load->model/library/helper('X')`  | CodeIgniter 1.x–3.x |
   | `App::uses('Class', 'Package')`           | CakePHP 2.x         |
   | `ClassRegistry::init('Class')`            | CakePHP 2.x         |
   | `Yii::import('application.models.Class')` | Yii 1.x             |
   | `Yii::createObject('Class')`              | Yii 2.x             |
   | `Zend_Loader::loadClass('Class')`         | Zend 1.x            |
   | `\Drupal::service('service.name')`        | Drupal 8+           |

3. **PSR-4 namespace resolution** — Add a new optional method `resolveQualifiedNameToPath?(qualifiedName, codeRoot, repoRoot?)` to the `LanguageAdapter` interface. The PHP adapter implements it by reading the `autoload.psr-4` and `autoload-dev.psr-4` sections of `composer.json`, building a prefix→directory map, and resolving `App\Models\User` → `{codeRoot}/src/Models/User.php` via longest-prefix match. The indexer calls this method in Pass 2 for PHP `ImportDeclaration` entries not already resolved via the in-memory symbol index, emitting a file-to-file `IMPORTS` relation.

4. **Loaded-instance call extraction (heuristic)** — When a method/function contains a resolvable dynamic loader call (e.g. `loadModel('Article')`), track local aliases bound to that loaded dependency (for example `$this->Article`, `$Article`, `$model`) and emit `CALLS` edges for member calls on those aliases within the same method/function body (e.g. `$this->Article->save()`, `$model->find()`) when the target symbol can be resolved.

5. **Extensible loader resolver registry** — Replace single-pattern assumptions with a framework-aware resolver registry so additional loader APIs (`loadController`, `loadComponent`, service/container loaders, framework-specific factories) can be added without changing core extraction flow. Each resolver declares detection pattern, argument mapping, target kind, and file/symbol resolution strategy.

## Specs affected

### New specs

_None._

### Modified specs

- `code-graph:code-graph/language-adapter`: Add four new requirements to the PHP section — `require`/`include` as IMPORTS, dynamic loader detection as IMPORTS when resolvable, `resolveQualifiedNameToPath` as a new optional method on the interface, and loaded-instance call extraction to `CALLS` when symbol resolution succeeds.
- `code-graph:code-graph/language-adapter`: Add framework-extensible loader resolver requirements so supported loader APIs are data-driven and testable per framework.
- Depends on (added): none

- `code-graph:code-graph/indexer`: Update Pass 2 to document that when a PHP `ImportDeclaration` with `isRelative: false` is not resolved via the qualified name map, the indexer calls `adapter.resolveQualifiedNameToPath` (if implemented) and emits a file-to-file `IMPORTS` relation from the result.
  - Depends on (added): none

## Impact

- **`packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`** — primary change: new AST walking logic for require/include, dynamic loaders, and PSR-4 resolution.
- **`packages/code-graph/src/domain/value-objects/language-adapter.ts`** — new optional method `resolveQualifiedNameToPath?` added to the interface.
- **`packages/code-graph/src/application/use-cases/index-code-graph.ts`** (or similar) — Pass 2 updated to call `resolveQualifiedNameToPath` for unresolved PHP imports.
- **`test/infrastructure/tree-sitter/php-language-adapter.spec.ts`** — new test cases for all three capabilities.
- No changes to the public API surface of `@specd/code-graph` beyond the new optional method.

## Technical context

- Dynamic loader extraction must produce file-level relations compatible with the current graph schema and analytics. Dynamic loader matches contribute to `IMPORTS` only when the target file can be resolved. Unresolvable dynamic calls are dropped (optionally counted as diagnostics), rather than encoded as `DEPENDS_ON`, which is reserved for `Spec -> Spec`.
- Loaded-instance call extraction is intentionally scoped to intra-method/function analysis (no interprocedural propagation in this change). This captures the highest-signal legacy patterns with bounded complexity and predictable false-positive risk.
- Loader API coverage must be expandable by adding resolver entries (or resolver modules), not by embedding framework-specific conditionals through the extraction core. This keeps support for `loadModel`, `loadController`, `loadComponent`, and future framework loaders consistent.
- `require`/`include` with dynamic expressions (string concatenation, constants like `APPPATH`, `__DIR__ . '/...'`) are silently dropped — consistent with how unresolvable CALLS are handled.
- Service container patterns (`$container->get('x')`, `$app->get('x')`) are excluded — the method name `get` is too generic and would cause false positives in unrelated code.
- Laravel's `app()` / `resolve()` free functions are excluded from this change — Laravel projects predominantly use `use` statements with PSR-4, so PSR-4 resolution covers the common case.
- PSR-4 `resolveQualifiedNameToPath` reads `composer.json` (I/O), following the same contract as `getPackageIdentity`. Internal caching per `codeRoot` is an implementation detail of the adapter.
- The indexer spec already describes the qualified name map (built from `extractNamespace` + `buildQualifiedName` in Pass 1). `resolveQualifiedNameToPath` is a complementary fallback for classes not present in the indexed codebase — it resolves to file paths, not symbol IDs.
- `vendor/` directory exclusion is handled in a separate parallel change and is out of scope here.

## Open questions

_None — scope, approach, and framework coverage were confirmed during exploration._
