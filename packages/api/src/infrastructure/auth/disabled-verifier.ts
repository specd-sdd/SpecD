import {
  type ApiTokenVerifier,
  type ApiTokenVerifyResult,
} from '../../application/ports/api-token-verifier.js'

/** Pass-through verifier for `api.auth.type: disabled`. */
export class DisabledAuthVerifier implements ApiTokenVerifier {
  /** @inheritdoc */
  verify(_token: string | undefined): Promise<ApiTokenVerifyResult> {
    void _token
    return Promise.resolve({ actor: null })
  }
}
