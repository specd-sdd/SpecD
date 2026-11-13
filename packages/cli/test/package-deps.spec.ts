import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  dependencies?: Record<string, string>
}

describe('@specd/cli runtime dependencies', () => {
  it('depends on @specd/sdk as the sole specd platform package', () => {
    const dependencies = Object.keys(manifest.dependencies ?? {})

    expect(dependencies).toContain('@specd/sdk')
    expect(dependencies).not.toContain('@specd/core')
    expect(dependencies).not.toContain('@specd/code-graph')
    // Other specd workspace packages are plugins, schemas, the guide and the plugin manager only.
    const others = dependencies.filter(
      (name) => name.startsWith('@specd/') && name !== '@specd/sdk',
    )
    for (const name of others) {
      expect(name).toMatch(/^@specd\/(plugin-manager|plugin-agent-[a-z]+|schema-[a-z]+|guide)$/)
    }
  })
})
