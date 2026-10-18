<script setup lang="ts">
import { shallowRef, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatLocaleDate } from '@/utils/time'
import type { EditHistory } from '@/types'
import BaseModal from '@/components/common/BaseModal.vue'

const props = withDefaults(defineProps<{
  open?: boolean
  items: EditHistory[]
}>(), { open: false })

const emit = defineEmits<{
  close: []
}>()

const { t, locale } = useI18n()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)
const snapshot = shallowRef<{ items: EditHistory[]; title: string }>({ items: [], title: '' })
watchEffect(() => {
  if (props.open) snapshot.value = { items: props.items, title: t('editHistory.historyTitle') }
})
function afterLeave() {
  if (!props.open) snapshot.value = { items: [], title: '' }
}
</script>

<template>
  <BaseModal :open="open" max-width="max-w-lg" :aria-label="snapshot.title" @close="emit('close')" @after-leave="afterLeave">
    <h3 class="text-sm font-mono font-semibold text-foreground mb-4">{{ snapshot.title }}</h3>
    <div v-if="snapshot.items.length === 0" class="text-sm text-muted-foreground py-4 text-center">
      {{ t('editHistory.noHistory') }}
    </div>
    <div v-else class="space-y-3 max-h-[60vh] overflow-y-auto">
      <div v-for="(item, idx) in snapshot.items" :key="item.id" class="border-b border-border pb-3 last:border-b-0">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-mono text-muted-foreground">
            {{ t('editHistory.version', { n: snapshot.items.length - idx }) }}
          </span>
          <span class="text-xs text-muted-foreground">{{ fmtDate(item.created_at) }}</span>
        </div>
        <div class="text-xs text-muted-foreground mb-1" v-if="item.editor">
          {{ t('editHistory.editedBy', { name: item.editor.display_name }) }}
        </div>
        <div class="text-sm text-foreground whitespace-pre-wrap bg-background p-2 rounded">{{ item.old_content }}</div>
      </div>
    </div>
  </BaseModal>
</template>
