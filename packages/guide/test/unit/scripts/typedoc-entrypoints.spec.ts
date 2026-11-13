import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const bootstrapWithPlugins = vi.fn(async (_options: Record<string, unknown>) => ({
  convert: async () => undefined,
}))

vi.mock('typedoc', () => ({ Application: { bootstrapWithPlugins } }))

import { generateSdkApiTopics, loadApiEntryPoints } from '../../../scripts/sdk-api-generator.js'

const repoRoot = path.resolve(import.meta.dirname, '../../../../..')

describe('generateSdkApiTopics entry points', () => {
  it('passes every curated entry point to TypeDoc as a POSIX path', async () => {
    // GIVEN the curated API entry points of the public site
    // WHEN TypeDoc is bootstrapped for the first entry point
    // THEN the entryPoints option holds a single path without backslashes
    await expect(generateSdkApiTopics(repoRoot)).rejects.toThrow(
      'TypeDoc could not convert API entrypoint',
    )

    const options = bootstrapWithPlugins.mock.calls[0]?.[0]
    const entryPoints = options?.['entryPoints'] as string[]
    expect(entryPoints).toHaveLength(1)
    expect(entryPoints[0]).not.toContain('\\')

    const first = loadApiEntryPoints(repoRoot)[0]
    const expected = path
      .resolve(path.join(repoRoot, 'apps/public-web'), first?.entryPoint ?? '')
      .replace(/\\/g, '/')
    expect(entryPoints[0]).toBe(expected)
  })
})
