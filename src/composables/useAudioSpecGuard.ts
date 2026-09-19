import { onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import type { AudioSpec, AudioSpecCheck } from '@/types'
import { inspectAudioSpec } from '@/utils/audioSpecs'

export function useAudioFileSpec(file: Ref<File | null>, spec: Ref<AudioSpec | null | undefined>) {
  const check = ref<AudioSpecCheck>({ status: 'unknown', differences: [] })
  let serial = 0
  watch([file, spec], async () => {
    const request = ++serial
    check.value = { status: spec.value?.enabled ? 'unknown' : 'disabled', differences: [] }
    if (!file.value) return
    const result = await inspectAudioSpec(file.value, spec.value)
    if (request === serial) check.value = result
  }, { immediate: true, deep: true })
  onBeforeUnmount(() => { serial++ })
  return check
}

export function useAudioSpecGuard() {
  const pending = shallowRef<AudioSpecCheck | null>(null)
  const busy = ref(false)
  let generation = 0
  let resolve: ((answer: boolean) => void) | null = null
  function answer(accepted: boolean) {
    if (!accepted) generation++
    const callback = resolve
    resolve = null
    pending.value = null
    callback?.(accepted)
  }
  async function run(check: AudioSpecCheck | undefined | (() => Promise<AudioSpecCheck>), action: () => Promise<void>) {
    if (busy.value) return
    busy.value = true
    const current = generation
    try {
      const result = typeof check === 'function' ? await check() : check
      if (current !== generation) return
      if (result?.status === 'mismatch') {
        pending.value = result
        if (!await new Promise<boolean>(done => { resolve = done })) return
      }
      if (current === generation) await action()
    } finally {
      busy.value = false
    }
  }
  onBeforeUnmount(() => answer(false))
  return { pending, busy, answer, run }
}
