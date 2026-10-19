<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ userId: number }>()
const { t } = useI18n()
const toast = useToast()

async function copyUid() {
  try {
    await navigator.clipboard.writeText(String(props.userId))
    toast.success(t('common.uidCopied'))
  } catch {
    toast.error(t('common.uidCopyFailed'))
  }
}
</script>

<template>
  <button
    type="button"
    class="select-text font-mono text-xs rounded-full px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    :title="t('common.copyUid', { uid: userId })"
    :aria-label="t('common.copyUid', { uid: userId })"
    @click="copyUid"
  >UID {{ userId }}</button>
</template>
