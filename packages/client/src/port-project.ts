import type { ProjectDto } from './dto/project.js'
import type { ProjectStatusDto } from './dto/project-status.js'

/** Project-level read operations (`api:routes-project`). */
export interface PortProject {
  getProject(signal?: AbortSignal): Promise<ProjectDto>
  getProjectStatus(signal?: AbortSignal): Promise<ProjectStatusDto>
}
