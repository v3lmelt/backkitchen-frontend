import { describe, expect, it } from 'vitest'
import { mountWithPlugins } from '@/tests/utils'
import StatusBadge from './StatusBadge.vue'

describe('StatusBadge', () => {
  it('renders with correct label for track status', () => {
    const wrapper = mountWithPlugins(StatusBadge, {
      props: { status: 'completed', type: 'track' },
    })
    expect(wrapper.text()).toBeTruthy()
    expect(wrapper.find('span').classes()).toContain('bg-success-bg')
  })

  it('renders error style for rejected status', () => {
    const wrapper = mountWithPlugins(StatusBadge, {
      props: { status: 'rejected', type: 'track' },
    })
    expect(wrapper.find('span').classes()).toContain('bg-error-bg')
  })

  it('renders correct class for issue severity', () => {
    const wrapper = mountWithPlugins(StatusBadge, {
      props: { status: 'critical', type: 'severity' },
    })
    expect(wrapper.find('span').classes()).toContain('bg-error-bg')
  })

  it('renders warning style for major severity', () => {
    const wrapper = mountWithPlugins(StatusBadge, {
      props: { status: 'major', type: 'severity' },
    })
    expect(wrapper.find('span').classes()).toContain('bg-warning-bg')
  })

  it('renders correct class for issue status', () => {
    const wrapper = mountWithPlugins(StatusBadge, {
      props: { status: 'open', type: 'issue' },
    })
    expect(wrapper.find('span').classes()).toContain('bg-error-bg')
  })

  it('renders success style for resolved issue status', () => {
    const wrapper = mountWithPlugins(StatusBadge, {
      props: { status: 'resolved', type: 'issue' },
    })
    expect(wrapper.find('span').classes()).toContain('bg-success-bg')
  })

  it('maps phase type with phase suffix', () => {
    const wrapper = mountWithPlugins(StatusBadge, {
      props: { status: 'mastering', type: 'phase' },
    })
    expect(wrapper.find('span').classes()).toContain('bg-warning-bg')
  })

  it('falls back to neutral style for unknown status', () => {
    const wrapper = mountWithPlugins(StatusBadge, {
      props: { status: 'unknown_thing' as any },
    })
    expect(wrapper.find('span').classes()).toContain('bg-border')
  })

  it('has pill shape class', () => {
    const wrapper = mountWithPlugins(StatusBadge, {
      props: { status: 'submitted' },
    })
    expect(wrapper.find('span').classes()).toContain('rounded-full')
  })
})
