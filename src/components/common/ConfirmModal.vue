<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from './BaseModal.vue'

const { t } = useI18n()

withDefaults(defineProps<{
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
}>(), {
  message: '',
  confirmText: '',
  cancelText: '',
  destructive: false,
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <BaseModal max-width="max-w-sm" :aria-label="title" @close="emit('cancel')">
    <div class="space-y-4">
      <h3 class="text-sm font-mono font-semibold text-foreground pr-6">{{ title }}</h3>
      <p v-if="message" class="text-sm text-muted-foreground">{{ message }}</p>
      <div class="flex justify-end gap-3">
        <button class="btn-secondary text-sm" @click="emit('cancel')">
          {{ cancelText || t('common.cancel') }}
        </button>
        <button
          class="font-medium px-4 py-2 rounded-full transition-colors text-sm"
          :class="destructive ? 'bg-error hover:bg-error/80 text-white' : 'btn-primary'"
          @click="emit('confirm')"
        >
          {{ confirmText || t('common.confirm') }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
