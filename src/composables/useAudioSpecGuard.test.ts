import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { useAudioSpecGuard } from './useAudioSpecGuard'
import type { AudioSpecCheck } from '@/types'

const mismatch: AudioSpecCheck = { status: 'mismatch', differences: [{ field: 'sample_rate_hz', actual: 44100, allowed: [48000] }] }
function setup() {
  let guard!: ReturnType<typeof useAudioSpecGuard>
  const wrapper = mount(defineComponent({ setup() { guard = useAudioSpecGuard(); return () => null } }))
  return { guard, wrapper }
}

describe('per-operation specification confirmation', () => {
  it('cancel never submits; repeated clicks and answers submit once; next operation asks again', async () => {
    const { guard, wrapper } = setup()
    const submit = vi.fn().mockResolvedValue(undefined)
    const cancelled = guard.run(mismatch, submit)
    expect(guard.pending.value).toEqual(mismatch)
    guard.answer(false)
    await cancelled
    expect(submit).not.toHaveBeenCalled()
    const accepted = guard.run(mismatch, submit)
    await guard.run(mismatch, submit)
    guard.answer(true)
    guard.answer(true)
    await accepted
    expect(submit).toHaveBeenCalledTimes(1)
    const next = guard.run(mismatch, submit)
    expect(guard.pending.value).toEqual(mismatch)
    guard.answer(false)
    await next
    expect(submit).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it.each(['match', 'unknown', 'disabled', 'not_applicable'] as const)('does not block %s', async status => {
    const { guard, wrapper } = setup()
    const submit = vi.fn().mockResolvedValue(undefined)
    await guard.run({ status, differences: [] }, submit)
    expect(guard.pending.value).toBeNull()
    expect(submit).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('invalidates an in-flight file probe when its context changes or unmounts', async () => {
    const { guard, wrapper } = setup()
    let finish!: (check: AudioSpecCheck) => void
    const probe = new Promise<AudioSpecCheck>(resolve => { finish = resolve })
    const submit = vi.fn()
    const pending = guard.run(() => probe, submit)
    wrapper.unmount()
    finish(mismatch)
    await pending
    expect(guard.pending.value).toBeNull()
    expect(submit).not.toHaveBeenCalled()
  })
})
