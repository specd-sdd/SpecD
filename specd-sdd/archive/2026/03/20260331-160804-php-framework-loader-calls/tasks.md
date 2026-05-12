# Tasks: php-framework-loader-calls

## 1. PHP resolver coverage

- [x] 1.1 Add CakePHP class-property `uses` bindings
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `extractCakeUsesPropertyBindings` — detect `var/public/protected $uses` literal declarations and convert them into `LoaderBinding` entries so class-level dependencies become available to methods.
      Approach: parse only literal array entries, reuse `resolveCakeTarget()` and `defaultAliasNames()`, and plug the helper into `extractLoaderBindings()` without changing the outer extraction contract.
      (Req: PHP dynamic loader dependencies)

- [x] 1.2 Support bare Cake controller and component loaders
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `LOADER_RESOLVERS`, `bindingAppearsInScope` — add bare `loadController('X')` and `loadComponent('X')` forms so they feed the same resolver path as `$this->...` variants.
      Approach: mirror the existing `loadModel` handling by widening only the exact framework signatures and preserving the guard that ignores member-call or static-call false positives.
      (Req: PHP dynamic loader dependencies)

- [x] 1.3 Add deterministic class-literal target resolution
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `resolveFrameworkClassLiteralTarget` and new resolver entries — resolve explicit class targets used by Yii, Zend, Laravel, Symfony, and other registry-declared framework acquisition flows when they can be mapped to concrete files.
      Approach: route explicit class names through existing PSR-4 / generic PHP path rules, cover `Yii::createObject(Foo::class)`, `Zend_Loader::loadClass(...)` + `new Foo_Bar()`, `app(Foo::class)`, `resolve(Foo::class)`, and `$this->get(Foo::class)`, and reject runtime-only service IDs or generic `get('service')` calls that cannot resolve deterministically.
      (Req: PHP dynamic loader dependencies)

## 2. PHP CALLS extraction

- [x] 2.1 Seed method analysis from class-level and loader-level aliases
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `extractLoadedInstanceCalls` — make class-property `uses` aliases and bare loader aliases available inside each method before member-call matching runs.
      Approach: keep the current method-local walk, but build the alias map in phases so class-level bindings seed each method while still avoiding interprocedural propagation.
      (Req: PHP loaded-instance call extraction)

- [x] 2.2 Add constructed-instance alias derivation
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `extractExplicitConstructedInstanceAliases` — derive local aliases created by `new X()` or deterministic framework acquisition and map later member calls to resolved target methods.
      Approach: only admit aliases when the constructed or acquired class already has a deterministic target path from bindings or class-literal resolution, then fold them into the same alias map used for `$this->Model` and local assignment cases. This includes explicit-class flows from Yii, Zend, Laravel, and Symfony when the class target is statically known.
      (Req: PHP loaded-instance call extraction)

- [x] 2.3 Preserve ambiguity dropping and registry-based extensibility
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: resolver and call-resolution flow — ensure unresolved, runtime-only, or ambiguous framework lookups still emit no `IMPORTS` or `CALLS`, and keep all new pattern support registry-driven.
      Approach: add resolver entries and helper functions instead of hard-coding framework branches into the core extraction loop, keep CakePHP/CodeIgniter/Yii/Zend/Laravel/Symfony support visibly registry-driven, and leave cross-method propagation disabled.
      (Req: PHP dynamic loader dependencies, PHP loaded-instance call extraction, PHP loader resolver extensibility)

## 3. Adapter regression tests

- [x] 3.1 Cover new CakePHP binding patterns in adapter tests
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: new describe cases — verify `uses` properties, bare `loadController`, bare `loadComponent`, and `$this->Model->method()` flows emit the expected `IMPORTS` / `CALLS`.
      Approach: follow the existing adapter test style with minimal PHP fixtures and assert exact `RelationType` outputs for each pattern family.
      (Req: PHP dynamic loader dependencies, PHP loaded-instance call extraction)

- [x] 3.2 Cover constructed-instance and class-literal flows in adapter tests
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: new scenarios — verify `loadModel('X')` + `new X()` + method call, and deterministic class-literal acquisition flows for explicitly supported framework families.
      Approach: add positive tests for Yii, Zend, Laravel, and Symfony only where the class target is explicit and resolvable, plus negative tests for runtime-only service identifiers so ambiguity continues to be dropped.
      (Req: PHP dynamic loader dependencies, PHP loaded-instance call extraction)

- [x] 3.3 Guard registry extensibility behavior
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: resolver-focused cases — verify the new pattern support is provided through resolver entries/helpers rather than changing outward adapter behavior.
      Approach: keep assertions on observable relations and loader coverage, while structuring fixtures so regressions in resolver wiring are visible across CakePHP, CodeIgniter, Yii, Zend, Laravel, and Symfony without testing private implementation details directly.
      (Req: PHP loader resolver extensibility)

## 4. Indexing and validation

- [x] 4.1 Prove full indexing preserves the new PHP relations
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`: PHP workspace fixtures — add or extend end-to-end indexing cases for `uses` properties, bare Cake loaders, constructed-instance flows, and at least one non-Cake deterministic class-literal family.
      Approach: model compact legacy-style fixtures plus one explicit-class fixture, run the real indexing use case, and assert that the persisted graph contains the expected `CALLS` and `IMPORTS`.
      (Req: PHP dynamic loader dependencies, PHP loaded-instance call extraction)

- [x] 4.2 Revalidate graph usefulness against `../iccms`
      `/Users/monki/Documents/Proyectos/iccms/specd.yaml`: manual graph verification — reindex or query the external repo and confirm PHP-heavy areas now contribute materially more than `2` `CALLS`.
      Approach: run `graph stats` and a hotspot/impact spot-check sequentially, compare the post-change `CALLS` count and representative controller/model outputs against the baseline captured in the exploration file.
      (Req: PHP loaded-instance call extraction)

- [x] 4.3 Run package tests and record any documentation follow-up
      `packages/code-graph/test/...`: test execution and closeout — run the relevant `@specd/code-graph` test suite and confirm no additional `docs/` change is required for this internal adapter behavior.
      Approach: use the package-scoped test command from the design, verify new `.spec.ts` coverage passes, and only open a docs follow-up if user-facing guidance becomes necessary.
      (Req: PHP dynamic loader dependencies, PHP loaded-instance call extraction, PHP loader resolver extensibility)
