import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as sdk from '../src/index.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  version: string
}

describe('@specd/sdk barrel', () => {
  it('exports SDK_VERSION matching package.json', () => {
    expect(sdk.SDK_VERSION).toBe(packageJson.version)
  })

  it('exports host bootstrap and orchestration symbols', () => {
    expect(typeof sdk.openSpecdHost).toBe('function')
    expect(typeof sdk.createSdkContext).toBe('function')
    expect(typeof sdk.withOpenGraphProvider).toBe('function')
    expect(typeof sdk.buildProjectStatusSnapshot).toBe('function')
    expect(typeof sdk.runIndexProjectGraph).toBe('function')
  })

  it('re-exports core bootstrap factories', () => {
    expect(typeof sdk.createConfigLoader).toBe('function')
    expect(typeof sdk.createConfigWriter).toBe('function')
    expect(typeof sdk.createKernel).toBe('function')
  })

  it('does not export infrastructure or internal helpers', () => {
    expect('FsConfigLoader' in sdk).toBe(false)
    expect('codeGraphVersion' in sdk).toBe(false)
    expect('createVcsAdapter' in sdk).toBe(false)
  })
})
