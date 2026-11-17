import { randomUUID } from 'node:crypto'
import { UI_LIMITS, type UiPart, type UiSurface } from '../../shared/ui/spec'
import { validateUiSpec } from '../../shared/ui/validate'
import { validateGeneratedNodes } from './generatedValidation'

type PublishResult = { ok: true; part: UiPart } | { ok: false; issues: string[] }

interface SurfacePublisher {
  publish(rawSpec: unknown): PublishResult
  published: number
}

/**
 * Turn-scoped publisher. The cap is per answer, matching the renderer's merge
 * rule; surface ids come from the trusted side, never from the model.
 */
export function createSurfacePublisher(
  maxSurfaces: number = UI_LIMITS.maxSurfacesPerAnswer
): SurfacePublisher {
  let published = 0

  return {
    get published() {
      return published
    },

    publish(rawSpec: unknown): PublishResult {
      const validated = validateUiSpec(rawSpec)
      if (!validated.ok) {
        return { ok: false, issues: validated.issues }
      }

      const generatedIssues = validateGeneratedNodes(validated.spec)
      if (generatedIssues.length > 0) {
        return { ok: false, issues: generatedIssues.slice(0, 12) }
      }

      if (published >= maxSurfaces) {
        return {
          ok: false,
          issues: [
            `This answer already has ${published} visuals. Use the existing visual and describe the rest in text.`
          ]
        }
      }

      const id = `surface_${randomUUID()}`
      const surface: UiSurface = {
        id,
        revision: 1,
        status: 'draft',
        createdAt: Date.now(),
        spec: validated.spec
      }

      published += 1
      return { ok: true, part: { id, kind: 'surface', surface } }
    }
  }
}

export function publishFailure(issues: string[]): string {
  return [
    'Visual rejected; nothing was rendered. Fix these and call the tool again:',
    ...issues.map((issue) => `- ${issue}`)
  ].join('\n')
}

export function publishSuccess(part: UiPart): string {
  const nodes = Object.keys(part.surface.spec.elements).length
  return [
    `Visual published (surface ${part.surface.id}, ${nodes} node${nodes === 1 ? '' : 's'}).`,
    'It now appears above your text. Do not repeat its values in the answer — add one or two sentences of interpretation, or leave the visual as the answer.'
  ].join(' ')
}
