import { afterAll, beforeAll } from 'vitest'
import { setupApiTestServer, teardownApiTestServer } from './helpers/api-test-server.js'

beforeAll(async () => {
  await setupApiTestServer()
}, 120_000)

afterAll(async () => {
  await teardownApiTestServer()
})
