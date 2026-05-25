import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createApiServer } from '../src/composition/create-api-server.js'
import { findRepoRoot } from './helpers/repo-root.js'

const uiDistPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/studio-ui-dist',
)

describe('Studio static UI (uiDistPath)', () => {
  it('given ui dist configured, when GET /, then serves SPA index.html', async () => {
    const server = await createApiServer({
      projectRoot: findRepoRoot(),
      port: 0,
      uiDistPath,
    })
    const address = await server.listen()
    try {
      const port = new URL(address).port
      const res = await fetch(`http://127.0.0.1:${port}/`)
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('SpecD Studio')
      expect(html).toMatch(/\/assets\/.+\.js/)
    } finally {
      await server.close()
    }
  })

  it('given ui dist configured, when GET /assets/*.js, then returns JavaScript not HTML fallback', async () => {
    const server = await createApiServer({
      projectRoot: findRepoRoot(),
      port: 0,
      uiDistPath,
    })
    const address = await server.listen()
    try {
      const port = new URL(address).port
      const index = await fetch(`http://127.0.0.1:${port}/`)
      const html = await index.text()
      const match = html.match(/src="(\/assets\/[^"]+\.js)"/)
      expect(match?.[1]).toBeTruthy()

      const res = await fetch(`http://127.0.0.1:${port}${match![1]}`)
      expect(res.status).toBe(200)
      const contentType = res.headers.get('content-type') ?? ''
      expect(contentType).toMatch(/javascript|ecmascript/i)
      const body = await res.text()
      expect(body.startsWith('<!')).toBe(false)
      expect(body.length).toBeGreaterThan(0)
    } finally {
      await server.close()
    }
  })
})
