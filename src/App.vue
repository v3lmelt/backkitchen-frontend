<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppLayout from '@/components/layout/AppLayout.vue'

const route = useRoute()
const appStore = useAppStore()

const isAuthPage = computed(() => ['/login', '/register'].includes(route.path))

onMounted(() => {
  if (!isAuthPage.value) {
    appStore.loadUsers()
  }
})
</script>

<template>
  <template v-if="isAuthPage">
    <RouterView />
  </template>
  <AppLayout v-else>
    <RouterView />
  </AppLayout>
</template>
