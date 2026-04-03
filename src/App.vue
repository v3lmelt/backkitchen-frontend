<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import AppLayout from '@/components/layout/AppLayout.vue'

const appStore = useAppStore()

onMounted(() => {
  appStore.loadUsers()
})
</script>

<template>
  <AppLayout>
    <RouterView />
  </AppLayout>
</template>
