import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CLI_VERSION, CODE_GRAPH_VERSION, CORE_VERSION, SDK_VERSION } from '../src/version.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function readPackageVersion(relativePath: string): string {
  const packageJson = JSON.parse(readFileSync(join(packageRoot, relativePath), 'utf8')) as {
    version: string
  }
  return packageJson.version
}

describe('CLI version constants', () => {
  it('CLI_VERSION matches @specd/cli package.json', () => {
    expect(CLI_VERSION).toBe(readPackageVersion('package.json'))
  })

  it('SDK_VERSION matches @specd/sdk package.json', () => {
    expect(SDK_VERSION).toBe(readPackageVersion('../sdk/package.json'))
  })

  it('CORE_VERSION matches @specd/core package.json', () => {
    expect(CORE_VERSION).toBe(readPackageVersion('../core/package.json'))
  })

  it('CODE_GRAPH_VERSION matches @specd/code-graph package.json', () => {
    expect(CODE_GRAPH_VERSION).toBe(readPackageVersion('../code-graph/package.json'))
    expect(CODE_GRAPH_VERSION).not.toBe('0.0.0')
  })
})
