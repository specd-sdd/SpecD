# Partial: identity

Audit mode: change `language-agnostic-member-symbol-references` (state `verifying`).
Source: merged verifying context plus `changes spec-preview` scenario text for `code-graph:symbol-model`, `code-graph:language-adapter`, and `code-graph:resolve-symbol-reference`. Published `specs/` were not used as the change contract.

## Per spec

### code-graph:symbol-model

#### Requirements summary

Qualified spelling is stored beside the simple name. `LogicalSymbol.qualifiedName` is optional and is not a field of the canonical id `logical|2|`. `deriveQualifiedName` walks `ownerId` and joins simple names with `.`. A missing owner or a broken chain leaves the spelling unset. `assignQualifiedNames` copies that spelling onto the symbols. `qualifiedLookupText` accepts one dotted identifier pair or exactly one `::` pair and compares both as the dotted spelling. A single `:` stays a workspace or file separator.

#### Implementation status

Conformant. `packages/code-graph/src/domain/value-objects/symbol-reference.ts` keeps `qualifiedName` off the encoded id. `packages/code-graph/src/domain/services/exact-lane-query.ts` implements the token rule. Tests in `packages/code-graph/test/domain/value-objects/symbol-reference.spec.ts` rebuild `EditChange.execute`, assert the id does not contain that spelling, and assert there is no package field.

#### Discrepancies

None.

#### Test coverage gaps

None for the added identity rules.

#### Dependency contradictions

None against `default:_global/conventions`, `default:_global/error-handling-conventions`, or `code-graph:document-model`. The spelling is a stored projection, not a document or a thrown user error.

### code-graph:language-adapter

#### Requirements summary

`ArchiveChange::execute` and `ArchiveChange.execute` name the same member. An unanchored single pair does not select the TypeScript adapter. `ArchiveChange::execute()` remains adapter syntax when a language is supplied.

#### Implementation status

Conformant. The exact lane resolves before adapter selection in `resolve-symbol-reference.ts`. The PHP adapter still parses `ArchiveChange::execute()` when language is `php`. Provider test: after indexing, `ArchiveChange::execute` resolves and `parse` is not called; `ArchiveChange::execute()` with language `php` still calls the PHP adapter.

#### Discrepancies

None.

#### Test coverage gaps

None. Adapter unit coverage of `ArchiveChange::execute` remains in `php-language-adapter.spec.ts`. The skip-adapter path is the provider test.

#### Dependency contradictions

None. The adapter contract still owns language-specific syntax. The exact lane only bypasses it for one dotted or `::` pair.

### code-graph:resolve-symbol-reference

#### Requirements summary

Unanchored `EditChange.execute` and `EditChange::execute` resolve by stored spelling with no PHP adapter. Two `GetStatus.execute` values are both returned. Zero matches stay unresolved `REFERENCE_UNPROVEN` with no terminal-name fallback and no adapter. A file anchor filters visibility.

#### Implementation status

Conformant. `executeBatch` loads `findLogicalSymbolsByQualifiedNames`. `resolveQualifiedMember` compares the stored or derived spelling before any adapter. Empty workspace means every workspace. A non-empty workspace or an anchored file filters. Tests in `resolve-symbol-reference.spec.ts` cover the unanchored dotted and `::` cases, the two `GetStatus.execute` candidates, `EditChange.missing` unresolved, and the PHP adapter only for `ArchiveChange::execute()`.

#### Discrepancies

None.

#### Test coverage gaps

None for the added resolver scenarios.

#### Dependency contradictions

None against `code-graph:symbol-model`, `code-graph:graph-store`, `code-graph:language-adapter`, or `code-graph:workspace-integration`. Resolution still reads the store and still delegates non-exact human syntax to an adapter.

## Summary counts

- requirements checked: 3 specs, added qualified-name and exact-lane requirements
- conforming: all added scenarios inspected
- discrepancies: 0
- missing tests: 0
- dependency contradictions: 0
