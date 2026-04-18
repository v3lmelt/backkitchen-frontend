import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'
import type { Issue } from '@/types'

import CommentInput from './CommentInput.vue'

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
  makeIssue({ id: 12, local_number: 5, title: 'Bass too loud' }),
]

async function typeInto(textarea: ReturnType<ReturnType<typeof mountWithPlugins>['find']>, value: string) {
  const el = textarea.element as HTMLTextAreaElement
  el.value = value
  el.selectionStart = value.length
  el.selectionEnd = value.length
  await textarea.trigger('input')
  await flushPromises()
}

function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('CommentInput (issue mention picker)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the issue picker when textarea contains an active @issue mention', async () => {
    const wrapper = mountWithPlugins(CommentInput, {
      attachTo: document.body,
      props: {
        placeholder: 'Write a note',
        submitLabel: 'Post',
        enableTimestampPopover: true,
        issues,
      },
    })

    const textarea = wrapper.find('textarea')
    await typeInto(textarea, 'See @i')

    const items = wrapper.findAll('[data-issue-mention-item]')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('Vocal balance')

    wrapper.unmount()
  })

  it('replaces the active mention with @issue:N and a trailing space when an item is picked', async () => {
    const wrapper = mountWithPlugins(CommentInput, {
      attachTo: document.body,
      props: {
        placeholder: 'p',
        submitLabel: 's',
        enableTimestampPopover: true,
        issues,
      },
    })

    const textarea = wrapper.find('textarea')
    await typeInto(textarea, 'See @i')

    const items = wrapper.findAll('[data-issue-mention-item]')
    // Pick "Bass too loud" (#5)
    await items[1].trigger('mousedown')
    await flushPromises()

    const el = textarea.element as HTMLTextAreaElement
    expect(el.value).toBe('See @issue:5 ')
    expect(el.selectionStart).toBe('See @issue:5 '.length)

    wrapper.unmount()
  })

  it('replaces a partially typed mention (e.g. @issue:1 → @issue:5) when picking from filtered list', async () => {
    const wrapper = mountWithPlugins(CommentInput, {
      attachTo: document.body,
      props: {
        placeholder: 'p',
        submitLabel: 's',
        enableTimestampPopover: true,
        issues,
      },
    })

    const textarea = wrapper.find('textarea')
    await typeInto(textarea, 'Refer to @issue:5')

    const items = wrapper.findAll('[data-issue-mention-item]')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toContain('#5')

    pressKey('Enter')
    await flushPromises()

    const el = textarea.element as HTMLTextAreaElement
    expect(el.value).toBe('Refer to @issue:5 ')

    wrapper.unmount()
  })

  it('does not show the picker when issues prop is omitted (falls back to syntax cheatsheet)', async () => {
    const wrapper = mountWithPlugins(CommentInput, {
      attachTo: document.body,
      props: {
        placeholder: 'p',
        submitLabel: 's',
        enableTimestampPopover: true,
      },
    })

    const textarea = wrapper.find('textarea')
    await typeInto(textarea, 'See @i')

    expect(wrapper.find('[data-issue-mention-list]').exists()).toBe(false)

    wrapper.unmount()
  })
})
