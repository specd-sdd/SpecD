# Proposal: php-framework-loader-calls

## Motivation

PHP-heavy legacy repositories can be indexed successfully by the code graph while still
producing almost no `CALLS` relations, which makes hotspots and impact analysis much
less useful than they should be. This needs to be addressed now because real-world
validation against `../iccms` showed that the current PHP extraction heuristics miss
common framework patterns that dominate the codebase.

## Current behaviour

The PHP language adapter already extracts symbols and some dynamic-loader-style
`IMPORTS`, and it supports a narrow set of loaded-instance `CALLS` patterns inside a
single method scope. In practice, this leaves major gaps for legacy framework code:
class-property dependency declarations such as `var $uses = array(...)`, bare
`loadController(...)` and `loadComponent(...)` calls, and flows where a loader call is
followed by `new X()` and then instance method calls are not converted into meaningful
symbol-level `CALLS`.

In `../iccms`, this gap surfaced as a graph with `3766` symbols but only `2` `CALLS`
relations, despite hundreds of loader usages and many controller-to-model method calls.

## Proposed solution

Broaden PHP `CALLS` extraction so that common framework-shaped dependency declarations,
loader patterns, and framework-managed object acquisition flows resolve to the same kind
of symbol-level relations already produced for more limited loaded-instance cases. The
change should be CakePHP-first because that is where the concrete failure was observed,
but it should also include equivalent literal, statically resolvable flows from other
PHP frameworks where dependencies are acquired through recognizable framework APIs or
class-literal object construction. The extraction rules should remain explicit,
deterministic, and safe to evaluate without executing PHP.

## Specs affected

### New specs

- none

### Modified specs

- `code-graph:code-graph/language-adapter`: extend the PHP adapter requirements so the
  supported dynamic loader and loaded-instance `CALLS` patterns cover CakePHP property
  declarations, bare loader forms, loader-plus-instantiation flows, and equivalent
  statically resolvable patterns from other PHP frameworks where dependency acquisition
  is expressed through recognizable framework APIs, class literals, or deterministic
  naming conventions.
  - Depends on (added): none

## Impact

- `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`
- `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`
- `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`
- Downstream graph consumers such as hotspots and impact analysis, because they rely on
  `CALLS` density and accuracy
- Manual validation target: `../iccms`, where the current graph stats expose the defect

## Technical context

The current adapter already supports several framework-flavoured loader patterns,
including `loadModel`, `$this->loadController`, `$this->loadComponent`, `App::uses`,
`App::import`, `ClassRegistry::init`, CodeIgniter loaders, Yii loaders, Zend class
loading, and Drupal service detection. The discussion established that the main
shortfall is not the complete absence of framework support, but that the currently
supported PHP `CALLS` patterns are too narrow for the way real framework code wires
dependencies after loading them.

Concrete patterns discussed and observed in `../iccms` include:

- `var $uses = array('ResultadoElecciones')`
- `public/protected $uses = [...]`
- bare `loadController('X')` and `loadComponent('X')`
- `loadModel('X')` followed by `new X()` and then `$instance->method()`
- repeated `$this->ModelName->method()` calls after framework-managed dependency setup

Related framework patterns that are reasonable to include if they remain statically
resolvable include:

- CodeIgniter:
  - `$this->load->model('user_model')` followed by `$this->user_model->find()`
  - `$this->load->library('email')` followed by `$this->email->send()`
- Yii:
  - `Yii::createObject('App.Services.Foo')` assigned to a local variable and then
    `$foo->bar()`
- Zend:
  - `Zend_Loader::loadClass('Foo_Bar')` followed by `new Foo_Bar()` and instance
    method calls
- Laravel:
  - `app(Foo::class)` or `resolve(Foo::class)` assigned to a variable and then
    `$foo->bar()`
  - container-backed controller/service dependencies when the class target is explicit
- Symfony:
  - `$this->get(Foo::class)` or constructor-injected service classes when the concrete
    class target is explicit and resolvable
- Generic PSR-4 / namespaced PHP:
  - `new Vendor\\Package\\Service()` followed by instance method calls when the class can
    be resolved through Composer autoload mappings already understood by the adapter

Drupal service loading is relevant context, but service IDs do not currently map as
cleanly to concrete classes or methods as the CakePHP / CodeIgniter / Yii / Zend
examples above, and frameworks that rely heavily on string service IDs, runtime
configuration, or reflection-driven wiring should only be included where deterministic
resolution is actually possible.

The user explicitly wants this change to capture everything discussed in the
conversation plus other related patterns that fit the same static-resolution model.

## Open questions

- None currently. The proposal scope is clear enough to proceed to spec and design work.
