import { type ArtifactStatus } from '../value-objects/artifact-status.js'

export interface ArtifactProps {
  type: string
  path: string
  optional?: boolean
  requires?: readonly string[]
  status?: ArtifactStatus
  validatedHash?: string
}

export class Artifact {
  readonly type: string
  readonly path: string
  readonly optional: boolean
  readonly requires: readonly string[]
  private _status: ArtifactStatus
  private _validatedHash: string | undefined

  constructor(props: ArtifactProps) {
    this.type = props.type
    this.path = props.path
    this.optional = props.optional ?? false
    this.requires = props.requires ?? []
    this._status = props.status ?? 'missing'
    this._validatedHash = props.validatedHash
  }

  get status(): ArtifactStatus {
    return this._status
  }

  get validatedHash(): string | undefined {
    return this._validatedHash
  }

  get isComplete(): boolean {
    return this._status === 'complete'
  }

  markComplete(hash: string): void {
    this._validatedHash = hash
    this._status = 'complete'
  }
}
