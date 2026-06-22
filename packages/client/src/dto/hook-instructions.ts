/** `GET /changes/:name/hook-instructions` wire shape. */
export interface HookInstructionsDto {
  readonly phase: 'pre' | 'post'
  readonly instructions: readonly { readonly id: string; readonly text: string }[]
}
