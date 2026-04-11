<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatLocaleDate } from '@/utils/time'
import type { EditHistory } from '@/types'
import BaseModal from '@/components/common/BaseModal.vue'

defineProps<{
  items: EditHistory[]
}>()

const emit = defineEmits<{
  close: []
}>()

const { t, locale } = useI18n()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)
</script>

<template>
  <BaseModal max-width="max-w-lg" @close="emit('close')">
    <h3 class="text-sm font-mono font-semibold text-foreground mb-4">{{ t('editHistory.historyTitle') }}</h3>
    <div v-if="items.length === 0" class="text-sm text-muted-foreground py-4 text-center">
      {{ t('editHistory.noHistory') }}
    </div>
    <div v-else class="space-y-3 max-h-[60vh] overflow-y-auto">
      <div v-for="(item, idx) in items" :key="item.id" class="border-b border-border pb-3 last:border-b-0">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-mono text-muted-foreground">
            {{ t('editHistory.version', { n: items.length - idx }) }}
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
