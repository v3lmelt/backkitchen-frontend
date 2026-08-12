import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkflowConfig } from '@/types'

const mocks = vi.hoisted(() => ({
  getDefaultConfigMock: vi.fn(),
}))

vi.mock('@/api', () => ({
  workflowApi: { getDefaultConfig: mocks.getDefaultConfigMock },
}))

import {
  getCachedDefaultWorkflowConfig,
  getFirstPeerReviewAssignmentMode,
  loadDefaultWorkflowConfig,
  resetDefaultWorkflowConfigCache,
  setFirstPeerReviewAssignmentMode,
} from './workflowConfig'

function defaultConfig(): WorkflowConfig {
  return {
    version: 2,
    steps: [
      {
        id: 'peer_review',
        label: 'Peer Review',
        type: 'review',
        ui_variant: 'peer_review',
        assignee_role: 'peer_reviewer',
        order: 0,
        transitions: {},
        assignment_mode: 'auto',
        required_reviewer_count: 1,
      },
      {
        id: 'mastering',
        label: 'Mastering',
        type: 'delivery',
        ui_variant: 'mastering',
        assignee_role: 'mastering_engineer',
        order: 1,
        transitions: {},
        is_mastering_related: true,
      },
    ],
  }
}

describe('loadDefaultWorkflowConfig', () => {
  beforeEach(() => {
    mocks.getDefaultConfigMock.mockReset()
    resetDefaultWorkflowConfigCache()
  })

  it('fetches the default config from the backend and caches it', async () => {
    mocks.getDefaultConfigMock.mockResolvedValue(defaultConfig())

    const first = await loadDefaultWorkflowConfig()
    const second = await loadDefaultWorkflowConfig()

    expect(mocks.getDefaultConfigMock).toHaveBeenCalledTimes(1)
    expect(first.steps.map(step => step.id)).toEqual(['peer_review', 'mastering'])
    expect(second).toEqual(first)
    expect(getCachedDefaultWorkflowConfig()?.steps).toHaveLength(2)
  })

  it('returns defensive copies so callers cannot mutate the cache', async () => {
    mocks.getDefaultConfigMock.mockResolvedValue(defaultConfig())

    const config = await loadDefaultWorkflowConfig()
    config.steps[0].label = 'MUTATED'

    expect(getCachedDefaultWorkflowConfig()?.steps[0].label).toBe('Peer Review')
  })

  it('localizes step labels through the translator', async () => {
    mocks.getDefaultConfigMock.mockResolvedValue(defaultConfig())

    const config = await loadDefaultWorkflowConfig((key, fallback) => (key === 'workflowSteps.peer_review' ? 'Localized' : fallback))

    expect(config.steps[0].label).toBe('Localized')
    expect(config.steps[1].label).toBe('Mastering')
    // The cached raw config keeps the backend labels.
    expect(getCachedDefaultWorkflowConfig()?.steps[0].label).toBe('Peer Review')
  })

  it('returns null from the sync accessor before the first load and after reset', async () => {
    expect(getCachedDefaultWorkflowConfig()).toBeNull()

    mocks.getDefaultConfigMock.mockResolvedValue(defaultConfig())
    await loadDefaultWorkflowConfig()
    expect(getCachedDefaultWorkflowConfig()).not.toBeNull()

    resetDefaultWorkflowConfigCache()
    expect(getCachedDefaultWorkflowConfig()).toBeNull()
  })

  it('retries after a failed fetch', async () => {
    mocks.getDefaultConfigMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(defaultConfig())

    await expect(loadDefaultWorkflowConfig()).rejects.toThrow('offline')
    const config = await loadDefaultWorkflowConfig()
    expect(config.steps).toHaveLength(2)
    expect(mocks.getDefaultConfigMock).toHaveBeenCalledTimes(2)
  })
})

describe('peer-review assignment mode helpers', () => {
  it('defaults to auto without a config', () => {
    expect(getFirstPeerReviewAssignmentMode(null)).toBe('auto')
    expect(getFirstPeerReviewAssignmentMode(undefined)).toBe('auto')
  })

  it('reads and sets the mode on the first peer-review step', () => {
    const config = defaultConfig()
    expect(getFirstPeerReviewAssignmentMode(config)).toBe('auto')

    const manual = setFirstPeerReviewAssignmentMode(config, 'manual')
    expect(getFirstPeerReviewAssignmentMode(manual)).toBe('manual')
    // Original config untouched.
    expect(getFirstPeerReviewAssignmentMode(config)).toBe('auto')
  })
})
