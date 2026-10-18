<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ImageOff, LoaderCircle } from 'lucide-vue-next'
import { getAuthToken, resolveAssetUrl } from '@/api'

const props = defineProps<{ src: string; alt: string }>()
const { t } = useI18n()
const objectUrl = ref<string | null>(null)
const loading = ref(false)

watch(() => props.src, async (src, _previous, onCleanup) => {
  const controller = new AbortController()
  let loadedUrl: string | null = null
  objectUrl.value = null
  loading.value = true
  onCleanup(() => {
    controller.abort()
    if (loadedUrl) URL.revokeObjectURL(loadedUrl)
  })
  try {
    const token = getAuthToken()
    const apiOrigin = new URL(resolveAssetUrl('/api/'), window.location.href).origin
    const imageOrigin = new URL(src, window.location.href).origin
    const response = await fetch(src, {
      headers: token && imageOrigin === apiOrigin ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) return
    const blob = await response.blob()
    if (controller.signal.aborted) return
    loadedUrl = URL.createObjectURL(blob)
    objectUrl.value = loadedUrl
  } catch {
    // Aborted or inaccessible attachments keep the surrounding record readable.
  } finally {
    if (!controller.signal.aborted) loading.value = false
  }
}, { immediate: true })
</script>

<template>
  <a
    :href="objectUrl ?? undefined"
    target="_blank"
    rel="noopener noreferrer"
    class="block overflow-hidden"
    :aria-disabled="!objectUrl"
    :aria-busy="loading"
    :title="!objectUrl && !loading ? t('issueDetail.attachmentImageUnavailable') : undefined"
  >
    <img v-if="objectUrl" :src="objectUrl" :alt="alt" class="h-full w-full object-cover" @error="objectUrl = null" />
    <span v-else class="flex h-full w-full items-center justify-center text-muted-foreground" role="img" :aria-label="loading ? t('common.loading') : t('issueDetail.attachmentImageUnavailable')">
      <LoaderCircle v-if="loading" class="h-5 w-5 animate-spin" />
      <ImageOff v-else class="h-5 w-5" />
    </span>
  </a>
</template>
