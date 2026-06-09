import { z } from 'zod'

/**
 * Schema for project-level metadata stored in `project-metadata.json`.
 *
 * Tracks LLM-optimized project context and the freshness hashes of its inputs.
 */
export const projectMetadataSchema = z.object({
  /** Schema version for project metadata. */
  version: z.literal(1),

  /** LLM-optimized content. */
  optimized: z.object({
    /** Optimized representation of the project-level context. */
    context: z.string(),
  }),

  /** Freshness tracking for the optimized content. */
  freshness: z.object({
    /** Hashing algorithm used. */
    algorithm: z.literal('sha256'),

    /** Collection of inputs used to generate the optimized content. */
    inputs: z.object({
      /** The project configuration file. */
      config: z.object({
        /** Workspace-relative or absolute path. */
        path: z.string(),
        /** SHA-256 hash. */
        hash: z.string(),
      }),

      /** Referenced context files from specd.yaml. */
      contextFiles: z.array(
        z.object({
          /** Absolute or workspace-relative path. */
          path: z.string(),
          /** SHA-256 hash. */
          hash: z.string(),
        }),
      ),

      /** Resolved specs included in the project context. */
      specMetadata: z.array(
        z.object({
          /** Canonical spec ID (workspace:capPath). */
          id: z.string(),
          /** The spec's metadata hash (from contentHashes). */
          hash: z.string(),
        }),
      ),
    }),

    /** Combined hash of all inputs for fast comparison. */
    combinedHash: z.string(),
  }),

  /** Generation metadata. */
  generated: z.object({
    /** ISO 8601 timestamp. */
    at: z.string(),
  }),
})

/** Persistent state of project-level optimization. */
export type ProjectMetadata = z.infer<typeof projectMetadataSchema>

/**
 * Partial schema for agent-provided updates.
 * Agents only provide the optimized content; the system handles freshness and versioning.
 */
export const updateProjectMetadataSchema = z.object({
  optimizedContext: z.string().min(1),
})

/** Input for updating project metadata. */
export type UpdateProjectMetadataPayload = z.infer<typeof updateProjectMetadataSchema>
