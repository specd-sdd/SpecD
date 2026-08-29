import { describe, it, expect } from 'vitest'
import { CapabilityClusteringEngine } from '../../../src/domain/services/capability-clustering-engine.js'

describe('CapabilityClusteringEngine', () => {
  it('classifies application use cases correctly', () => {
    const anchor = CapabilityClusteringEngine.resolveCapabilityAnchor(
      'core',
      'src/application/use-cases/create-change.ts',
    )

    expect(anchor.category).toBe('APPLICATION_USE_CASE')
    expect(anchor.capabilitySlug).toBe('create-change')
    expect(anchor.capabilityKey).toBe('core::create-change')
    expect(anchor.layer).toBe('application')
  })

  it('classifies domain ports and storage contracts correctly', () => {
    const anchor = CapabilityClusteringEngine.resolveCapabilityAnchor(
      'core',
      'src/domain/ports/fs-spec-repository.ts',
    )

    expect(anchor.category).toBe('PORT_OR_CONTRACT')
    expect(anchor.capabilitySlug).toBe('spec-repository')
    expect(anchor.capabilityKey).toBe('core::spec-repository')
    expect(anchor.layer).toBe('ports')
  })

  it('classifies core domain entities correctly', () => {
    const anchor = CapabilityClusteringEngine.resolveCapabilityAnchor(
      'core',
      'src/domain/entities/change.ts',
    )

    expect(anchor.category).toBe('CORE_DOMAIN_ENTITY')
    expect(anchor.capabilitySlug).toBe('change')
    expect(anchor.capabilityKey).toBe('core::change')
    expect(anchor.layer).toBe('domain')
  })

  it('classifies infrastructure adapters correctly', () => {
    const anchor = CapabilityClusteringEngine.resolveCapabilityAnchor(
      'code-graph',
      'src/infrastructure/sqlite/sqlite-graph-store.ts',
    )

    expect(anchor.category).toBe('INFRASTRUCTURE_SUBSYSTEM')
    expect(anchor.capabilitySlug).toBe('sqlite-graph-store')
    expect(anchor.layer).toBe('infrastructure')
  })

  it('classifies domain services and engines correctly', () => {
    const anchor = CapabilityClusteringEngine.resolveCapabilityAnchor(
      'sdk',
      'src/domain/services/transitive-reduction-engine.ts',
    )

    expect(anchor.category).toBe('DOMAIN_SERVICE')
    expect(anchor.capabilitySlug).toBe('transitive-reduction')
    expect(anchor.layer).toBe('services')
  })

  it('classifies CLI commands correctly', () => {
    const anchor = CapabilityClusteringEngine.resolveCapabilityAnchor(
      'cli',
      'src/commands/specs/suggest.ts',
    )

    expect(anchor.category).toBe('PUBLIC_INTERFACE_API')
    expect(anchor.capabilitySlug).toBe('specs-suggest')
    expect(anchor.layer).toBe('commands')
  })

  it('strips polyglot language extensions cleanly (.php, .py, .go)', () => {
    const supported = new Set(['.php', '.py', '.go', '.ts'])

    const phpAnchor = CapabilityClusteringEngine.resolveCapabilityAnchor(
      'backend',
      'app/Domain/Actions/ArticleEasyRead.php',
      supported,
    )
    expect(phpAnchor.capabilitySlug).toBe('article-easy-read')

    const pyAnchor = CapabilityClusteringEngine.resolveCapabilityAnchor(
      'ml',
      'services/text_classifier.py',
      supported,
    )
    expect(pyAnchor.capabilitySlug).toBe('text-classifier')

    const goAnchor = CapabilityClusteringEngine.resolveCapabilityAnchor(
      'gateway',
      'pkg/ports/user_repository.go',
      supported,
    )
    expect(goAnchor.capabilitySlug).toBe('user-repository')
  })
})
