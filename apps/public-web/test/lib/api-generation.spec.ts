import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildApiIndexContent,
  escapeMdxBracesInLine,
  stripExternallyDefinedMembers,
} from '../../scripts/generate-api-docs.mjs'
import {
  apiPackageEntryPoints,
  generatedApiPath,
  initialApiEntryPoints,
} from '../../src/lib/public-docs-config'

const appRootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const typedocTsconfigPath = path.join(appRootPath, 'tsconfig.typedoc.json')
const typedocConfigPath = path.join(appRootPath, 'typedoc.json')

describe('API generation config', () => {
  it('writes generated reference output into the derived app-local directory', () => {
    expect(generatedApiPath.startsWith('.generated/')).toBe(true)
    expect(generatedApiPath).toBe('.generated/api')
  })

  it('documents sdk, core, and code-graph public barrels in order', () => {
    expect(apiPackageEntryPoints).toHaveLength(3)
    expect(apiPackageEntryPoints.map((entry) => entry.id)).toEqual(['sdk', 'core', 'code-graph'])
    expect(initialApiEntryPoints).toEqual([
      '../../packages/sdk/src/index.ts',
      '../../packages/core/src/public.ts',
      '../../packages/code-graph/src/public.ts',
    ])
  })

  it('encodes prose braces so generated markdown stays MDX-safe', () => {
    expect(escapeMdxBracesInLine('Pass { force: true } to bypass validation.')).toBe(
      'Pass &#123; force: true &#125; to bypass validation.',
    )
    expect(escapeMdxBracesInLine('> **ContextEntry** = \\{ `instruction`: `string`; \\}')).toBe(
      '> **ContextEntry** = &#123; `instruction`: `string`; &#125;',
    )
  })

  it('preserves inline code while sanitizing surrounding prose', () => {
    expect(
      escapeMdxBracesInLine('Object shape \\{ value: string \\} and `const value = { ok: true }`.'),
    ).toBe('Object shape &#123; value: string &#125; and `const value = { ok: true }`.')
  })

  it('creates a synthetic overview doc for the api root route', () => {
    const content = buildApiIndexContent(apiPackageEntryPoints)

    expect(content).toContain('title: API Reference')
    expect(content).toContain('# Public API Reference')
    expect(content).toContain('## @specd/sdk')
    expect(content).toContain('## @specd/core')
    expect(content).toContain('## @specd/code-graph')
    expect(content).toContain('/api/sdk/classes/AlreadyInitialisedError')
    expect(content).toContain('/api/core/')
    expect(content).toContain('/api/code-graph/')
  })

  it('resolves public packages from source entrypoints for TypeDoc', () => {
    const typedocTsconfig = JSON.parse(fs.readFileSync(typedocTsconfigPath, 'utf8'))

    expect(typedocTsconfig.compilerOptions.paths['@specd/core']).toEqual([
      'packages/core/src/public.ts',
    ])
    expect(typedocTsconfig.compilerOptions.paths['@specd/code-graph']).toEqual([
      'packages/code-graph/src/public.ts',
    ])
    expect(typedocTsconfig.include).toEqual(
      expect.arrayContaining([
        '../../packages/sdk/src/**/*.ts',
        '../../packages/core/src/**/*.ts',
        '../../packages/code-graph/src/**/*.ts',
      ]),
    )
  })

  it('pins TypeDoc source links to the main branch', () => {
    const typedocConfig = JSON.parse(fs.readFileSync(typedocConfigPath, 'utf8'))

    expect(typedocConfig.gitRevision).toBe('main')
    expect(typedocConfig.gitRemote).toBe('origin')
  })

  it('removes inherited node_modules members from generated class pages', () => {
    const sample = `## Properties

### message

> **message**: \`string\`

Defined in: node_modules/typescript/lib/lib.es5.d.ts:1077

***

### code

> **code**: \`string\`

Defined in: packages/core/src/domain/errors/specd-error.ts:20

## Methods

### captureStackTrace()

Defined in: node_modules/@types/node/globals.d.ts:52

\`\`\`js
function a() {
  b();
}
\`\`\`
`

    const cleaned = stripExternallyDefinedMembers(sample)

    expect(cleaned).not.toContain('function a()')
    expect(cleaned).not.toContain('lib.es5.d.ts')
    expect(cleaned).not.toContain('## Methods')
    expect(cleaned).toContain('### code')
    expect(cleaned).toContain('packages/core/src/domain/errors/specd-error.ts:20')
  })
})
