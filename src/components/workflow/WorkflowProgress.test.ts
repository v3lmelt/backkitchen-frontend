import { describe, expect, it } from 'vitest'
import { mountWithPlugins } from '@/tests/utils'
import WorkflowProgress from './WorkflowProgress.vue'

describe('WorkflowProgress', () => {
  it('renders steps for non-rejected status', () => {
    const wrapper = mountWithPlugins(WorkflowProgress, {
      props: { status: 'peer_review' },
    })
    const circles = wrapper.findAll('.rounded-full')
    expect(circles.length).toBeGreaterThanOrEqual(6)
  })

  it('highlights submitted step for submitted status', () => {
    const wrapper = mountWithPlugins(WorkflowProgress, {
      props: { status: 'submitted' },
    })
    const circles = wrapper.findAll('.w-6')
    // First step should be active (bg-primary)
    expect(circles[0].classes()).toContain('bg-primary')
    // Second step should be inactive
    expect(circles[1].classes()).toContain('bg-border')
  })

  it('highlights up to mastering step for mastering status', () => {
    const wrapper = mountWithPlugins(WorkflowProgress, {
      props: { status: 'mastering' },
    })
    const circles = wrapper.findAll('.w-6')
    // Steps 0-3 (submitted, peer, gate, mastering) should be active
    expect(circles[0].classes()).toContain('bg-primary')
    expect(circles[1].classes()).toContain('bg-primary')
    expect(circles[2].classes()).toContain('bg-primary')
    expect(circles[3].classes()).toContain('bg-primary')
    // Step 4 (final) should be inactive
    expect(circles[4].classes()).toContain('bg-border')
  })

  it('shows rejected text for rejected status', () => {
    const wrapper = mountWithPlugins(WorkflowProgress, {
      props: { status: 'rejected' },
    })
    expect(wrapper.find('.text-error').exists()).toBe(true)
    // Should not render step circles
    expect(wrapper.findAll('.w-6')).toHaveLength(0)
  })

  it('highlights all steps for completed status', () => {
    const wrapper = mountWithPlugins(WorkflowProgress, {
      props: { status: 'completed' },
    })
    const circles = wrapper.findAll('.w-6')
    for (const circle of circles) {
      expect(circle.classes()).toContain('bg-primary')
    }
  })

  it('groups peer_revision under peer step', () => {
    const wrapper = mountWithPlugins(WorkflowProgress, {
      props: { status: 'peer_revision' },
    })
    const circles = wrapper.findAll('.w-6')
    // peer is index 1, so steps 0-1 should be active
    expect(circles[0].classes()).toContain('bg-primary')
    expect(circles[1].classes()).toContain('bg-primary')
    expect(circles[2].classes()).toContain('bg-border')
  })
})
