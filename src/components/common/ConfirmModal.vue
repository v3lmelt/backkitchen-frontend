<script setup lang="ts">
import { shallowRef, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from './BaseModal.vue'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  open?: boolean
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
}>(), {
  open: false,
  message: '',
  confirmText: '',
  cancelText: '',
  destructive: false,
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const snapshot = shallowRef<{
  title: string
  message: string
  confirmText: string
  cancelText: string
  destructive: boolean
} | null>(null)
watchEffect(() => {
  if (props.open) snapshot.value = {
    title: props.title, message: props.message,
    confirmText: props.confirmText, cancelText: props.cancelText,
    destructive: props.destructive,
  }
})
function afterLeave() {
  if (!props.open) snapshot.value = null
}
</script>

<template>
  <BaseModal :open="open" max-width="max-w-sm" :aria-label="snapshot?.title" @close="emit('cancel')" @after-leave="afterLeave">
    <div v-if="snapshot" class="space-y-4">
      <h3 class="text-sm font-mono font-semibold text-foreground pr-6">{{ snapshot.title }}</h3>
      <p v-if="snapshot.message" class="text-sm text-muted-foreground">{{ snapshot.message }}</p>
      <div class="flex justify-end gap-3">
        <button class="btn-secondary text-sm" @click="emit('cancel')">
          {{ snapshot.cancelText || t('common.cancel') }}
        </button>
        <button
          class="ui-control font-medium px-4 py-2 rounded-full text-sm"
          :class="snapshot.destructive ? 'bg-error hover:bg-error/80 text-white' : 'btn-primary'"
          @click="emit('confirm')"
        >
          {{ snapshot.confirmText || t('common.confirm') }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
