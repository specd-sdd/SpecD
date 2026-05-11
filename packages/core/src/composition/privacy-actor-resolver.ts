import { createHmac } from 'node:crypto'
import { type ActorIdentity } from '../domain/entities/change.js'
import { type ActorResolver } from '../application/ports/actor-resolver.js'
import { type PrivacyConfig } from '../application/specd-config.js'

/**
 * Decorator that applies privacy rules to an {@link ActorResolver}.
 *
 * Supports hashing (HMAC-SHA256), masking, and anonymization of actor identities.
 * Also handles metadata filtering based on whitelists.
 */
export class PrivacyActorResolver implements ActorResolver {
  /**
   * Creates a new `PrivacyActorResolver`.
   *
   * @param _inner - The base resolver to wrap
   * @param _config - Privacy configuration
   */
  constructor(
    private readonly _inner: ActorResolver,
    private readonly _config: PrivacyConfig,
  ) {}

  /**
   * Returns the identity of the current actor, processed according to privacy rules.
   *
   * @returns The obfuscated actor identity
   */
  async identity(): Promise<ActorIdentity> {
    const raw = await this._inner.identity()

    if (this._isExcluded(raw)) {
      return raw
    }

    const { mode, salt, allowedMetadataKeys } = this._config

    if (mode === 'anonymous') {
      return {
        name: 'Anonymous',
        email: 'anonymous@getspecd.dev',
      }
    }

    const name = this._maskName(raw.name)
    const email = mode === 'hash' ? this._hashEmail(raw.email, salt) : this._maskEmail(raw.email)

    const metadata: Record<string, string> = {}
    if (allowedMetadataKeys && raw.metadata) {
      for (const key of allowedMetadataKeys) {
        if (raw.metadata[key] !== undefined) {
          metadata[key] = raw.metadata[key]
        }
      }
    }

    return {
      name,
      email,
      ...(raw.provider !== undefined ? { provider: raw.provider } : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    }
  }

  /**
   * Checks if an identity is explicitly excluded from obfuscation.
   *
   * @param identity - The raw identity to check
   * @returns `true` if the identity should be kept verbatim
   */
  private _isExcluded(identity: ActorIdentity): boolean {
    const exclude = this._config.excludeActors ?? ['specd', 'system@getspecd.dev']
    const name = identity.name.toLowerCase()
    const email = identity.email.toLowerCase()
    return exclude.some((e) => {
      const target = e.toLowerCase()
      return name === target || email === target
    })
  }

  /**
   * Hashes an email address using HMAC-SHA256.
   *
   * @param email - The email to hash
   * @param salt - The secret salt
   * @returns Hex-encoded hash
   */
  private _hashEmail(email: string, salt?: string): string {
    if (!salt) {
      // Should be prevented by config validation
      return this._maskEmail(email)
    }
    return createHmac('sha256', salt).update(email).digest('hex')
  }

  /**
   * Masks a human name according to the "first and last" rule.
   *
   * @param name - The name to mask
   * @returns Masked name (e.g. "J***n")
   */
  private _maskName(name: string): string {
    if (name.length <= 1) return '***'
    return name[0] + '***' + name[name.length - 1]
  }

  /**
   * Masks an email address parts.
   *
   * @param email - The email to mask
   * @returns Masked email (e.g. "j***z@e***.com")
   */
  private _maskEmail(email: string): string {
    const [local, domain] = email.split('@')
    if (!local || !domain) return '***@***'

    let maskedLocal: string
    if (local.length <= 1) {
      maskedLocal = local[0] + '***' + local[0]
    } else if (local.length <= 2) {
      maskedLocal = '***'
    } else {
      maskedLocal = local[0] + '***' + local[local.length - 1]
    }

    const domainParts = domain.split('.')
    const domainName = domainParts[0] ?? ''
    const maskedDomain = domainName[0] + '***.' + (domainParts[domainParts.length - 1] ?? 'com')

    return `${maskedLocal}@${maskedDomain}`
  }
}
