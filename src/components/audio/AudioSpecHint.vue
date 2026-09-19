<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AudioSpecCheck } from '@/types'
defineProps<{ check?: AudioSpecCheck | null }>()
const { t } = useI18n()
</script>

<template>
  <span v-if="check?.status === 'mismatch' || check?.status === 'unknown'" class="text-xs text-warning" role="status">
    {{ t(check.status === 'mismatch' ? 'audioSpecs.mismatch' : 'audioSpecs.unknown') }}
  </span>
</template>
