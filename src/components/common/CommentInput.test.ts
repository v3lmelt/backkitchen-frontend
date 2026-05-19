import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'
import { useToast } from '@/composables/useToast'
import type { Issue, User } from '@/types'

import CommentInput from './CommentInput.vue'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

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

const mentionUsers: User[] = [
  {
    id: 31,
    username: 'echo',
    display_name: 'Echo',
    role: 'member',
    avatar_color: '#4a5270',
    is_admin: false,
    created_at: '2024-01-01T00:00:00Z',
  },
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

function clipboardFileItem(file: File, type = file.type): DataTransferItem {
  return {
    kind: 'file',
    type,
    getAsFile: () => file,
  } as DataTransferItem
}

function clipboardTextItem(): DataTransferItem {
  return {
    kind: 'string',
    type: 'text/plain',
    getAsFile: () => null,
  } as DataTransferItem
}

function pasteEventWith(items: DataTransferItem[]): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: { items },
  })
  return event
}

describe('CommentInput (issue mention picker)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    useToast().toasts.value = []
    ;(URL as typeof URL & { createObjectURL: (file: File) => string }).createObjectURL = vi.fn((file: File) => `blob:${file.name}`)
    ;(URL as typeof URL & { revokeObjectURL: (url: string) => void }).revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    ;(URL as typeof URL & { createObjectURL: typeof originalCreateObjectURL }).createObjectURL = originalCreateObjectURL
    ;(URL as typeof URL & { revokeObjectURL: typeof originalRevokeObjectURL }).revokeObjectURL = originalRevokeObjectURL
    vi.restoreAllMocks()
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

  it('replaces an active @ mention with @user:ID and a trailing space', async () => {
    const wrapper = mountWithPlugins(CommentInput, {
      attachTo: document.body,
      props: {
        placeholder: 'p',
        submitLabel: 's',
        enableTimestampPopover: true,
        mentionUsers,
      },
    })

    const textarea = wrapper.find('textarea')
    await typeInto(textarea, 'Ping @')

    const items = wrapper.findAll('[data-user-mention-item]')
    expect(items).toHaveLength(1)
    await items[0].trigger('mousedown')
    await flushPromises()

    const el = textarea.element as HTMLTextAreaElement
    expect(el.value).toBe('Ping @user:31 ')
    expect(el.selectionStart).toBe('Ping @user:31 '.length)

    wrapper.unmount()
  })

  it('passes top placement to the mention picker for bottom-docked inputs', async () => {
    const wrapper = mountWithPlugins(CommentInput, {
      attachTo: document.body,
      props: {
        placeholder: 'p',
        submitLabel: 's',
        enableTimestampPopover: true,
        timestampPopoverPlacement: 'top',
        mentionUsers,
      },
    })

    const textarea = wrapper.find('textarea')
    await typeInto(textarea, 'Ping @')

    const popover = wrapper.find('[data-timestamp-popover]')
    expect(popover.classes()).toContain('bottom-full')
    expect(popover.classes()).not.toContain('top-full')

    wrapper.unmount()
  })

  it('replaces the whole @user: prefix token when choosing by keyboard', async () => {
    const wrapper = mountWithPlugins(CommentInput, {
      attachTo: document.body,
      props: {
        placeholder: 'p',
        submitLabel: 's',
        enableTimestampPopover: true,
        mentionUsers,
      },
    })

    const textarea = wrapper.find('textarea')
    await typeInto(textarea, 'Ping @user:3')

    const items = wrapper.findAll('[data-user-mention-item]')
    expect(items).toHaveLength(1)
    pressKey('Tab')
    await flushPromises()

    const el = textarea.element as HTMLTextAreaElement
    expect(el.value).toBe('Ping @user:31 ')
    expect(el.selectionStart).toBe('Ping @user:31 '.length)

    wrapper.unmount()
  })

  it('attaches a pasted clipboard image and submits it with the comment', async () => {
    const wrapper = mountWithPlugins(CommentInput, {
      attachTo: document.body,
      props: {
        placeholder: 'Write a note',
        submitLabel: 'Post',
      },
    })

    const image = new File(['png'], 'image.png', { type: 'image/png' })
    const pasteEvent = pasteEventWith([clipboardFileItem(image)])

    wrapper.find('textarea').element.dispatchEvent(pasteEvent)
    await flushPromises()

    expect(pasteEvent.defaultPrevented).toBe(true)
    expect(wrapper.find('img[alt="preview"]').exists()).toBe(true)

    const submitButton = wrapper.findAll('button').find(button => button.text() === 'Post')!
    await submitButton.trigger('click')

    const payload = wrapper.emitted('submit')![0][0] as { content: string; images: File[]; audios: File[] }
    expect(payload.images).toHaveLength(1)
    expect(payload.images[0].name).toMatch(/^pasted-image-\d{8}-\d{3}\.png$/)
    expect(payload.images[0].type).toBe('image/png')

    wrapper.unmount()
  })

  it('does not intercept a plain text paste', async () => {
    const wrapper = mountWithPlugins(CommentInput, {
      attachTo: document.body,
      props: {
        placeholder: 'Write a note',
        submitLabel: 'Post',
      },
    })

    const pasteEvent = pasteEventWith([clipboardTextItem()])
    wrapper.find('textarea').element.dispatchEvent(pasteEvent)
    await flushPromises()

    expect(pasteEvent.defaultPrevented).toBe(false)
    expect(wrapper.find('img[alt="preview"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('rejects unsupported pasted image types with the existing image-type message', async () => {
    const wrapper = mountWithPlugins(CommentInput, {
      attachTo: document.body,
      props: {
        placeholder: 'Write a note',
        submitLabel: 'Post',
      },
    })

    const image = new File(['tiff'], 'image.tiff', { type: 'image/tiff' })
    const pasteEvent = pasteEventWith([clipboardFileItem(image)])

    wrapper.find('textarea').element.dispatchEvent(pasteEvent)
    await flushPromises()

    expect(pasteEvent.defaultPrevented).toBe(true)
    expect(wrapper.find('img[alt="preview"]').exists()).toBe(false)
    expect(useToast().toasts.value.at(-1)?.message).toBe('Only JPEG, PNG, WebP, and GIF images are supported')

    wrapper.unmount()
  })
})
