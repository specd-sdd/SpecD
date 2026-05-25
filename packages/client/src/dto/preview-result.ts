/** Single file entry in `GET .../preview` response. */
export interface PreviewResultFileDto {
  readonly filename: string
  readonly base?: string
  readonly merged?: string
}

/** `GET .../preview` wire shape. */
export interface PreviewResultDto {
  readonly specId: string
  readonly files: readonly PreviewResultFileDto[]
}
