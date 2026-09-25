import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type LanguageAdapter } from '../../../src/domain/value-objects/language-adapter.js'
import { GoLanguageAdapter } from '../../../src/infrastructure/tree-sitter/go-language-adapter.js'
import { PhpLanguageAdapter } from '../../../src/infrastructure/tree-sitter/php-language-adapter.js'
import { PythonLanguageAdapter } from '../../../src/infrastructure/tree-sitter/python-language-adapter.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    readFileSync: vi.fn(actual.readFileSync),
    lstatSync: vi.fn(actual.lstatSync),
    statSync: vi.fn(actual.statSync),
  }
})

/**
 * Adapter that declares no resolution manifest.
 */
class NoManifestAdapter implements LanguageAdapter {
  /**
   * Reports no languages.
   * @returns An empty language list.
   */
  languages(): string[] {
    return []
  }

  /**
   * Reports no extension map.
   * @returns An empty extension map.
   */
  extensions(): Record<string, string> {
    return {}
  }

  /**
   * Declares that this adapter reads no resolution manifest.
   * @returns An empty basename list.
   */
  resolutionManifests(): readonly string[] {
    return []
  }

  /**
   * Unused by these scenarios.
   * @returns Nothing. This method always throws.
   */
  analyzeFile(): never {
    throw new Error('unused')
  }

  /**
   * Unused by these scenarios.
   * @returns Nothing. This method always throws.
   */
  resolveImports(): never {
    throw new Error('unused')
  }

  /**
   * Unused by these scenarios.
   * @returns Nothing. This method always throws.
   */
  buildRelations(): never {
    throw new Error('unused')
  }
}

describe('resolutionManifests', () => {
  const filesystem = [existsSync, readFileSync, lstatSync, statSync]

  beforeEach(() => {
    for (const fn of filesystem) vi.mocked(fn).mockClear()
  })

  it('given built-in adapters, when resolutionManifests is called, then no filesystem read or stat occurs', () => {
    const adapters = [
      new TypeScriptLanguageAdapter(),
      new GoLanguageAdapter(),
      new PhpLanguageAdapter(),
      new PythonLanguageAdapter(),
    ]
    expect(adapters.map((adapter) => adapter.resolutionManifests())).toEqual([
      ['package.json'],
      ['go.mod'],
      ['composer.json'],
      ['pyproject.toml'],
    ])
    for (const fn of filesystem) {
      expect(fn).not.toHaveBeenCalled()
    }
  })

  it('given an adapter that reads no manifest, when resolutionManifests is called, then it returns an empty array', () => {
    const adapter = new NoManifestAdapter()
    expect(adapter.resolutionManifests()).toEqual([])
    for (const fn of filesystem) {
      expect(fn).not.toHaveBeenCalled()
    }
  })
})
