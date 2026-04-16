import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  route: { params: { albumId: '5' }, path: '/albums/5/settings', fullPath: '/albums/5/settings' },
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  albumGetMock: vi.fn(),
  albumActivityMock: vi.fn(),
  albumUpdateWorkflowMock: vi.fn(),
  albumTracksMock: vi.fn(),
  albumArchivedTracksMock: vi.fn(),
  albumGetWebhookMock: vi.fn(),
  albumGetWebhookDeliveriesMock: vi.fn(),
  albumUpdateTeamMock: vi.fn(),
  albumArchiveMock: vi.fn(),
  albumRestoreMock: vi.fn(),
  checklistGetTemplateMock: vi.fn(),
  checklistUpdateTemplateMock: vi.fn(),
  checklistResetTemplateMock: vi.fn(),
  invitationListForAlbumMock: vi.fn(),
  userListMock: vi.fn(),
  circleGetMock: vi.fn(),
  trackRestoreMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  currentUser: { id: 1 },
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.pushMock, replace: mocks.replaceMock }),
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ currentUser: mocks.currentUser }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: mocks.toastSuccessMock,
    error: mocks.toastErrorMock,
  }),
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  albumApi: {
    get: mocks.albumGetMock,
    activity: mocks.albumActivityMock,
    updateWorkflow: mocks.albumUpdateWorkflowMock,
    updateTeam: mocks.albumUpdateTeamMock,
    tracks: mocks.albumTracksMock,
    archivedTracks: mocks.albumArchivedTracksMock,
    getWebhook: mocks.albumGetWebhookMock,
    getWebhookDeliveries: mocks.albumGetWebhookDeliveriesMock,
    archive: mocks.albumArchiveMock,
    restore: mocks.albumRestoreMock,
  },
  trackApi: {
    restore: mocks.trackRestoreMock,
  },
  checklistApi: {
    getTemplate: mocks.checklistGetTemplateMock,
    updateTemplate: mocks.checklistUpdateTemplateMock,
    resetTemplate: mocks.checklistResetTemplateMock,
  },
  invitationApi: {
    listForAlbum: mocks.invitationListForAlbumMock,
  },
  userApi: {
    list: mocks.userListMock,
  },
  circleApi: {
    get: mocks.circleGetMock,
  },
}))

vi.mock('vuedraggable', () => ({
  default: {
    template: '<div class="draggable-stub"><slot /></div>',
  },
}))

vi.mock('@/components/workflow/WorkflowEditor.vue', () => ({
  default: {
    emits: ['save'],
    template: `
      <div class="workflow-editor-stub">
        <button
          type="button"
          class="workflow-editor-save"
          @click="$emit('save', {
            version: 2,
            steps: [
              { id: 'intake', label: 'Intake', type: 'approval', assignee_role: 'producer', order: 0, transitions: { accept: 'peer_review' } },
              { id: 'peer_review', label: 'Peer Review', type: 'review', assignee_role: 'peer_reviewer', order: 1, transitions: { pass: '__completed' } }
            ]
          })"
        >
          emit workflow save
        </button>
      </div>
    `,
  },
}))

vi.mock('@/components/common/CustomSelect.vue', () => ({
  default: {
    template: '<div class="custom-select-stub" />',
  },
}))

vi.mock('@/components/workflow/StatusBadge.vue', () => ({
  default: {
    template: '<span class="status-badge-stub" />',
  },
}))

vi.mock('@/components/common/SkeletonLoader.vue', () => ({
  default: {
    template: '<div class="skeleton-loader-stub" />',
  },
}))

vi.mock('lucide-vue-next', () => ({
  Archive: { template: '<svg class="icon-archive" />' },
  RotateCcw: { template: '<svg class="icon-rotate" />' },
  Upload: { template: '<svg class="icon-upload" />' },
  X: { template: '<svg class="icon-close" />' },
}))

import AlbumSettingsView from './AlbumSettingsView.vue'

function makeUser(id: number, displayName: string) {
  return {
    id,
    username: `user${id}`,
    display_name: displayName,
    role: 'member',
    avatar_color: '#123456',
    created_at: '2024-01-01T00:00:00Z',
    is_admin: false,
  }
}

function makeWorkflowConfig() {
  return {
    version: 2,
    steps: [
      {
        id: 'intake',
        label: 'Intake',
        type: 'approval',
        assignee_role: 'producer',
        order: 0,
        transitions: { accept: 'peer_review' },
      },
      {
        id: 'peer_review',
        label: 'Peer Review',
        type: 'review',
        assignee_role: 'peer_reviewer',
        order: 1,
        transitions: { pass: '__completed' },
      },
    ],
  }
}

function makeAlbum(overrides: Record<string, unknown> = {}) {
  const producer = makeUser(1, 'Producer')
  const masteringEngineer = makeUser(2, 'Mastering')
  const member = makeUser(3, 'Member')

  return {
    id: 5,
    title: 'Nebula',
    description: 'Album description',
    cover_color: '#abcdef',
    circle_id: 9,
    circle_name: 'Back Kitchen',
    cover_image: null,
    producer_id: 1,
    mastering_engineer_id: 2,
    workflow_config: makeWorkflowConfig(),
    producer,
    mastering_engineer: masteringEngineer,
    members: [{ id: 301, user_id: 3, created_at: '2024-01-01T00:00:00Z', user: member }],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    archived_at: null,
    track_count: 2,
    ...overrides,
  }
}

function makeTrack(id: number, title: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title,
    artist: 'Nova',
    album_id: 5,
    file_path: '/audio.wav',
    duration: 123,
    bpm: null,
    original_title: null,
    original_artist: null,
    status: 'completed',
    rejection_mode: null,
    workflow_variant: 'standard',
    version: 3,
    workflow_cycle: 2,
    submitter_id: 3,
    peer_reviewer_id: null,
    producer_id: 1,
    mastering_engineer_id: 2,
    author_notes: null,
    mastering_notes: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    archived_at: null,
    allowed_actions: [],
    is_public: false,
    ...overrides,
  }
}

function mountAlbumSettingsView() {
  return mountWithPlugins(AlbumSettingsView)
}

function findButtonByText(wrapper: ReturnType<typeof mountAlbumSettingsView>, text: string) {
  return wrapper.findAll('button').find(button => button.text().trim() === text)
}

describe('AlbumSettingsView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.replaceMock.mockReset()
    mocks.albumGetMock.mockReset()
    mocks.albumActivityMock.mockReset()
    mocks.albumUpdateWorkflowMock.mockReset()
    mocks.albumTracksMock.mockReset()
    mocks.albumArchivedTracksMock.mockReset()
    mocks.albumGetWebhookMock.mockReset()
    mocks.albumGetWebhookDeliveriesMock.mockReset()
    mocks.albumUpdateTeamMock.mockReset()
    mocks.albumArchiveMock.mockReset()
    mocks.albumRestoreMock.mockReset()
    mocks.checklistGetTemplateMock.mockReset()
    mocks.checklistUpdateTemplateMock.mockReset()
    mocks.checklistResetTemplateMock.mockReset()
    mocks.invitationListForAlbumMock.mockReset()
    mocks.userListMock.mockReset()
    mocks.circleGetMock.mockReset()
    mocks.userListMock.mockReset()
    mocks.trackRestoreMock.mockReset()
    mocks.toastSuccessMock.mockReset()
    mocks.toastErrorMock.mockReset()
    mocks.currentUser = { id: 1 }

    mocks.albumGetMock.mockResolvedValue(makeAlbum())
    mocks.albumTracksMock.mockResolvedValue([makeTrack(11, 'Track A')])
    mocks.albumActivityMock.mockResolvedValue([
      {
        id: 1,
        event_type: 'track_submitted',
        from_status: null,
        to_status: 'submitted',
        payload: null,
        created_at: '2024-01-02T00:00:00Z',
        actor: makeUser(1, 'Producer'),
      },
    ])
    mocks.albumArchivedTracksMock.mockResolvedValue([
      makeTrack(91, 'Archived Track', { archived_at: '2024-01-05T00:00:00Z' }),
    ])
    mocks.albumUpdateTeamMock.mockResolvedValue(makeAlbum({ members: [] }))
    mocks.albumGetWebhookMock.mockResolvedValue({
      url: '',
      enabled: false,
      events: [],
      type: 'generic',
      secret: '',
      app_id: '',
      app_secret: '',
      filter_user_ids: [],
    })
    mocks.albumGetWebhookDeliveriesMock.mockResolvedValue([])
    mocks.checklistGetTemplateMock.mockResolvedValue({
      items: [{ label: 'Balance', description: null, required: true, sort_order: 0 }],
      is_default: false,
    })
    mocks.checklistUpdateTemplateMock.mockResolvedValue({
      items: [{ label: 'Balance Updated', description: null, required: true, sort_order: 0 }],
      is_default: false,
    })
    mocks.checklistResetTemplateMock.mockResolvedValue(undefined)
    mocks.invitationListForAlbumMock.mockResolvedValue([])
    mocks.userListMock.mockResolvedValue([
      makeUser(1, 'Producer'),
      makeUser(2, 'Mastering'),
      makeUser(3, 'Member'),
    ])
    mocks.circleGetMock.mockResolvedValue({
      id: 9,
      members: [
        { id: 1, user_id: 1, role: 'owner', joined_at: '2024-01-01T00:00:00Z', user: makeUser(1, 'Producer') },
        { id: 2, user_id: 3, role: 'member', joined_at: '2024-01-01T00:00:00Z', user: makeUser(3, 'Member') },
      ],
    })
    mocks.userListMock.mockResolvedValue([makeUser(1, 'Producer'), makeUser(3, 'Member')])
    mocks.trackRestoreMock.mockResolvedValue(makeTrack(91, 'Archived Track'))
    mocks.albumArchiveMock.mockResolvedValue(makeAlbum({ archived_at: '2024-01-05T00:00:00Z' }))
    mocks.albumRestoreMock.mockResolvedValue(makeAlbum())
  })

  it('saves workflow changes and renders migration details', async () => {
    mocks.albumUpdateWorkflowMock.mockResolvedValue({
      ok: true,
      migrations: [
        {
          track_id: 77,
          track_title: 'Migrated Track',
          from_step: 'peer_review',
          to_step: 'producer_gate',
        },
      ],
    })

    const wrapper = mountAlbumSettingsView()
    await flushPromises()

    await findButtonByText(wrapper, 'Workflow')!.trigger('click')
    await wrapper.find('button.workflow-editor-save').trigger('click')
    await flushPromises()

    expect(mocks.albumUpdateWorkflowMock).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ version: 2 }),
    )
    expect(mocks.albumGetMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('The following tracks were migrated due to stage changes:')
    expect(wrapper.text()).toContain('Migrated Track')
  })

  it('tracks checklist dirty state, saves edits, and resets to defaults', async () => {
    const wrapper = mountAlbumSettingsView()
    await flushPromises()

    await findButtonByText(wrapper, 'Checklist Template')!.trigger('click')

    const labelInput = wrapper.findAll('input').find(input => (input.element as HTMLInputElement).value === 'Balance')
    expect(labelInput).toBeTruthy()

    await labelInput!.setValue('Balance Updated')
    expect(wrapper.text()).toContain('Unsaved changes')

    await findButtonByText(wrapper, 'Save Template')!.trigger('click')
    await flushPromises()

    expect(mocks.checklistUpdateTemplateMock).toHaveBeenCalledWith(5, [
      expect.objectContaining({ label: 'Balance Updated', sort_order: 0 }),
    ])

    mocks.checklistGetTemplateMock.mockResolvedValueOnce({
      items: [{ label: 'Default Gate', description: 'Default description', required: true, sort_order: 0 }],
      is_default: true,
    })

    await findButtonByText(wrapper, 'Reset to Default')!.trigger('click')
    await flushPromises()

    expect(mocks.checklistResetTemplateMock).toHaveBeenCalledWith(5)
    const resetInput = wrapper.findAll('input').find(input => (input.element as HTMLInputElement).value === 'Default Gate')
    expect(resetInput).toBeTruthy()
  })

  it('restores archived tracks from the archive tab', async () => {
    const wrapper = mountAlbumSettingsView()
    await flushPromises()

    await findButtonByText(wrapper, 'Archive')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Archived Track')

    await findButtonByText(wrapper, 'Restore')!.trigger('click')
    await flushPromises()

    expect(mocks.trackRestoreMock).toHaveBeenCalledWith(91)
    expect(wrapper.text()).toContain('No archived tracks')
    expect(
      wrapper.findAll('.card').some(card => card.text().includes('Archived Track') && card.text().includes('Nova'))
    ).toBe(false)
  })

  it('archives the album from the danger tab after confirmation', async () => {
    const wrapper = mountAlbumSettingsView()
    await flushPromises()

    await findButtonByText(wrapper, 'Danger Zone')!.trigger('click')
    await findButtonByText(wrapper, 'Archive this album')!.trigger('click')

    expect(wrapper.text()).toContain('Archive "Nebula"?')

    await findButtonByText(wrapper, 'Confirm')!.trigger('click')
    await flushPromises()

    expect(mocks.albumArchiveMock).toHaveBeenCalledWith(5)
    expect(mocks.pushMock).toHaveBeenCalledWith('/albums')
  })

  it('lazy-loads tab data only when the corresponding tab is opened', async () => {
    const wrapper = mountAlbumSettingsView()
    await flushPromises()

    expect(mocks.albumTracksMock).not.toHaveBeenCalled()
    expect(mocks.albumArchivedTracksMock).not.toHaveBeenCalled()
    expect(mocks.albumGetWebhookMock).not.toHaveBeenCalled()
    expect(mocks.checklistGetTemplateMock).not.toHaveBeenCalled()
    expect(mocks.invitationListForAlbumMock).not.toHaveBeenCalled()

    await findButtonByText(wrapper, 'Track Order')!.trigger('click')
    await flushPromises()
    expect(mocks.albumTracksMock).toHaveBeenCalledWith(5)

    await findButtonByText(wrapper, 'Checklist Template')!.trigger('click')
    await flushPromises()
    expect(mocks.checklistGetTemplateMock).toHaveBeenCalledWith(5)

    await findButtonByText(wrapper, 'Team')!.trigger('click')
    await flushPromises()
    expect(mocks.invitationListForAlbumMock).toHaveBeenCalledWith(5)
    expect(mocks.circleGetMock).toHaveBeenCalledWith(9)
  })

  it('refetches the activity feed when the event filter changes', async () => {
    mocks.albumActivityMock
      .mockResolvedValueOnce([
        {
          id: 1,
          event_type: 'track_submitted',
          from_status: null,
          to_status: 'submitted',
          payload: null,
          created_at: '2024-01-02T00:00:00Z',
          actor: makeUser(1, 'Producer'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 2,
          event_type: 'issue_created',
          from_status: null,
          to_status: null,
          payload: null,
          created_at: '2024-01-03T00:00:00Z',
          actor: makeUser(1, 'Producer'),
        },
      ])

    const wrapper = mountAlbumSettingsView()
    await flushPromises()

    await findButtonByText(wrapper, 'Activity')!.trigger('click')
    await flushPromises()

    expect(mocks.albumActivityMock).toHaveBeenLastCalledWith(5, {
      event_type: undefined,
      limit: 30,
      offset: 0,
    })

    await wrapper.find('select.select-field').setValue('issue_created')
    await flushPromises()

    expect(mocks.albumActivityMock).toHaveBeenLastCalledWith(5, {
      event_type: 'issue_created',
      limit: 30,
      offset: 0,
    })
    expect(wrapper.text()).toContain('issue created')
  })

  it('confirms member removal before updating the album team', async () => {
    const wrapper = mountAlbumSettingsView()
    await flushPromises()

    await findButtonByText(wrapper, 'Team')!.trigger('click')
    await flushPromises()

    const removeButton = findButtonByText(wrapper, 'Remove')
    expect(removeButton).toBeTruthy()

    await removeButton!.trigger('click')
    await flushPromises()

    expect(mocks.albumUpdateTeamMock).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Remove Member')

    const confirmButton = Array.from(document.body.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Remove')
    expect(confirmButton).toBeTruthy()

    confirmButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mocks.albumUpdateTeamMock).toHaveBeenCalledWith(5, expect.objectContaining({ member_ids: [] }))
  })
})
