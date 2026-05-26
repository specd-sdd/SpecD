import { apiJson } from './http-client.js'

const EPHEMERAL_PREFIX = 'api-test'

/** Unique change name for API integration tests (never use the repo's active change). */
export function ephemeralChangeName(suffix: string): string {
  return `${EPHEMERAL_PREFIX}-${suffix}-${Date.now()}`
}

/**
 * Creates a disposable change via POST /changes for mutation tests.
 * @returns The created change name.
 */
export async function createEphemeralChange(options?: {
  readonly name?: string
  readonly description?: string
  readonly specIds?: readonly string[]
}): Promise<string> {
  const name = options?.name ?? ephemeralChangeName('fixture')
  const { res, data } = await apiJson<{ name: string }>('/changes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      specIds: options?.specIds ?? [],
      ...(options?.description !== undefined ? { description: options.description } : {}),
    }),
  })
  if (!res.ok) {
    throw new Error(`createEphemeralChange failed for "${name}": HTTP ${res.status}`)
  }
  return data.name
}

/** Discards a change created by {@link createEphemeralChange}. */
export async function discardEphemeralChange(name: string): Promise<void> {
  const { res } = await apiJson<unknown>(`/changes/${encodeURIComponent(name)}/discard`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'api test cleanup' }),
  })
  if (!res.ok) {
    throw new Error(`discardEphemeralChange failed for "${name}": HTTP ${res.status}`)
  }
}
