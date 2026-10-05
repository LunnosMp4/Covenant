import { ProxyAgent, type Dispatcher } from 'undici'
import {
  UsageApiError,
  type OrganizationCompletionsUsageResponse,
  type OrganizationCostsBucket,
  type OrganizationCostsResponse,
  type OrganizationProjectsResponse,
  type OrganizationUsageBucket,
  type UsageErrorCode,
  type UsageProject
} from '../../shared/system/usage'

const OPENAI_API_BASE = 'https://api.openai.com/v1'
// Guard against pathological pagination; the ranges we expose never need more.
const MAX_PAGES = 12

interface AdminQueryOptions {
  adminKey: string
  proxyUrl?: string
}

interface FetchRangeOptions extends AdminQueryOptions {
  startTime: number
  endTime: number
  limit: number
  projectId?: string
}

function createDispatcher(proxyUrl?: string): Dispatcher | undefined {
  return proxyUrl ? new ProxyAgent(proxyUrl) : undefined
}

function mapStatusToErrorCode(status: number): UsageErrorCode {
  if (status === 401 || status === 403) return 'UNAUTHORIZED'
  if (status === 429) return 'RATE_LIMITED'
  return 'UNKNOWN'
}

async function adminGet<T>(
  path: string,
  params: Record<string, string | string[] | number | undefined>,
  options: AdminQueryOptions
): Promise<T> {
  const url = new URL(`${OPENAI_API_BASE}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item))
      }
    } else {
      url.searchParams.set(key, String(value))
    }
  }

  const dispatcher = createDispatcher(options.proxyUrl)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.adminKey}`,
        Accept: 'application/json'
      },
      ...(dispatcher ? { dispatcher } : {})
    } as RequestInit)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed.'
    throw new UsageApiError('NETWORK', `Could not reach the OpenAI API: ${message}`)
  }

  if (!response.ok) {
    throw new UsageApiError(
      mapStatusToErrorCode(response.status),
      `OpenAI API returned ${response.status}${response.status === 401 || response.status === 403 ? ' (admin key rejected)' : ''}.`
    )
  }

  return (await response.json()) as T
}

export async function fetchOrganizationCosts(options: FetchRangeOptions): Promise<OrganizationCostsBucket[]> {
  const buckets: OrganizationCostsBucket[] = []
  let page: string | undefined

  for (let index = 0; index < MAX_PAGES; index += 1) {
    const response = await adminGet<OrganizationCostsResponse>(
      '/organization/costs',
      {
        start_time: options.startTime,
        end_time: options.endTime,
        bucket_width: '1d',
        group_by: 'line_item',
        project_ids: options.projectId ? [options.projectId] : undefined,
        limit: options.limit,
        page
      },
      options
    )

    buckets.push(...(response.data ?? []))
    if (!response.has_more || !response.next_page) break
    page = response.next_page
  }

  return buckets
}

export async function fetchOrganizationCompletionsUsage(
  options: FetchRangeOptions
): Promise<OrganizationUsageBucket[]> {
  const buckets: OrganizationUsageBucket[] = []
  let page: string | undefined

  for (let index = 0; index < MAX_PAGES; index += 1) {
    const response = await adminGet<OrganizationCompletionsUsageResponse>(
      '/organization/usage/completions',
      {
        start_time: options.startTime,
        end_time: options.endTime,
        bucket_width: '1d',
        group_by: 'model',
        project_ids: options.projectId ? [options.projectId] : undefined,
        limit: options.limit,
        page
      },
      options
    )

    buckets.push(...(response.data ?? []))
    if (!response.has_more || !response.next_page) break
    page = response.next_page
  }

  return buckets
}

export async function fetchOrganizationProjects(options: AdminQueryOptions): Promise<UsageProject[]> {
  const projects: UsageProject[] = []
  let after: string | undefined

  for (let index = 0; index < MAX_PAGES; index += 1) {
    const response = await adminGet<OrganizationProjectsResponse>(
      '/organization/projects',
      {
        limit: 100,
        after
      },
      options
    )

    for (const project of response.data ?? []) {
      projects.push({ id: project.id, name: project.name, status: project.status })
    }

    if (!response.has_more || !response.last_id) break
    after = response.last_id
  }

  return projects
}
