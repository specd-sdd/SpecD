import { createApiServer, type ApiServer } from '../../src/composition/create-api-server.js'
import { findRepoRoot } from './repo-root.js'

let server: ApiServer | null = null
let v1BaseUrl = ''

/** Starts one in-process API server for the whole Vitest worker. */
export async function setupApiTestServer(): Promise<string> {
  if (v1BaseUrl.length > 0) {
    return v1BaseUrl
  }
  server = await createApiServer({ projectRoot: findRepoRoot(), port: 0 })
  const address = await server.listen()
  const port = new URL(address).port
  v1BaseUrl = `http://127.0.0.1:${port}/v1`
  return v1BaseUrl
}

export function getApiBaseUrl(): string {
  if (v1BaseUrl.length === 0) {
    throw new Error('API test server not started — add test/setup.ts as a Vitest setupFile')
  }
  return v1BaseUrl
}

export async function teardownApiTestServer(): Promise<void> {
  if (server !== null) {
    await server.close()
    server = null
    v1BaseUrl = ''
  }
}
