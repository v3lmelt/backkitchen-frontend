import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'

import { mountWithPlugins } from '@/tests/utils'
import { useToast } from '@/composables/useToast'

const mocks = vi.hoisted(() => ({
  currentUser: { id: 1, display_name: 'Kira', avatar_color: '#ff8400' } as any,
  r2Enabled: false,
  issueApiUpdate: vi.fn(),
  issueApiAddComment: vi.fn(),
  commentApiUpdate: vi.fn(),
  commentApiDelete: vi.fn(),
}))

vi.mock('@/api', () => ({
  issueApi: { update: mocks.issueApiUpdate, addComment: mocks.issueApiAddComment },
  commentApi: { update: mocks.commentApiUpdate, delete: mocks.commentApiDelete },
  r2Api: { requestCommentAudioUpload: vi.fn() },
  uploadToR2: vi.fn(),
  resolveAssetUrl: (url: string) => url,
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ currentUser: mocks.currentUser, r2Enabled: mocks.r2Enabled }),
}))

vi.mock('@/components/common/CommentInput.vue', () => ({
  default: {
    name: 'CommentInput',
    template: '<div class="comment-input-stub" />',
    methods: { reset() {} },
  },
}))

import IssueDetailContent from './IssueDetailContent.vue'

function makeComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    issue_id: 5,
    author_id: 2,
    author: { id: 2, display_name: 'Nova', avatar_color: '#123456' },
    content: 'Please fix the sibilance.',
    visibility: 'public',
    is_status_note: false,
    created_at: '2024-01-02T00:00:00Z',
    images: [],
    audios: [],
    ...overrides,
  }
}

function makeIssue(overrides: Record<string, unknown> = {}) {
  return reactive({
    id: 5,
    track_id: 1,
    local_number: 3,
    title: 'Sibilance in chorus',
    description: 'Harsh ess throughout the chorus.',
    phase: 'peer',
    severity: 'major',
    status: 'open',
    workflow_cycle: 1,
    author_id: 2,
    author: { id: 2, display_name: 'Nova', avatar_color: '#123456' },
    markers: [],
    comments: [makeComment()],
    audios: [],
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }) as any
}

function mountContent(options: { issue?: any; variant?: 'panel' | 'page'; track?: any; attachToBody?: boolean } = {}) {
  return mountWithPlugins(IssueDetailContent, {
    ...(options.attachToBody ? { attachTo: document.body } : {}),
    props: {
      issue: options.issue ?? makeIssue(),
      variant: options.variant ?? 'panel',
      track: options.track ?? null,
      assignments: [],
      issues: [],
      mentionCandidates: null,
    },
  })
}

describe('IssueDetailContent', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mocks.currentUser = { id: 1, display_name: 'Kira', avatar_color: '#ff8400' }
    mocks.r2Enabled = false
    mocks.issueApiUpdate.mockReset()
    mocks.issueApiAddComment.mockReset()
    mocks.commentApiUpdate.mockReset()
    mocks.commentApiDelete.mockReset()
    useToast().toasts.value = []
  })

  it('renders the description and comment thread', () => {
    const wrapper = mountContent()
    expect(wrapper.text()).toContain('Harsh ess throughout the chorus.')
    expect(wrapper.text()).toContain('Please fix the sibilance.')
    expect(wrapper.text()).toContain('Comments (1)')
  })

  it('hides internal comments from track composers', () => {
    const issue = makeIssue({
      comments: [
        makeComment(),
        makeComment({ id: 12, visibility: 'internal', content: 'Internal reviewer note' }),
      ],
    })
    const track = { id: 1, composer_ids: [1] }

    const composerView = mountContent({ issue, track })
    expect(composerView.text()).toContain('Please fix the sibilance.')
    expect(composerView.text()).not.toContain('Internal reviewer note')
    expect(composerView.text()).toContain('Comments (1)')

    const reviewerView = mountContent({ issue, track: { id: 1, composer_ids: [7] } })
    expect(reviewerView.text()).toContain('Internal reviewer note')
    expect(reviewerView.text()).toContain('Comments (2)')
  })

  it('submits a new comment through the API and appends it', async () => {
    const issue = makeIssue()
    mocks.issueApiAddComment.mockResolvedValue(makeComment({ id: 13, author_id: 1, content: 'New reply' }))
    const wrapper = mountContent({ issue })

    wrapper.findComponent({ name: 'CommentInput' }).vm.$emit('submit', {
      content: 'New reply',
      images: [],
      audios: [],
    })
    await flushPromises()

    expect(mocks.issueApiAddComment).toHaveBeenCalledTimes(1)
    expect(mocks.issueApiAddComment.mock.calls[0][0]).toBe(5)
    expect(mocks.issueApiAddComment.mock.calls[0][1]).toMatchObject({ content: 'New reply' })
    expect(wrapper.text()).toContain('New reply')
  })

  it('edits an own comment via commentApi.update', async () => {
    const issue = makeIssue({
      comments: [makeComment({ author_id: 1, author: { id: 1, display_name: 'Kira', avatar_color: '#ff8400' } })],
    })
    mocks.commentApiUpdate.mockImplementation(async (id: number, content: string) =>
      makeComment({ id, author_id: 1, content }),
    )
    const wrapper = mountContent({ issue })

    await wrapper.find('button.ml-auto').trigger('click')
    const textarea = wrapper.find('textarea')
    expect(textarea.exists()).toBe(true)
    await textarea.setValue('Updated wording')

    await wrapper.findAll('button').find(b => b.classes().includes('btn-primary'))!.trigger('click')
    await flushPromises()

    expect(mocks.commentApiUpdate).toHaveBeenCalledWith(11, 'Updated wording')
    expect(wrapper.text()).toContain('Updated wording')
  })

  it('asks for confirmation before deleting a comment', async () => {
    const issue = makeIssue({
      comments: [makeComment({ author_id: 1, author: { id: 1, display_name: 'Kira', avatar_color: '#ff8400' } })],
    })
    mocks.commentApiDelete.mockResolvedValue(undefined)
    const wrapper = mountContent({ issue, attachToBody: true })

    await wrapper.findAll('button').find(b => b.classes().some(c => c.includes('hover:text-error')))!.trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Delete')

    const confirmButton = Array.from(document.body.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === 'Delete')
    expect(confirmButton).toBeTruthy()
    confirmButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mocks.commentApiDelete).toHaveBeenCalledWith(11)
    expect(wrapper.text()).not.toContain('Please fix the sibilance.')
  })

  it('panel variant applies status changes optimistically', async () => {
    const issue = makeIssue({ author_id: 1 })
    const track = { id: 1, submitter_id: 9, composer_ids: [] }
    mocks.issueApiUpdate.mockImplementation(async (_id: number, payload: any) => ({ ...issue, ...payload }))
    const wrapper = mountContent({ issue, track })

    const actionButton = wrapper.findAll('button').find(b => b.text() === 'Mark Resolved')
    expect(actionButton).toBeTruthy()
    await actionButton!.trigger('click')
    expect(wrapper.find('textarea').exists()).toBe(true)

    const confirmButton = wrapper.findAll('button')
      .find(b => b.text() === 'Mark Resolved' && b.classes().includes('btn-primary'))
    await confirmButton!.trigger('click')
    await flushPromises()

    expect(mocks.issueApiUpdate).toHaveBeenCalledWith(5, { status: 'resolved', status_note: undefined })
    const updates = wrapper.emitted('updated') ?? []
    expect(updates.length).toBeGreaterThanOrEqual(2)
    expect((updates[0][0] as any).status).toBe('resolved')
    expect((updates[updates.length - 1][0] as any).status).toBe('resolved')
  })

  it('page variant uses a CommentInput (not a plain textarea) for the status note', async () => {
    const issue = makeIssue({ author_id: 1 })
    const track = { id: 1, submitter_id: 9, composer_ids: [] }
    const wrapper = mountContent({ issue, track, variant: 'page' })

    const actionButton = wrapper.findAll('button').find(b => b.text() === 'Mark Resolved')
    await actionButton!.trigger('click')
    await wrapper.vm.$nextTick()

    // No inline textarea: the page variant composes the note via CommentInput.
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.findAllComponents({ name: 'CommentInput' }).length).toBe(2)
  })
})
