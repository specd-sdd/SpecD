/** `GET .../context` wire shape (project or spec scope). */
export interface CompiledContextDto {
  readonly content?: string
  readonly entries?: readonly { readonly content?: string }[]
  readonly warnings?: readonly string[]
  readonly format?: string
}
