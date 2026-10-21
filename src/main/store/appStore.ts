import ElectronStore from 'electron-store'
import type { ChatConversation } from '../../shared/chat/chat'
import { DEFAULT_GAMIFICATION, type GamificationState } from '../../shared/tasks/gamification'
import type { Preprompt } from '../../shared/domain/preprompt'
import type { Task } from '../../shared/tasks/task'
import type { Workflow } from '../../shared/domain/workflow'
import type { CodeProject } from '../../shared/code/code'
import type { CodeConnection } from '../../shared/code/connection'
import type { NoteMeta } from '../../shared/notes/note'

export interface AppStoreSchema {
  preprompts: Preprompt[]
  globalInstructions: string
  workflows: Workflow[]
  conversations: ChatConversation[]
  tasks: Task[]
  gamification: GamificationState
  notes: NoteMeta[]
  codeProjects: CodeProject[]
  codeConnections: CodeConnection[]
  codeActiveConnectionId: string
}

const StoreClass =
  (ElectronStore as typeof ElectronStore & { default?: typeof ElectronStore }).default ??
  ElectronStore

export const appStore = new StoreClass<AppStoreSchema>({
  name: 'preprompts',
  defaults: {
    preprompts: [],
    globalInstructions: '',
    workflows: [],
    conversations: [],
    tasks: [],
    gamification: DEFAULT_GAMIFICATION,
    notes: [],
    codeProjects: [],
    codeConnections: [],
    codeActiveConnectionId: 'local'
  },
  schema: {
    preprompts: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['id', 'title', 'content']
      }
    },
    globalInstructions: {
      type: 'string',
      default: ''
    },
    workflows: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          language: {
            type: 'string',
            enum: ['powershell', 'cmd', 'python', 'nodejs', 'shell', 'custom']
          },
          customCommand: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['id', 'title', 'language', 'content']
      }
    },
    tasks: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          done: { type: 'boolean' },
          createdAt: { type: 'number' },
          evaluating: { type: 'boolean' },
          tier: {
            type: 'string',
            enum: ['TRIVIAL', 'EASY', 'MEDIUM', 'HARD', 'EPIC']
          },
          xpReward: { type: 'number' },
          estimatedMinutes: { type: 'number' },
          categoryTag: {
            type: 'string',
            enum: [
              'Dev',
              'DevOps',
              'SysAdmin',
              'Writing',
              'Design',
              'Admin',
              'Personal',
              'Health',
              'General'
            ]
          },
          actionType: {
            type: 'string',
            enum: [
              'terminal_command',
              'code_refactor',
              'quick_action',
              'deep_work',
              'communication',
              'maintenance'
            ]
          },
          rationale: { type: 'string' }
        },
        required: ['id', 'title', 'done', 'createdAt']
      }
    },
    gamification: {
      type: 'object',
      default: DEFAULT_GAMIFICATION,
      additionalProperties: false,
      properties: {
        currentLevel: { type: 'number' },
        currentXP: { type: 'number' },
        totalLifetimeXP: { type: 'number' },
        streakDays: { type: 'number' },
        lastActiveDate: { type: ['string', 'null'] }
      },
      required: ['currentLevel', 'currentXP', 'totalLifetimeXP', 'streakDays', 'lastActiveDate']
    },
    notes: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          createdAt: { type: 'number' },
          updatedAt: { type: 'number' },
          pinned: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string' } },
          kind: { type: 'string', enum: ['note', 'meeting'] },
          preview: { type: 'string' },
          meetingStatus: {
            type: 'string',
            enum: ['recording', 'transcribing', 'summarizing', 'completed', 'error']
          },
          meetingDurationMs: { type: 'number' },
          meetingSegmentCount: { type: 'number' }
        },
        required: ['id', 'title', 'createdAt', 'updatedAt', 'pinned', 'kind']
      }
    },
    conversations: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          createdAt: { type: 'number' },
          updatedAt: { type: 'number' },
          systemPrompt: { type: 'string' },
          terminalSessionId: { type: 'string' },
          messages: {
            type: 'array',
            default: [],
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                role: { type: 'string', enum: ['system', 'user', 'assistant'] },
                content: { type: 'string' },
                createdAt: { type: 'number' },
                reasoning: { type: 'string' },
                reasoningTitle: { type: 'string' },
                model: { type: 'string' },
                stopped: { type: 'boolean' },
                sources: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      title: { type: 'string' },
                      url: { type: 'string' }
                    },
                    required: ['url']
                  }
                },
                steps: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      type: { type: 'string', enum: ['reasoning', 'web_search', 'tool'] },
                      text: { type: 'string' },
                      id: { type: 'string' },
                      name: { type: 'string' },
                      serverName: { type: 'string' },
                      serverId: { type: 'string' },
                      query: { type: 'string' },
                      status: { type: 'string', enum: ['searching', 'running', 'done', 'error'] },
                      content: { type: 'string' },
                      sources: {
                        type: 'array',
                        items: {
                          type: 'object',
                          additionalProperties: false,
                          properties: {
                            title: { type: 'string' },
                            url: { type: 'string' }
                          },
                          required: ['url']
                        }
                      }
                    },
                    required: ['type']
                  }
                },
                usage: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    promptTokens: { type: 'number' },
                    completionTokens: { type: 'number' },
                    totalTokens: { type: 'number' }
                  }
                }
              },
              required: ['id', 'role', 'content', 'createdAt']
            }
          }
        },
        required: ['id', 'title', 'createdAt', 'updatedAt', 'messages']
      }
    },
    codeProjects: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          directory: { type: 'string' },
          connectionId: { type: 'string' },
          addedAt: { type: 'number' }
        },
        required: ['id', 'name', 'directory', 'addedAt']
      }
    },
    codeConnections: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['local', 'ssh'] },
          name: { type: 'string' },
          host: { type: 'string' },
          port: { type: 'number' },
          username: { type: 'string' },
          authMethod: { type: 'string', enum: ['password', 'key', 'agent'] },
          privateKeyPath: { type: 'string' },
          hostKeyFingerprint: { type: 'string' },
          createdAt: { type: 'number' }
        },
        required: ['id', 'kind', 'name', 'createdAt']
      }
    },
    codeActiveConnectionId: {
      type: 'string',
      default: 'local'
    }
  }
})
