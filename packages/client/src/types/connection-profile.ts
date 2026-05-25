/** How the Studio shell reaches project data. */

export type RemoteConnectionProfile = {
  kind: 'remote'
  apiBaseUrl: string
  token?: string
}

export type EmbeddedConnectionProfile = {
  kind: 'embedded'
}

export type DesktopLocalConnectionProfile = {
  kind: 'desktop-local'
}

export type SpecdConnectionProfile =
  | RemoteConnectionProfile
  | EmbeddedConnectionProfile
  | DesktopLocalConnectionProfile

export function normalizeApiBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/v1')) {
    return trimmed
  }
  return `${trimmed}/v1`
}
