---
    "@specd/code-graph": minor
    "@specd/sdk": patch
    "@specd/cli": patch
---

20261020 - code-graph-cross-workspace-imports: Resolve package-specifier imports across workspaces through each package's published entry surface instead of a same-name search, so impact, hotspots, and coverage see cross-package dependents. Breaking change to the public `LanguageAdapter` contract: the loose optional methods (`getPackageIdentity`, `resolvePackageFromSpecifier`, `resolveRelativeImportPath`, `buildQualifiedName`, `resolveQualifiedNameToPath`, `parseSymbolReference`, `renderSymbolReference`, `linkReExports`) are replaced by declared facets (`packageResolution`, `relativeImportResolution`, `qualifiedNameResolution`, `symbolReferenceSyntax`, `reExportLinking`); `AdapterRegistry.register` validates the adapter shape and throws `INVALID_LANGUAGE_ADAPTER`; a later registration for a language replaces the earlier adapter. `ResolvedImports` gains `steps` and `diagnostics`, `ImportResolutionContext` gains package helpers, and `IndexResult` gains `importDiagnostics`. A new language needs only an adapter, with no indexer change.

Specs affected:

- `code-graph:language-adapter`
- `code-graph:workspace-integration`
- `code-graph:typescript-language-adapter`
- `code-graph:python-language-adapter`
- `code-graph:go-language-adapter`
- `code-graph:php-language-adapter`
- `code-graph:resolve-symbol-reference`
- `code-graph:indexer`
