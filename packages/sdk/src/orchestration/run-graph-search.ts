import {
  type CodeGraphProvider,
  type FileCategory,
  type SearchCategory,
  type SearchCodeGraphInput,
  type SourceContentMatch,
  type SymbolKind,
} from '@specd/code-graph'
import { type SdkHostContext } from '../composition/host-context.js'
import { withOpenGraphProvider } from '../composition/with-open-graph-provider.js'
import { toProjectRelativePath } from './project-relative-path.js'

/**
 * Input options for {@link runGraphSearch}.
 */
export interface RunGraphSearchInput {
  /** Text or symbol query. */
  readonly query: string
  /** Categories to search (defaults to all if omitted). */
  readonly categories?: readonly SearchCategory[]
  /** Filter symbols by kind. */
  readonly kinds?: readonly SymbolKind[]
  /** Filter by canonical or pattern file path. */
  readonly file?: string
  /** Alias for `file`. */
  readonly filePattern?: string
  /** Exact file match required (bypasses fuzzy path scoring). */
  readonly exactFile?: boolean
  /** Filter by workspace name. */
  readonly workspace?: string
  /** Path glob exclusion patterns. */
  readonly excludePaths?: readonly string[]
  /** Workspace name exclusions. */
  readonly excludeWorkspaces?: readonly string[]
  /** Filter by file category. */
  readonly fileCategories?: readonly FileCategory[]
  /** Include test files. */
  readonly includeTests?: boolean
  /** Include ignored files. */
  readonly includeIgnored?: boolean
  /** Maximum results per category. */
  readonly limit?: number
  /** Include code/text snippet previews. */
  readonly snippet?: boolean
  /** Alias for `snippet`. */
  readonly includeSnippet?: boolean
  /** Include full spec content (for specs category). */
  readonly specContent?: boolean
  /** Optional pre-opened graph provider. When provided, lifecycle is caller-owned. */
  readonly provider?: CodeGraphProvider
}

/** Projected symbol location with repository-relative path. */
export interface ProjectedSymbolLocation {
  readonly filePath: string
  readonly projectRelativePath: string
  readonly line: number
  readonly column: number
  readonly endLine?: number | undefined
  readonly endColumn?: number | undefined
}

/** Projected declaration with repository-relative location. */
export interface ProjectedDeclarationOccurrence {
  readonly logicalSymbolId: string
  readonly declaration: {
    readonly logicalId?: string | undefined
    readonly symbolId: string
    readonly location: ProjectedSymbolLocation
    readonly kind: string
  }
}

/** Projected logical target with repository-relative surface. */
export interface ProjectedLogicalTarget {
  readonly id: string
  readonly workspace: string
  readonly surface: string
  readonly projectRelativePath: string
  readonly name: string
  readonly space: string
  readonly ownerId?: string | null | undefined
  readonly memberSemantics?: unknown
  readonly qualifiedName?: string | undefined
}

/** Projected public binding with repository-relative surface. */
export interface ProjectedPublicBinding {
  readonly id: string
  readonly surface: string
  readonly projectRelativePath: string
  readonly exportedName: string
  readonly space: string
  readonly targetId?: string | undefined
}

/** Projected symbol hit with repository-relative path. */
export interface ProjectedSymbolHit {
  readonly symbol: {
    readonly id: string
    readonly name: string
    readonly kind: string
    readonly filePath: string
    readonly projectRelativePath: string
    readonly line: number
    readonly column: number
    readonly endLine?: number | undefined
    readonly endColumn?: number | undefined
    readonly selectionRange?:
      | {
          readonly startLine: number
          readonly startColumn: number
          readonly endLine: number
          readonly endColumn: number
        }
      | undefined
    readonly parentId?: string | null | undefined
    readonly comment?: string | null | undefined
  }
  readonly score: number
  readonly startLine: number
  readonly endLine: number
  readonly snippet?: string | undefined
}

/** Projected symbol group in search results. */
export interface ProjectedSymbolGroup {
  readonly logicalTarget: ProjectedLogicalTarget | null
  readonly declarations: readonly ProjectedDeclarationOccurrence[]
  readonly publicBindings: readonly ProjectedPublicBinding[]
  readonly matchedPublicBindings: readonly ProjectedPublicBinding[]
  readonly score: number
  readonly matchTier: string
  readonly matchReasons: readonly string[]
  readonly hits: readonly ProjectedSymbolHit[]
}

/** Projected source file result with projectRelativePath and without configRelativePath. */
export interface ProjectedSourceFileResult {
  readonly workspace: string
  readonly path: string
  readonly projectRelativePath: string
  readonly score: number
  readonly totalMatches: number
  readonly omittedMatches: number
  readonly matches: readonly SourceContentMatch[]
}

/** Spec search result. */
export interface SpecSearchResultItem {
  readonly workspace: string
  readonly specId: string
  readonly path: string
  readonly title: string
  readonly description: string
  readonly score: number
  readonly startLine: number
  readonly endLine: number
  readonly content?: string | undefined
  readonly snippet?: string | undefined
}

/** Projected document result with projectRelativePath and without configRelativePath. */
export interface ProjectedDocumentResult {
  readonly workspace: string
  readonly path: string
  readonly projectRelativePath: string
  readonly score: number
  readonly startLine: number
  readonly endLine: number
  readonly snippet?: string | undefined
}

/** Structured result returned by {@link runGraphSearch}. */
export interface RunGraphSearchResult {
  readonly symbols: readonly ProjectedSymbolGroup[]
  readonly files: readonly ProjectedSourceFileResult[]
  readonly specs: readonly SpecSearchResultItem[]
  readonly documents: readonly ProjectedDocumentResult[]
  readonly omittedCounts: { readonly tests: number; readonly ignored: number }
}

const DEFAULT_CATEGORIES: readonly SearchCategory[] = ['symbols', 'files', 'specs', 'documents']

/**
 * Executes a code graph search and projects all paths to repository-relative `projectRelativePath`.
 *
 * @param ctx - SDK host context
 * @param input - Search query options
 * @returns Projected search result
 */
export async function runGraphSearch(
  ctx: SdkHostContext,
  input: RunGraphSearchInput,
): Promise<RunGraphSearchResult> {
  const config = ctx.kernel.project.getConfig.execute()

  const executeWithProvider = async (
    provider: CodeGraphProvider,
  ): Promise<RunGraphSearchResult> => {
    const categories: readonly SearchCategory[] =
      input.categories !== undefined && input.categories.length > 0
        ? input.categories
        : DEFAULT_CATEGORIES

    const filePattern = input.filePattern ?? input.file
    const includeSnippet = input.includeSnippet ?? input.snippet ?? false

    const searchInput: SearchCodeGraphInput = {
      query: input.query,
      categories,
      limit: input.limit ?? 20,
      includeSnippet,
      ...(input.kinds !== undefined ? { kinds: input.kinds } : {}),
      ...(filePattern !== undefined ? { filePattern } : {}),
      ...(input.exactFile !== undefined ? { exactFile: input.exactFile } : {}),
      ...(input.workspace !== undefined ? { workspace: input.workspace } : {}),
      ...(input.excludePaths !== undefined ? { excludePaths: input.excludePaths } : {}),
      ...(input.excludeWorkspaces !== undefined
        ? { excludeWorkspaces: input.excludeWorkspaces }
        : {}),
      ...(input.fileCategories !== undefined ? { fileCategories: input.fileCategories } : {}),
      ...(input.includeTests !== undefined ? { includeTests: input.includeTests } : {}),
      ...(input.includeIgnored !== undefined ? { includeIgnored: input.includeIgnored } : {}),
    }

    const raw = await provider.search(searchInput)

    const symbols: ProjectedSymbolGroup[] = raw.symbols.map((group) => ({
      logicalTarget:
        group.logicalTarget === null
          ? null
          : {
              id: group.logicalTarget.id,
              workspace: group.logicalTarget.workspace,
              surface: group.logicalTarget.surface,
              projectRelativePath: toProjectRelativePath(config, group.logicalTarget.surface),
              name: group.logicalTarget.name,
              space: group.logicalTarget.space,
              ownerId: group.logicalTarget.ownerId ?? null,
              memberSemantics: group.logicalTarget.memberSemantics,
              ...(group.logicalTarget.qualifiedName !== undefined
                ? { qualifiedName: group.logicalTarget.qualifiedName }
                : {}),
            },
      declarations: (group.declarations ?? []).map((d) => ({
        logicalSymbolId: d.logicalSymbolId,
        declaration: {
          logicalId: d.declaration.logicalId,
          symbolId: d.declaration.symbolId,
          kind: d.declaration.kind,
          location: {
            filePath: d.declaration.location.filePath,
            projectRelativePath:
              d.declaration.location.projectRelativePath ??
              toProjectRelativePath(config, d.declaration.location.filePath),
            line: d.declaration.location.line,
            column: d.declaration.location.column,
            ...(d.declaration.location.endLine !== undefined
              ? { endLine: d.declaration.location.endLine }
              : {}),
            ...(d.declaration.location.endColumn !== undefined
              ? { endColumn: d.declaration.location.endColumn }
              : {}),
          },
        },
      })),
      publicBindings: (group.publicBindings ?? []).map((b) => ({
        id: b.id,
        surface: b.surface,
        projectRelativePath: toProjectRelativePath(config, b.surface),
        exportedName: b.exportedName,
        space: b.space,
        ...(b.targetId !== undefined ? { targetId: b.targetId } : {}),
      })),
      matchedPublicBindings: (group.matchedPublicBindings ?? []).map((b) => ({
        id: b.id,
        surface: b.surface,
        projectRelativePath: toProjectRelativePath(config, b.surface),
        exportedName: b.exportedName,
        space: b.space,
        ...(b.targetId !== undefined ? { targetId: b.targetId } : {}),
      })),
      score: group.score,
      matchTier: group.matchTier,
      matchReasons: group.matchReasons ?? [],
      hits: group.hits.map((h) => ({
        symbol: {
          id: h.symbol.id,
          name: h.symbol.name,
          kind: h.symbol.kind,
          filePath: h.symbol.filePath,
          projectRelativePath:
            h.symbol.projectRelativePath || toProjectRelativePath(config, h.symbol.filePath),
          line: h.symbol.line,
          column: h.symbol.column,
          ...(h.symbol.endLine !== undefined ? { endLine: h.symbol.endLine } : {}),
          ...(h.symbol.endColumn !== undefined ? { endColumn: h.symbol.endColumn } : {}),
          ...(h.symbol.selectionRange !== undefined
            ? { selectionRange: h.symbol.selectionRange }
            : {}),
          ...(h.symbol.parentId !== undefined ? { parentId: h.symbol.parentId } : {}),
          ...(h.symbol.comment !== undefined ? { comment: h.symbol.comment } : {}),
        },
        score: h.score,
        startLine: h.startLine,
        endLine: h.endLine,
        ...(includeSnippet && h.snippet !== undefined ? { snippet: h.snippet } : {}),
      })),
    }))

    const files: ProjectedSourceFileResult[] = raw.files.map((item) => ({
      workspace: item.file.workspace,
      path: item.file.path,
      projectRelativePath: item.file.projectRelativePath,
      score: item.score,
      totalMatches: item.totalMatches,
      omittedMatches: item.omittedMatches,
      matches: item.matches.map((m) => ({
        range: m.range,
        matchedText: m.matchedText,
        matchKind: m.matchKind,
        sourceToken: m.sourceToken,
        ...(includeSnippet && m.snippet !== undefined ? { snippet: m.snippet } : {}),
      })),
    }))

    const specs: SpecSearchResultItem[] = raw.specs.map((item) => ({
      workspace: item.spec.workspace,
      specId: item.spec.specId,
      path: item.spec.path,
      title: item.spec.title,
      description: item.spec.description,
      score: item.score,
      startLine: item.startLine,
      endLine: item.endLine,
      ...(input.specContent && item.spec.content !== undefined
        ? { content: item.spec.content }
        : {}),
      ...(includeSnippet && item.snippet !== undefined ? { snippet: item.snippet } : {}),
    }))

    const documents: ProjectedDocumentResult[] = raw.documents.map((item) => ({
      workspace: item.document.workspace,
      path: item.document.path,
      projectRelativePath: item.document.projectRelativePath,
      score: item.score,
      startLine: item.startLine,
      endLine: item.endLine,
      ...(includeSnippet && item.snippet !== undefined ? { snippet: item.snippet } : {}),
    }))

    return {
      symbols,
      files,
      specs,
      documents,
      omittedCounts: raw.omittedCounts ?? { tests: 0, ignored: 0 },
    }
  }

  if (input.provider !== undefined) {
    return executeWithProvider(input.provider)
  }

  return withOpenGraphProvider(ctx, executeWithProvider)
}
