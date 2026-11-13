import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type AdapterAnalyzeContext,
  type ImportResolutionContext,
  type LanguageAdapter,
  type RelationBuildContext,
  type ResolvedImports,
} from '../../src/domain/value-objects/language-adapter.js'
import {
  type FileAnalysis,
  type FileAnalysisDraft,
} from '../../src/domain/value-objects/file-analysis.js'
import {
  type ImportDiagnostic,
  type PackageResolutionFacet,
} from '../../src/domain/value-objects/language-adapter-facets.js'
import { type ImportDeclaration } from '../../src/domain/value-objects/import-declaration.js'
import { ImportDeclarationKind } from '../../src/domain/value-objects/import-declaration-kind.js'
import { type Relation } from '../../src/domain/value-objects/relation.js'
import { createSymbolNode, type SymbolNode } from '../../src/domain/value-objects/symbol-node.js'
import {
  DeclarationOccurrenceForm,
  SymbolSpace,
  createLocalBinding,
  createLogicalSymbol,
  createPublicBinding,
  type DeclarationOccurrence,
  type LocalBinding,
  type PublicBinding,
  type ResolutionStep,
} from '../../src/domain/value-objects/symbol-reference.js'
import { SymbolKind } from '../../src/domain/value-objects/symbol-kind.js'

/** Session state key under which the stub keeps the prepared package manifests. */
const STATE_KEY = 'zig2:packages'

/** Parsed `zig2.pkg` manifest: `name=<package>` and `entry=<file relative to the code root>`. */
interface Zig2Manifest {
  readonly name: string
  readonly entry: string
}

/**
 * Reads a `zig2.pkg` manifest from a code root.
 * @param codeRoot - Absolute code root.
 * @returns The manifest, or `undefined` when absent or incomplete.
 */
function readManifest(codeRoot: string): Zig2Manifest | undefined {
  const file = join(codeRoot, 'zig2.pkg')
  if (!existsSync(file)) return undefined
  const fields = new Map(
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => line.split('=') as [string, string | undefined])
      .filter((pair): pair is [string, string] => pair[1] !== undefined),
  )
  const name = fields.get('name')
  const entry = fields.get('entry')
  return name === undefined || entry === undefined ? undefined : { name, entry }
}

/**
 * A test double for a made-up language, `zig2`, with its own extension (`.z2`), manifest
 * (`zig2.pkg`), and layout. It exists to prove that a new language needs only an adapter:
 * nothing in the indexer knows about it.
 *
 * Source syntax, one statement per line: `export Name` declares and publishes a function,
 * and `import Name from "package"` imports a name from another package.
 */
export class StubLanguageAdapter implements LanguageAdapter {
  private readonly packageResolutionFacet: PackageResolutionFacet = {
    identity: (codeRoot) => readManifest(codeRoot)?.name,
    prepare: (context) => {
      const prepared = new Map<string, { readonly workspace: string; readonly entry: string }>()
      for (const workspace of context.workspaces) {
        const manifest = readManifest(workspace.codeRoot)
        if (manifest !== undefined) {
          prepared.set(manifest.name, { workspace: workspace.name, entry: manifest.entry })
        }
      }
      context.session.setAdapterState(STATE_KEY, prepared)
    },
    matchSpecifier: (specifier, knownPackages) =>
      knownPackages.includes(specifier) ? specifier : undefined,
    entrySurface: (request) => {
      const prepared =
        request.session.getAdapterState<
          Map<string, { readonly workspace: string; readonly entry: string }>
        >(STATE_KEY)
      const owner = prepared?.get(request.packageName)
      if (owner === undefined) return []
      const filePath = `${owner.workspace}:${owner.entry}`
      return [{ filePath, surface: filePath }]
    },
  }

  /**
   * Returns the package resolution facet of the stub.
   * @returns The facet.
   */
  get packageResolution(): PackageResolutionFacet {
    return this.packageResolutionFacet
  }

  /**
   * Returns the language identifiers of the stub.
   * @returns The identifiers.
   */
  languages(): string[] {
    return ['zig2']
  }

  /**
   * Returns the extension map of the stub.
   * @returns The extension to language map.
   */
  extensions(): Record<string, string> {
    return { '.z2': 'zig2' }
  }

  /**
   * Returns the manifest basenames the stub reads.
   * @returns The basenames.
   */
  resolutionManifests(): readonly string[] {
    return ['zig2.pkg']
  }

  /**
   * Parses the stub syntax into symbols, imports, and reference facts.
   * @param filePath - Workspace-prefixed file path.
   * @param content - File text.
   * @param context - Analysis context.
   * @returns The draft analysis.
   */
  analyzeFile(
    filePath: string,
    content: string,
    context: AdapterAnalyzeContext,
  ): FileAnalysisDraft {
    const symbols: SymbolNode[] = []
    const imports: ImportDeclaration[] = []
    const declarations: DeclarationOccurrence[] = []
    const publicBindings: PublicBinding[] = []
    const localBindings: LocalBinding[] = []
    const logicalSymbols = []
    for (const [index, raw] of content.split('\n').entries()) {
      const line = raw.trim()
      const exported = /^export (\w+)$/.exec(line)
      if (exported !== null) {
        const name = exported[1]!
        const symbol = createSymbolNode({
          name,
          kind: 'function',
          filePath,
          line: index + 1,
          column: 0,
          endLine: index + 1,
          endColumn: line.length,
        })
        const logical = createLogicalSymbol({
          workspace: context.workspaceName,
          surface: filePath,
          name,
          space: SymbolSpace.Value,
        })
        symbols.push(symbol)
        logicalSymbols.push(logical)
        declarations.push({
          logicalId: logical.id,
          symbolId: symbol.id,
          kind: SymbolKind.Function,
          occurrenceForm: DeclarationOccurrenceForm.Definition,
          location: {
            filePath,
            line: index + 1,
            column: 0,
            endLine: index + 1,
            endColumn: line.length,
          },
        })
        publicBindings.push(
          createPublicBinding({
            surface: filePath,
            exportedName: name,
            space: SymbolSpace.Value,
            targetId: logical.id,
          }),
        )
        continue
      }
      const imported = /^import (\w+) from "([^"]+)"$/.exec(line)
      if (imported !== null) {
        const name = imported[1]!
        imports.push({
          localName: name,
          originalName: name,
          specifier: imported[2]!,
          isRelative: false,
          kind: ImportDeclarationKind.Named,
        })
        localBindings.push(
          createLocalBinding({
            filePath,
            scopeId: 'module',
            localName: name,
            space: SymbolSpace.Value,
            targetId: undefined,
            range: {
              startLine: index + 1,
              startColumn: 0,
              endLine: index + 1,
              endColumn: line.length,
            },
          }),
        )
      }
    }
    return {
      language: 'zig2',
      symbols,
      imports,
      bindingFacts: [],
      callFacts: [],
      referenceFacts: {
        declarations,
        logicalSymbols,
        publicBindings,
        localBindings,
        hierarchy: [],
        steps: [],
        capabilities: {
          declarations: true,
          members: false,
          publicBindings: true,
          localBindings: true,
          hierarchy: false,
          buildContext: false,
        },
      },
    }
  }

  /**
   * Resolves each import through the shared package helpers.
   * @param analysis - Analysis of the importing file.
   * @param context - Import resolution context.
   * @returns The resolved imports.
   */
  resolveImports(analysis: FileAnalysis, context: ImportResolutionContext): ResolvedImports {
    const importMap = new Map<string, string>()
    const fileImports: string[] = []
    const steps: ResolutionStep[] = []
    const diagnostics: ImportDiagnostic[] = []
    for (const imp of analysis.imports) {
      const binding = analysis.referenceFacts?.localBindings.find(
        (item) => item.localName === imp.localName,
      )
      const result = context.resolvePackageExport({
        specifier: imp.specifier,
        exportedName: imp.originalName,
        spaces: [SymbolSpace.Value],
        fromFile: analysis.filePath,
        localBindingId: binding?.id ?? '',
      })
      if (result.status === 'resolved') {
        importMap.set(imp.localName, result.targetSymbolId)
        fileImports.push(result.entryFile)
        if (binding !== undefined) steps.push(result.step)
      } else {
        diagnostics.push({
          filePath: analysis.filePath,
          specifier: imp.specifier,
          exportedName: imp.originalName,
          reason: result.reason,
        })
      }
    }
    return { importMap, fileImports, steps, diagnostics }
  }

  /**
   * Builds no adapter-specific relations; the indexer derives `IMPORTS` from the resolved imports.
   * @param _analysis - Analysis of the file.
   * @param _context - Relation build context.
   * @returns No relations.
   */
  buildRelations(_analysis: FileAnalysis, _context: RelationBuildContext): Relation[] {
    return []
  }
}
