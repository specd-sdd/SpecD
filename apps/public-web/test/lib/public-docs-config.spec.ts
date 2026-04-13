import { describe, expect, it } from 'vitest'
import * as publicDocsConfig from '../../src/lib/public-docs-config'

const {
  generatedApiPath,
  initialApiEntryPoints,
  isApiReferenceEnabled,
  publicApiDisableEnvVar,
  publicApiHref,
  publicDocsExclude,
  publicDocsHref,
  publicDocsPath,
  publicGithubHref,
  publicHomePageTitle,
  publicSiteDescription,
  publicSiteTagline,
  publicSiteTitle,
  publicSiteUrl,
  publicSocialImageHref,
} = publicDocsConfig

describe('public docs config', () => {
  it('keeps the repository docs tree as the authored source of truth', () => {
    expect(publicDocsPath).toBe('../../docs')
    expect(publicDocsExclude).toEqual(['adr/**'])
    expect(publicDocsExclude).toContain('adr/**')
  })

  it('publishes stable navigation routes and repository links', () => {
    expect(publicDocsHref).toBe('/docs/guide/getting-started')
    expect(publicApiHref).toBe('/api')
    expect(publicGithubHref).toBe('https://github.com/specd-sdd/SpecD')
  })

  it('exposes explicit homepage metadata for search and social previews', () => {
    expect(publicSiteTitle).toBe('SpecD')
    expect(publicSiteTagline).toBe('Spec-Driven Development for real codebases.')
    expect(publicHomePageTitle).toBe('Spec-Driven Development for real codebases')
    expect(publicSiteDescription).toContain('compiles agent context')
    expect(publicSiteUrl).toBe('https://getspecd.dev')
    expect(publicSocialImageHref).toBe('/img/og-card.svg')
  })

  it('locks the initial API surface to the curated packages', () => {
    expect(generatedApiPath).toBe('.generated/api')
    expect(initialApiEntryPoints).toEqual(['../../packages/core/src/index.ts'])
  })

  it('lets development disable the generated API plugin explicitly', () => {
    expect(isApiReferenceEnabled({ [publicApiDisableEnvVar]: '1' })).toBe(false)
    expect(isApiReferenceEnabled({ [publicApiDisableEnvVar]: '0' })).toBe(true)
    expect(isApiReferenceEnabled({})).toBe(true)
  })

  it('does not crash when evaluated without a process global', () => {
    const previousProcess = globalThis.process

    try {
      Reflect.deleteProperty(globalThis, 'process')

      const enabled = publicDocsConfig.isApiReferenceEnabled()

      expect(enabled).toBe(true)
    } finally {
      globalThis.process = previousProcess
    }
  })
})
