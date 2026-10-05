import { randomUUID } from 'crypto'
import type { Preprompt } from '../../shared/domain/preprompt'
import { appStore } from '../store/appStore'

export function getPreprompts(): Preprompt[] {
  return appStore.get('preprompts', [])
}

export function savePreprompt(payload: Partial<Preprompt>): Preprompt[] {
  const normalizedTitle = typeof payload.title === 'string' ? payload.title.trim() : ''
  const normalizedContent = typeof payload.content === 'string' ? payload.content.trim() : ''

  if (!normalizedTitle || !normalizedContent) {
    throw new Error('Preprompt title and content are required.')
  }

  const preprompts = getPreprompts()
  const existingId = typeof payload.id === 'string' ? payload.id.trim() : ''

  if (existingId) {
    const updated = preprompts.map((item) =>
      item.id === existingId ? { ...item, title: normalizedTitle, content: normalizedContent } : item
    )

    appStore.set('preprompts', updated)
    return updated
  }

  const created: Preprompt = {
    id: randomUUID(),
    title: normalizedTitle,
    content: normalizedContent
  }

  const nextPreprompts = [...preprompts, created]
  appStore.set('preprompts', nextPreprompts)
  return nextPreprompts
}

export function deletePreprompt(id: string): Preprompt[] {
  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId) {
    return getPreprompts()
  }

  const nextPreprompts = getPreprompts().filter((item) => item.id !== normalizedId)
  appStore.set('preprompts', nextPreprompts)
  return nextPreprompts
}

export function getGlobalInstructions(): string {
  const stored = appStore.get('globalInstructions', '')
  return typeof stored === 'string' ? stored : ''
}

export function saveGlobalInstructions(value: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  appStore.set('globalInstructions', normalized)
  return normalized
}
