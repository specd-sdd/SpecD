import { type SpecCategory } from '../value-objects/candidate-spec.js'

/**
 * Resolved architectural anchor metadata for a source file.
 */
export interface CapabilityAnchor {
  readonly workspace: string
  readonly capabilitySlug: string
  readonly capabilityKey: string
  readonly category: SpecCategory
  readonly titleSuffix: string
  readonly layer: string
}

/**
 * Converts a string into a URL/spec-safe kebab-case slug
 * with no consecutive duplicate words and no multiple hyphens.
 */
function toKebabCase(str: string): string {
  const raw = str
    .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
    .replace(/[\s_.]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')

  const tokens = raw.split('-').filter(Boolean)
  const deduplicated: string[] = []
  for (const token of tokens) {
    if (deduplicated.length === 0 || deduplicated[deduplicated.length - 1] !== token) {
      deduplicated.push(token)
    }
  }

  // Remove redundant trailing token if it duplicates the leading token (e.g. 'graph-index-graph' -> 'graph-index')
  if (deduplicated.length >= 3 && deduplicated[0] === deduplicated[deduplicated.length - 1]) {
    deduplicated.pop()
  }

  return deduplicated.join('-')
}

/**
 * Strips known file extension from path.
 */
function stripExtension(filePath: string, supportedExtensions?: ReadonlySet<string>): string {
  if (supportedExtensions && supportedExtensions.size > 0) {
    for (const ext of supportedExtensions) {
      const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`
      if (filePath.endsWith(normalizedExt)) {
        return filePath.slice(0, -normalizedExt.length)
      }
    }
  }
  return filePath.replace(/\.[a-zA-Z0-9_-]+$/, '')
}

/**
 * Pure domain service for polyglot capability clustering based on Clean Architecture / DDD patterns.
 */
export class CapabilityClusteringEngine {
  /**
   * Resolves the capability anchor, Clean Architecture category, and slug for a source file or distinct symbol.
   *
   * @param workspace - Workspace name where the file lives (e.g. 'core', 'sdk', 'cli').
   * @param filePath - Relative path of the source file.
   * @param supportedExtensions - Optional set of supported file extensions from AdapterRegistryPort.
   * @param primarySymbolName - Optional distinct symbol name for symbol-level granularity in multi-symbol files.
   * @returns CapabilityAnchor detailing the capability key and architectural role.
   */
  static resolveCapabilityAnchor(
    workspace: string,
    filePath: string,
    supportedExtensions?: ReadonlySet<string>,
    primarySymbolName?: string,
  ): CapabilityAnchor {
    const cleanPath = stripExtension(filePath.replaceAll('\\', '/'), supportedExtensions)
    const segments = cleanPath.split('/').filter((s) => s !== 'src' && s !== 'lib' && s !== 'dist' && s !== 'app' && Boolean(s))
    const rawFileName = segments[segments.length - 1] || 'index'
    const parentDir = segments.length > 1 ? segments[segments.length - 2] : ''
    const lowerPath = cleanPath.toLowerCase()

    const isGenericFile =
      /^(?:index|main|services|actions|utils|types|models|entities|all|handlers|routes|helpers|app|lib|legacy.*|.*services|.*actions|.*utils|.*helpers)$/i.test(
        rawFileName,
      )
    const fileName =
      isGenericFile && primarySymbolName ? toKebabCase(primarySymbolName) : rawFileName

    // 1. Application & Composition Use Cases
    if (
      lowerPath.includes('use-cases/') ||
      lowerPath.includes('usecases/') ||
      lowerPath.includes('workflows/') ||
      lowerPath.includes('interactors/') ||
      lowerPath.includes('actions/') ||
      fileName.endsWith('-use-case') ||
      fileName.endsWith('usecase') ||
      fileName.endsWith('-action') ||
      fileName.endsWith('-workflow') ||
      fileName.endsWith('-interactor') ||
      (primarySymbolName && /usecase|action|workflow|interactor/i.test(primarySymbolName))
    ) {
      const cleanSlug = toKebabCase(fileName.replace(/-(?:use-case|usecase|action|workflow|interactor)$/, ''))
      return {
        workspace,
        capabilitySlug: cleanSlug,
        capabilityKey: `${workspace}::${cleanSlug}`,
        category: 'APPLICATION_USE_CASE',
        titleSuffix: 'Workflow & Use Case',
        layer: 'application',
      }
    }

    // 2. Repositories, Ports & Concrete Storage Contracts
    if (
      lowerPath.includes('ports/') ||
      lowerPath.includes('contracts/') ||
      lowerPath.includes('repositories/') ||
      lowerPath.includes('gateways/') ||
      fileName.endsWith('-repository') ||
      fileName.endsWith('-port') ||
      fileName.endsWith('-contract') ||
      fileName.endsWith('-gateway') ||
      (primarySymbolName && /repository|port|contract|gateway/i.test(primarySymbolName))
    ) {
      const slug = fileName.replace(/^(?:fs|memory|sqlite|postgres|mock|stub)-/, '')
      const cleanSlug = toKebabCase(slug)
      return {
        workspace,
        capabilitySlug: cleanSlug,
        capabilityKey: `${workspace}::${cleanSlug}`,
        category: 'PORT_OR_CONTRACT',
        titleSuffix: 'Port & Storage Contract',
        layer: 'ports',
      }
    }

    // 3. VCS Adapters (Git, Hg, Svn)
    if (lowerPath.includes('/git/') || lowerPath.includes('infrastructure/git') || fileName.startsWith('git-')) {
      return {
        workspace,
        capabilitySlug: 'git-vcs-adapter',
        capabilityKey: `${workspace}::git-vcs-adapter`,
        category: 'INFRASTRUCTURE_SUBSYSTEM',
        titleSuffix: 'Git Version Control Adapter',
        layer: 'infrastructure',
      }
    }
    if (lowerPath.includes('/hg/') || lowerPath.includes('infrastructure/hg') || fileName.startsWith('hg-')) {
      return {
        workspace,
        capabilitySlug: 'hg-vcs-adapter',
        capabilityKey: `${workspace}::hg-vcs-adapter`,
        category: 'INFRASTRUCTURE_SUBSYSTEM',
        titleSuffix: 'Mercurial Version Control Adapter',
        layer: 'infrastructure',
      }
    }
    if (lowerPath.includes('/svn/') || lowerPath.includes('infrastructure/svn') || fileName.startsWith('svn-')) {
      return {
        workspace,
        capabilitySlug: 'svn-vcs-adapter',
        capabilityKey: `${workspace}::svn-vcs-adapter`,
        category: 'INFRASTRUCTURE_SUBSYSTEM',
        titleSuffix: 'Subversion Version Control Adapter',
        layer: 'infrastructure',
      }
    }

    // 4. SQLite Storage & Worker Subsystem
    if (lowerPath.includes('sqlite/') || lowerPath.includes('infrastructure/sqlite') || fileName.includes('sqlite')) {
      return {
        workspace,
        capabilitySlug: 'sqlite-graph-store',
        capabilityKey: `${workspace}::sqlite-graph-store`,
        category: 'INFRASTRUCTURE_SUBSYSTEM',
        titleSuffix: 'SQLite Storage Subsystem',
        layer: 'infrastructure',
      }
    }

    // 5. Tree-Sitter & Language Adapters
    if (lowerPath.includes('tree-sitter/') || lowerPath.includes('adapters/')) {
      let slug = fileName
      if (!fileName.endsWith('-language-adapter') && !fileName.endsWith('-adapter')) {
        slug = 'tree-sitter-adapter-registry'
      }
      const cleanSlug = toKebabCase(slug)
      return {
        workspace,
        capabilitySlug: cleanSlug,
        capabilityKey: `${workspace}::${cleanSlug}`,
        category: 'INFRASTRUCTURE_SUBSYSTEM',
        titleSuffix: 'Language AST Adapter Subsystem',
        layer: 'infrastructure',
      }
    }

    // 6. Generic File System Storage Infrastructure
    if (lowerPath.includes('infrastructure/fs') || lowerPath.includes('/fs/')) {
      let slug = 'fs-storage-adapter'
      if (fileName.endsWith('-repository') || fileName.endsWith('-cache') || fileName.endsWith('-store')) {
        slug = fileName.replace(/^(?:fs|memory|mock)-/, '')
      }
      const cleanSlug = toKebabCase(slug)
      return {
        workspace,
        capabilitySlug: cleanSlug,
        capabilityKey: `${workspace}::${cleanSlug}`,
        category: 'INFRASTRUCTURE_SUBSYSTEM',
        titleSuffix: 'FileSystem Storage Adapter',
        layer: 'infrastructure',
      }
    }

    // 7. Core Domain Entities & Aggregates
    if (
      lowerPath.includes('entities/') ||
      lowerPath.includes('entity/') ||
      lowerPath.includes('models/') ||
      lowerPath.includes('aggregate/') ||
      fileName.endsWith('-entity') ||
      fileName.endsWith('-aggregate')
    ) {
      let slug = fileName === 'index' && segments.length > 2 ? segments[segments.length - 2]! : fileName
      if (slug.includes('archived-change') || slug.includes('change-state') || slug.includes('change-lifecycle')) {
        slug = 'change'
      }
      const cleanSlug = toKebabCase(slug.replace(/-(?:entity|aggregate)$/, ''))
      return {
        workspace,
        capabilitySlug: cleanSlug,
        capabilityKey: `${workspace}::${cleanSlug}`,
        category: 'CORE_DOMAIN_ENTITY',
        titleSuffix: 'Domain Model & Aggregate',
        layer: 'domain',
      }
    }

    // 8. Domain Value Objects & Shared Schemas
    if (
      lowerPath.includes('domain/value-objects') ||
      lowerPath.includes('domain/value-object') ||
      lowerPath.includes('domain/schemas') ||
      lowerPath.includes('domain/types')
    ) {
      const slug = parentDir && parentDir !== 'domain' ? `${parentDir}-types` : `${workspace}-domain-types`
      const cleanSlug = toKebabCase(slug)
      return {
        workspace,
        capabilitySlug: cleanSlug,
        capabilityKey: `${workspace}::${cleanSlug}`,
        category: 'CORE_DOMAIN_ENTITY',
        titleSuffix: 'Domain Value Objects & Types',
        layer: 'domain',
      }
    }

    // 9. CLI Commands & Public API Suites
    if (
      lowerPath.includes('commands/') ||
      lowerPath.includes('cli/') ||
      lowerPath.includes('controllers/') ||
      lowerPath.includes('routes/') ||
      lowerPath.includes('api/')
    ) {
      const baseFileName = fileName.replace(/^_+/, '')
      let commandSuite = baseFileName
      if (lowerPath.includes('commands/') && segments.length >= 2) {
        const groupDir = segments[segments.length - 2]!
        if (groupDir && groupDir !== 'commands' && groupDir !== 'src' && groupDir !== 'cli') {
          commandSuite = `${groupDir}-${baseFileName}`
        }
      }
      const cleanSlug = toKebabCase(commandSuite)
      return {
        workspace,
        capabilitySlug: cleanSlug,
        capabilityKey: `${workspace}::${cleanSlug}`,
        category: 'PUBLIC_INTERFACE_API',
        titleSuffix: 'Command Interface & Tooling',
        layer: 'commands',
      }
    }

    // 10. Domain Services & Algorithms
    if (
      lowerPath.includes('services/') ||
      lowerPath.includes('algorithms/') ||
      lowerPath.includes('rules/') ||
      fileName.endsWith('-service') ||
      fileName.endsWith('-detector') ||
      fileName.endsWith('-resolver') ||
      fileName.endsWith('-calculator') ||
      fileName.endsWith('-evaluator') ||
      fileName.endsWith('-engine')
    ) {
      const slug = fileName === 'index' && segments.length > 2 ? segments[segments.length - 2]! : fileName
      const cleanSlug = toKebabCase(slug.replace(/-(?:service|detector|resolver|calculator|evaluator|engine)$/, ''))
      return {
        workspace,
        capabilitySlug: cleanSlug,
        capabilityKey: `${workspace}::${cleanSlug}`,
        category: 'DOMAIN_SERVICE',
        titleSuffix: 'Domain Service & Operations',
        layer: 'services',
      }
    }

    // 11. Application & Shared CLI Helpers
    if (lowerPath.includes('/helpers/') || lowerPath.includes('/_shared/') || lowerPath.includes('/utils/')) {
      let slug = 'runtime-helpers'
      if (segments.length >= 2) {
        const parent = segments[segments.length - 2]!
        slug = parent === 'helpers' || parent === '_shared' || parent === 'utils' || parent === workspace
          ? 'helpers'
          : `${parent}-helpers`
      }
      const cleanSlug = toKebabCase(slug)
      return {
        workspace,
        capabilitySlug: cleanSlug,
        capabilityKey: `${workspace}::${cleanSlug}`,
        category: 'UTILITY_SUPPORT',
        titleSuffix: 'Runtime Helpers & Shared Infrastructure',
        layer: 'helpers',
      }
    }

    // 12. Errors & Exception Invariants
    if (lowerPath.includes('errors/') || fileName.endsWith('-error')) {
      let domainPrefix = workspace
      if (segments.length > 2) {
        const parent = segments[segments.length - 2]!
        if (parent !== 'errors' && parent !== 'src' && parent !== 'domain') {
          domainPrefix = parent
        } else if (segments.length > 3) {
          const grandParent = segments[segments.length - 3]!
          if (grandParent !== 'src' && grandParent !== 'domain' && grandParent !== 'errors') {
            domainPrefix = grandParent
          }
        }
      }
      const slug = domainPrefix.endsWith('errors')
        ? domainPrefix
        : `${domainPrefix}-errors`
      const cleanSlug = toKebabCase(slug)
      return {
        workspace,
        capabilitySlug: cleanSlug,
        capabilityKey: `${workspace}::${cleanSlug}`,
        category: 'CORE_DOMAIN_ENTITY',
        titleSuffix: 'Domain Errors & Invariants',
        layer: 'errors',
      }
    }

    // 13. Composition Wiring (Attach to capability if named)
    if (lowerPath.includes('/composition/')) {
      const cleanSlug = toKebabCase(fileName)
      return {
        workspace,
        capabilitySlug: cleanSlug,
        capabilityKey: `${workspace}::${cleanSlug}`,
        category: 'APPLICATION_USE_CASE',
        titleSuffix: 'Composition & Factory Wiring',
        layer: 'composition',
      }
    }

    // 14. Root Barrels & Public Interface Entrypoints
    let defaultSlug = fileName
    let category: SpecCategory = 'PUBLIC_INTERFACE_API'
    let layer = 'facade'

    if (fileName === 'index' || fileName === 'public' || fileName === 'ports' || fileName === 'main') {
      if (segments.length > 1) {
        const parent = segments[segments.length - 2]!
        if (parent === 'ports') {
          defaultSlug = 'ports-registry'
          category = 'PORT_OR_CONTRACT'
          layer = 'ports'
        } else if (parent === 'entities' || parent === 'models') {
          defaultSlug = 'domain-entities-registry'
          category = 'CORE_DOMAIN_ENTITY'
          layer = 'domain'
        } else if (parent === 'use-cases' || parent === 'usecases') {
          defaultSlug = 'use-cases-registry'
          category = 'APPLICATION_USE_CASE'
          layer = 'application'
        } else {
          defaultSlug = `${parent}-facade`
        }
      } else {
        defaultSlug = `${workspace}-entrypoint`
      }
    }

    const cleanSlug = toKebabCase(defaultSlug)
    return {
      workspace,
      capabilitySlug: cleanSlug,
      capabilityKey: `${workspace}::${cleanSlug}`,
      category,
      titleSuffix: 'Public Interface & Module Barrel',
      layer,
    }
  }
}
