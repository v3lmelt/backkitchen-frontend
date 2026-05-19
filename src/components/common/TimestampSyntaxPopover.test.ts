import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'
import type { Issue, User } from '@/types'

import TimestampSyntaxPopover from './TimestampSyntaxPopover.vue'

function makeIssue(overrides: Partial<Issue> & Pick<Issue, 'id' | 'local_number' | 'title'>): Issue {
  return {
    track_id: 1,
    author_id: 1,
    phase: 'peer',
    workflow_cycle: 1,
    source_version_id: null,
    source_version_number: 1,
    master_delivery_id: null,
    description: '',
    severity: 'major',
    status: 'open',
    markers: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    comments: [],
    ...overrides,
  } as Issue
}

const issues: Issue[] = [
  makeIssue({ id: 11, local_number: 1, title: 'Vocal balance' }),
  makeIssue({ id: 12, local_number: 2, title: 'Bass too loud' }),
  makeIssue({ id: 13, local_number: 12, title: 'Click at 1:30' }),
]

const users: User[] = [
  {
    id: 21,
    username: 'kira',
    display_name: 'Kira',
    role: 'producer',
    avatar_color: '#ff8400',
    is_admin: false,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 31,
    username: 'nova',
    display_name: 'Nova',
    role: 'member',
    avatar_color: '#4a5270',
    is_admin: false,
    created_at: '2024-01-01T00:00:00Z',
  },
]

function pressKey(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  return event
}

describe('TimestampSyntaxPopover (issue picker mode)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the picker (not the syntax cheatsheet) when cursor is in an @issue mention and issues are provided', () => {
    const wrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: 'See @i',
        cursorPos: 6,
        issues,
      },
    })

    expect(wrapper.find('[data-issue-mention-list]').exists()).toBe(true)
    // The "Reference Syntax" cheatsheet header should NOT show in picker mode
    expect(wrapper.text()).not.toContain('Reference Syntax')

    wrapper.unmount()
  })

  it('lists all issues with #localNumber and title and marks the first item active by default', () => {
    const wrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: '@i',
        cursorPos: 2,
        issues,
      },
    })

    const items = wrapper.findAll('[data-issue-mention-item]')
    expect(items).toHaveLength(3)
    expect(items[0].text()).toContain('#1')
    expect(items[0].text()).toContain('Vocal balance')
    expect(items[1].text()).toContain('#2')
    expect(items[2].text()).toContain('#12')

    expect(items[0].attributes('aria-selected')).toBe('true')
    expect(items[1].attributes('aria-selected')).toBe('false')

    wrapper.unmount()
  })

  it('filters by local_number prefix when query has digits', () => {
    const wrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: '@issue:1',
        cursorPos: 8,
        issues,
      },
    })

    const items = wrapper.findAll('[data-issue-mention-item]')
    // local_number 1 and 12 both start with "1"
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('#1')
    expect(items[1].text()).toContain('#12')

    wrapper.unmount()
  })

  it('shows an empty-state message when issues array is empty', () => {
    const wrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: '@i',
        cursorPos: 2,
        issues: [],
      },
    })

    expect(wrapper.find('[data-issue-mention-empty]').exists()).toBe(true)
    expect(wrapper.findAll('[data-issue-mention-item]')).toHaveLength(0)

    wrapper.unmount()
  })

  it('moves the active item with ArrowDown / ArrowUp and wraps around', async () => {
    const wrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: '@i',
        cursorPos: 2,
        issues,
      },
    })

    pressKey('ArrowDown')
    await flushPromises()
    let items = wrapper.findAll('[data-issue-mention-item]')
    expect(items[1].attributes('aria-selected')).toBe('true')

    pressKey('ArrowDown')
    pressKey('ArrowDown') // wraps back to first
    await flushPromises()
    items = wrapper.findAll('[data-issue-mention-item]')
    expect(items[0].attributes('aria-selected')).toBe('true')

    pressKey('ArrowUp') // wraps to last
    await flushPromises()
    items = wrapper.findAll('[data-issue-mention-item]')
    expect(items[2].attributes('aria-selected')).toBe('true')

    wrapper.unmount()
  })

  it('emits select with the active issue and the mention range when Enter is pressed', async () => {
    const wrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: 'See @issue:1',
        cursorPos: 12,
        issues,
      },
    })

    // Filtered list contains #1 and #12; active = #1
    const enterEvent = pressKey('Enter')
    await flushPromises()

    const emitted = wrapper.emitted('select')
    expect(emitted).toHaveLength(1)
    const [issue, mention] = emitted![0] as [Issue, { start: number; end: number }]
    expect(issue.local_number).toBe(1)
    expect(mention).toEqual({ start: 4, end: 12 })
    // Enter must be intercepted so the textarea doesn't insert a newline
    expect(enterEvent.defaultPrevented).toBe(true)

    wrapper.unmount()
  })

  it('emits select when an item is clicked', async () => {
    const wrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: '@i',
        cursorPos: 2,
        issues,
      },
    })

    const items = wrapper.findAll('[data-issue-mention-item]')
    await items[2].trigger('mousedown')
    await flushPromises()

    const emitted = wrapper.emitted('select')
    expect(emitted).toHaveLength(1)
    const [issue, mention] = emitted![0] as [Issue, { start: number; end: number }]
    expect(issue.local_number).toBe(12)
    expect(mention).toEqual({ start: 0, end: 2 })

    wrapper.unmount()
  })

  it('closes the picker on Escape without emitting select', async () => {
    const wrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: '@i',
        cursorPos: 2,
        issues,
      },
    })

    expect(wrapper.find('[data-issue-mention-list]').exists()).toBe(true)
    pressKey('Escape')
    await flushPromises()

    expect(wrapper.find('[data-issue-mention-list]').exists()).toBe(false)
    expect(wrapper.emitted('select')).toBeUndefined()

    wrapper.unmount()
  })

  it('falls back to the syntax cheatsheet when no issues prop is supplied', () => {
    const wrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: '@issue:1',
        cursorPos: 8,
      },
    })

    expect(wrapper.find('[data-issue-mention-list]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Reference Syntax')

    wrapper.unmount()
  })

  it('keeps @issue picker priority when user mention candidates are also provided', () => {
    const wrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: '@issue:1',
        cursorPos: 8,
        issues,
        mentionUsers: users,
      },
    })

    expect(wrapper.find('[data-issue-mention-list]').exists()).toBe(true)
    expect(wrapper.find('[data-user-mention-list]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('renders the user picker for bare @ and inserts the active user with Enter', async () => {
    const wrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: 'Loop @',
        cursorPos: 6,
        mentionUsers: users,
      },
    })

    const items = wrapper.findAll('[data-user-mention-item]')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('@Kira')
    expect(items[0].text()).toContain('ID 21')

    const enterEvent = pressKey('Enter')
    await flushPromises()

    const emitted = wrapper.emitted('selectUser')
    expect(emitted).toHaveLength(1)
    const [user, mention] = emitted![0] as [User, { start: number; end: number }]
    expect(user.id).toBe(21)
    expect(mention).toEqual({ start: 5, end: 6 })
    expect(enterEvent.defaultPrevented).toBe(true)

    wrapper.unmount()
  })

  it('filters user picker by display name or username', () => {
    const wrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: '@nov',
        cursorPos: 4,
        mentionUsers: users,
      },
    })

    const items = wrapper.findAll('[data-user-mention-item]')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toContain('@Nova')

    wrapper.unmount()
  })

  it('renders all user candidates for @user and @user:', () => {
    const exactWrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: '@user',
        cursorPos: 5,
        mentionUsers: users,
      },
    })

    expect(exactWrapper.findAll('[data-user-mention-item]')).toHaveLength(2)
    exactWrapper.unmount()

    const tokenWrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: '@user:',
        cursorPos: 6,
        mentionUsers: users,
      },
    })

    expect(tokenWrapper.findAll('[data-user-mention-item]')).toHaveLength(2)
    tokenWrapper.unmount()
  })

  it('filters @user: input by user ID prefix', () => {
    const wrapper = mountWithPlugins(TimestampSyntaxPopover, {
      attachTo: document.body,
      props: {
        text: '@user:3',
        cursorPos: 7,
        mentionUsers: users,
      },
    })

    const items = wrapper.findAll('[data-user-mention-item]')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toContain('@Nova')
    expect(items[0].text()).toContain('ID 31')

    wrapper.unmount()
  })
})
