<script setup lang="ts">
import type { MasterDelivery } from '@/types'
import { useI18n } from 'vue-i18n'
import { formatLocaleDate } from '@/utils/time'
import { formatMasterDeliveryOptionLabel } from '@/utils/sourceVersions'

defineProps<{
  deliveries: MasterDelivery[]
  currentDeliveryId: number | null
  downloading: boolean
  downloadProgress: number
}>()

const emit = defineEmits<{
  compare: [delivery: MasterDelivery]
  download: [delivery: MasterDelivery]
}>()

const { t, locale } = useI18n()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)
const optionLabel = (delivery: MasterDelivery) => formatMasterDeliveryOptionLabel(delivery, fmtDate)
</script>

<template>
  <div class="card space-y-3">
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('workflowStep.masterVersionHistory') }}</h3>
      <span class="text-xs text-muted-foreground">{{ deliveries.length }}</span>
    </div>
    <div class="space-y-2">
      <div
        v-for="delivery in deliveries"
        :key="delivery.id"
        class="flex flex-col gap-3 border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="space-y-2 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-mono font-semibold text-foreground">{{ optionLabel(delivery) }}</span>
            <span v-if="delivery.id === currentDeliveryId" class="bg-border text-foreground px-2 py-1 rounded-full text-[11px] font-mono">
              {{ t('compare.currentVersion') }}
            </span>
            <span class="bg-border text-foreground px-2 py-1 rounded-full text-[11px] font-mono">
              {{ delivery.file_path ? t('workflowStep.fileDeliveryLabel') : t('workflowStep.textDeliveryLabel') }}
            </span>
          </div>
          <p class="text-xs text-muted-foreground">
            {{ delivery.confirmed_at ? t('workflowStep.deliveryConfirmed') : t('workflowStep.deliveryPendingConfirmation') }}
          </p>
          <div v-if="delivery.delivery_message" class="border border-border bg-card rounded-none p-3">
            <p class="text-xs text-muted-foreground mb-1">{{ t('workflowStep.deliveryMessageLabel') }}</p>
            <p class="whitespace-pre-wrap break-words text-sm text-foreground">{{ delivery.delivery_message }}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <button
            v-if="delivery.id !== currentDeliveryId && delivery.file_path"
            @click="emit('compare', delivery)"
            class="btn-secondary text-xs px-3 py-1"
          >
            {{ t('compare.title') }}
          </button>
          <button v-if="delivery.file_path" @click="emit('download', delivery)" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
