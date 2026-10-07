import { Notification } from 'electron'
import type {
  CodeActivitySession,
  CodeActivityState,
  CodeActivitySummary,
  CodeEngineEvent,
  CodeSessionStatus
} from '../../shared/code/code'
import { readConfig } from '../config/configStore'
import { log } from '../logger'
import { sendToMain } from '../windows/broadcast'
import { applyCodeActivityStatus, getMainWindow, openCodeSurface } from '../windows'
import { getCodeService } from './codeService'

interface TrackedSession {
  status: CodeSessionStatus
  pendingForms: Set<string>
  pendingPermissions: Set<string>
  /** A turn is currently in flight (covers runtimes that skip a busy status). */
  active: boolean
  /** Finished/errored since the Code surface was last viewed. */
  unseen: boolean
}

const NON_WORK_ACTIVITY = new Set([
  'status',
  'done',
  'error',
  'usage',
  'model-selected',
  'agent-selected'
])

/**
 * Aggregates Covenant Code session activity in the main process so the tray and
 * desktop notifications can reflect background work even while the command bar
 * is hidden. Subscribes to the same engine events the renderer consumes, but
 * never drops events for non-active sessions.
 */
export class CodeActivityTracker {
  private readonly sessions = new Map<string, TrackedSession>()
  private unsubscribe: (() => void) | null = null
  private lastAwaiting = new Set<string>()
  private lastFinished = new Set<string>()
  private lastErrored = new Set<string>()

  start(): void {
    const service = getCodeService()
    if (!service) return
    this.unsubscribe = service.subscribe((event) => this.handleEvent(event))
  }

  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  /** Clear "unseen" flags once the user has actually viewed the Code surface. */
  markSeen(): void {
    let changed = false
    for (const session of this.sessions.values()) {
      if (session.unseen) {
        session.unseen = false
        changed = true
      }
    }
    if (changed) this.publish()
  }

  private get(sessionId: string): TrackedSession {
    let session = this.sessions.get(sessionId)
    if (!session) {
      session = {
        status: 'idle',
        pendingForms: new Set(),
        pendingPermissions: new Set(),
        active: false,
        unseen: false
      }
      this.sessions.set(sessionId, session)
    }
    return session
  }

  private setStatus(session: TrackedSession, next: CodeSessionStatus): void {
    const previous = session.status
    session.status = next
    if (next === 'busy' || next === 'retry') {
      // The session is active again — it can't be an unseen completion anymore.
      session.active = true
      session.unseen = false
    } else if (next === 'error') {
      session.active = false
      session.unseen = true
    } else if (next === 'idle') {
      if (previous === 'busy' || previous === 'retry' || session.active) {
        session.unseen = true
      }
      session.active = false
    }
  }

  private handleEvent(event: CodeEngineEvent): void {
    switch (event.kind) {
      case 'activity': {
        const activity = event.event
        if (!activity.sessionId) return
        const session = this.get(activity.sessionId)
        if (activity.type === 'status' && activity.status) {
          this.setStatus(session, activity.status)
        } else if (activity.type === 'done') {
          this.setStatus(session, 'idle')
        } else if (activity.type === 'error') {
          this.setStatus(session, 'error')
        } else if (NON_WORK_ACTIVITY.has(activity.type)) {
          return
        } else {
          // Any other event implies a turn is in flight; record it so a later
          // "done" still counts as finished even if no busy status was seen.
          if (session.active) return
          session.active = true
        }
        break
      }
      case 'permission':
        this.get(event.request.sessionId).pendingPermissions.add(event.request.id)
        break
      case 'permission-replied':
        this.get(event.sessionId).pendingPermissions.delete(event.requestId)
        break
      case 'form':
        this.get(event.form.sessionId).pendingForms.add(event.form.id)
        break
      case 'form-settled':
        this.get(event.sessionId).pendingForms.delete(event.formId)
        break
      default:
        return
    }
    this.publish()
  }

  private isAwaiting(session: TrackedSession): boolean {
    return session.pendingForms.size > 0 || session.pendingPermissions.size > 0
  }

  private computeSummary(): CodeActivitySummary {
    let runningCount = 0
    let awaitingCount = 0
    let finishedCount = 0
    let errorCount = 0
    let awaiting = false
    let running = false
    let finished = false
    let errored = false
    const sessions: CodeActivitySession[] = []

    for (const [sessionId, session] of this.sessions) {
      const isAwaiting = this.isAwaiting(session)
      const isRunning = session.active || session.status === 'busy' || session.status === 'retry'
      const isError = session.status === 'error'
      const isUnseenIdle = session.unseen && session.status === 'idle'
      const isUnseenError = session.unseen && isError

      if (isRunning) runningCount += 1
      if (isAwaiting) {
        awaitingCount += 1
        awaiting = true
      }
      if (isUnseenIdle) {
        finishedCount += 1
        finished = true
      }
      if (isUnseenError) {
        errorCount += 1
        errored = true
      }
      if (isRunning) running = true

      sessions.push({
        sessionId,
        status: session.status,
        awaiting: isAwaiting,
        unseen: session.unseen
      })
    }

    const state: CodeActivityState = awaiting
      ? 'awaiting'
      : errored
        ? 'error'
        : running
          ? 'running'
          : finished
            ? 'finished'
            : 'idle'

    return { state, runningCount, awaitingCount, finishedCount, errorCount, sessions }
  }

  private publish(): void {
    const summary = this.computeSummary()
    sendToMain('code-activity-status', summary)
    applyCodeActivityStatus(summary)
    this.notify(summary)
  }

  private notify(summary: CodeActivitySummary): void {
    const settings = readConfig().code
    const awaitingNow = new Set(
      summary.sessions.filter((session) => session.awaiting).map((session) => session.sessionId)
    )
    const finishedNow = new Set(
      summary.sessions
        .filter((session) => session.unseen && session.status === 'idle')
        .map((session) => session.sessionId)
    )
    const erroredNow = new Set(
      summary.sessions
        .filter((session) => session.unseen && session.status === 'error')
        .map((session) => session.sessionId)
    )

    if (settings.notifyOnAwaiting) {
      for (const id of awaitingNow) {
        if (!this.lastAwaiting.has(id)) {
          this.showNotification('Covenant Code needs your input', 'A session is waiting for an answer.')
        }
      }
    }
    if (settings.notifyOnFinish) {
      for (const id of finishedNow) {
        if (!this.lastFinished.has(id)) {
          this.showNotification('Covenant Code finished', 'A session has completed.')
        }
      }
      for (const id of erroredNow) {
        if (!this.lastErrored.has(id)) {
          this.showNotification('Covenant Code stopped', 'A session ended with an error.')
        }
      }
    }

    this.lastAwaiting = awaitingNow
    this.lastFinished = finishedNow
    this.lastErrored = erroredNow
  }

  private showNotification(title: string, body: string): void {
    try {
      if (!Notification.isSupported()) return
      // Don't interrupt when the user is already looking at the app.
      if (getMainWindow()?.isFocused()) return
      const notification = new Notification({ title, body })
      notification.on('click', () => openCodeSurface())
      notification.show()
    } catch (error) {
      log.warn('Failed to show Code activity notification', error)
    }
  }
}

let tracker: CodeActivityTracker | null = null

export function getCodeActivityTracker(): CodeActivityTracker | null {
  return tracker
}

export function createCodeActivityTracker(): CodeActivityTracker {
  tracker = new CodeActivityTracker()
  tracker.start()
  return tracker
}

export function disposeCodeActivityTracker(): void {
  tracker?.dispose()
  tracker = null
}
