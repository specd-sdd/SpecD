/**
 *
 */
export interface HealthDto {
  readonly status: 'ok'
  readonly auth: { readonly type: string }
}
