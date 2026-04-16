import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useAppStore } from '@/stores/app'
import { useTrackStore } from '@/stores/tracks'
import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  route: {
    name: 'workflow-step',
    path: '/tracks/9/step/producer_gate',
    fullPath: '/tracks/9/step/producer_gate',
    params: { id: '9', stepId: 'producer_gate' },
    query: {},
  } as any,
  pushMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.pushMock }),
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/router', () => ({
  default: { push: mocks.pushMock },
}))

vi.mock('@/api', () => ({
  authApi: { me: vi.fn() },
  configApi: { get: vi.fn() },
  invitationApi: { listMine: vi.fn(), accept: vi.fn(), decline: vi.fn() },
  notificationApi: { list: vi.fn(), markAllRead: vi.fn(), markRead: vi.fn() },
  onAuthCleared: vi.fn(),
  trackApi: { get: vi.fn(), list: vi.fn() },
  userApi: { list: vi.fn() },
  onAuthCleared: vi.fn(),
}))

import AppHeader from './AppHeader.vue'

function setRoute(overrides: Record<string, unknown>) {
  Object.assign(mocks.route, overrides)
}

describe('AppHeader', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.pushMock.mockReset()
    setRoute({
      name: 'workflow-step',
      path: '/tracks/9/step/producer_gate',
      fullPath: '/tracks/9/step/producer_gate',
      params: { id: '9', stepId: 'producer_gate' },
      query: {},
    })
  })

  it('shows track title and strict workflow step label in breadcrumbs', async () => {
    const wrapper = mountWithPlugins(AppHeader)
    const appStore = useAppStore()
    const trackStore = useTrackStore()

    appStore.setAuth({
      id: 1,
      username: 'kira',
      display_name: 'Kira',
      role: 'producer',
      avatar_color: '#ff8400',
      created_at: '2024-01-01',
      is_admin: false,
    } as any, 'token-1')

    trackStore.setCurrentTrack({
      id: 9,
      title: 'test_audio',
      workflow_step: {
        id: 'producer_gate',
        label: 'Producer Gate',
        type: 'gate',
        assignee_role: 'producer',
        order: 2,
        transitions: {},
      },
    } as any)
    await nextTick()

    expect(wrapper.text()).toContain('Home')
    expect(wrapper.text()).toContain('test_audio')
    expect(wrapper.text()).toContain('Producer Gate')
    expect(wrapper.text()).not.toContain('BACK KITCHEN')
  })

  it('shows track title on track detail breadcrumbs', async () => {
    setRoute({
      name: 'track-detail',
      path: '/tracks/9',
      fullPath: '/tracks/9',
      params: { id: '9' },
      query: {},
    })

    const wrapper = mountWithPlugins(AppHeader)
    const trackStore = useTrackStore()

    trackStore.setCurrentTrack({
      id: 9,
      title: 'test_audio',
    } as any)
    await nextTick()

    expect(wrapper.text()).toContain('Home')
    expect(wrapper.text()).toContain('test_audio')
    expect(wrapper.text()).not.toContain('Track #9')
  })
})
