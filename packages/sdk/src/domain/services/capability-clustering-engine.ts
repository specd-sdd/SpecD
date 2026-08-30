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
 *
 * @param str - Input string (PascalCase, camelCase, or any mixed form)
 * @returns Kebab-case slug with deduplicated tokens
 */
function toKebabCase(str: string): string {
  const raw = str
    .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
    .replace(/[\s_:.]+/g, '-')
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
 * Sanitizes a raw slug: converts to kebab-case and strips leading workspace prefix redundancy if present.
 *
 * @param rawSlug - Raw slug derived from symbol or file name
 * @param workspace - Workspace name to strip as prefix if redundant
 * @returns Cleaned kebab-case slug without workspace prefix redundancy
 */
function sanitizeSlug(rawSlug: string, workspace: string): string {
  const cleanWorkspace = toKebabCase(workspace)
  let clean = toKebabCase(rawSlug)
  if (clean.startsWith(`${cleanWorkspace}-`) && clean.length > cleanWorkspace.length + 1) {
    clean = clean.substring(cleanWorkspace.length + 1)
  }
  return clean
}

/**
 * Strips known file extension from path.
 *
 * @param filePath - Source file path (relative or absolute)
 * @param supportedExtensions - Optional set of extensions to strip (e.g. `.ts`, `.py`)
 * @returns Path with known extension removed
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
    const noWsPath = filePath.includes(':')
      ? filePath.substring(filePath.indexOf(':') + 1)
      : filePath
    const relPath = noWsPath
      .replace(new RegExp(`^(?:packages|apps)/${workspace}/`, 'i'), '')
      .replace(new RegExp(`^${workspace}/`, 'i'), '')
    const cleanPath = stripExtension(relPath.replaceAll('\\', '/'), supportedExtensions)
    const segments = cleanPath
      .split('/')
      .filter((s) => s !== 'src' && s !== 'lib' && s !== 'dist' && s !== 'app' && Boolean(s))
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
      const cleanSlug = toKebabCase(
        fileName.replace(/-(?:use-case|usecase|action|workflow|interactor)$/, ''),
      )
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

    // 3. Infrastructure Adapters, Drivers & Storage Subsystems
    if (
      lowerPath.includes('infrastructure/') ||
      lowerPath.includes('adapters/') ||
      lowerPath.includes('drivers/') ||
      fileName.endsWith('-adapter') ||
      fileName.endsWith('-driver') ||
      fileName.endsWith('-store')
    ) {
      let rawSlug = fileName
      if (rawSlug === 'index' || rawSlug === 'exec' || rawSlug === 'helpers' || isGenericFile) {
        if (
          parentDir &&
          parentDir !== 'infrastructure' &&
          parentDir !== 'adapters' &&
          parentDir !== 'drivers'
        ) {
          rawSlug = parentDir
        }
      }
      const cleanSlug = sanitizeSlug(rawSlug, workspace)
      return {
        workspace,
        capabilitySlug: cleanSlug,
        capabilityKey: `${workspace}::${cleanSlug}`,
        category: 'INFRASTRUCTURE_SUBSYSTEM',
        titleSuffix: 'Infrastructure Subsystem',
        layer: 'infrastructure',
      }
    }

    // 4. Core Domain Entities & Aggregates
    if (
      lowerPath.includes('entities/') ||
      lowerPath.includes('entity/') ||
      lowerPath.includes('models/') ||
      lowerPath.includes('aggregate/') ||
      fileName.endsWith('-entity') ||
      fileName.endsWith('-aggregate')
    ) {
      const slug =
        fileName === 'index' && segments.length > 2 ? segments[segments.length - 2]! : fileName
      const cleanSlug = sanitizeSlug(slug.replace(/-(?:entity|aggregate)$/, ''), workspace)
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
      const slug =
        parentDir && parentDir !== 'domain' ? `${parentDir}-types` : `${workspace}-domain-types`
      const cleanSlug = sanitizeSlug(slug, workspace)
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
      const cleanSlug = sanitizeSlug(commandSuite, workspace)
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
      const slug =
        fileName === 'index' && segments.length > 2 ? segments[segments.length - 2]! : fileName
      const cleanSlug = sanitizeSlug(
        slug.replace(/-(?:service|detector|resolver|calculator|evaluator|engine)$/, ''),
        workspace,
      )
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
    if (
      lowerPath.includes('/helpers/') ||
      lowerPath.includes('/_shared/') ||
      lowerPath.includes('/utils/')
    ) {
      let slug = 'runtime-helpers'
      if (segments.length >= 2) {
        const parent = segments[segments.length - 2]!
        slug =
          parent === 'helpers' || parent === '_shared' || parent === 'utils' || parent === workspace
            ? 'helpers'
            : `${parent}-helpers`
      }
      const cleanSlug = sanitizeSlug(slug, workspace)
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
      const slug = domainPrefix.endsWith('errors') ? domainPrefix : `${domainPrefix}-errors`
      const cleanSlug = sanitizeSlug(slug, workspace)
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
      const cleanSlug = sanitizeSlug(fileName, workspace)
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

    if (
      fileName === 'index' ||
      fileName === 'public' ||
      fileName === 'ports' ||
      fileName === 'main'
    ) {
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
        } else if (
          parent === workspace ||
          parent === 'src' ||
          parent === 'lib' ||
          parent === 'app' ||
          parent.startsWith(workspace)
        ) {
          defaultSlug = `${workspace}-entrypoint`
        } else {
          defaultSlug = `${parent}-facade`
        }
      } else {
        defaultSlug = `${workspace}-entrypoint`
      }
    }

    const cleanSlug = sanitizeSlug(defaultSlug, workspace)
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
