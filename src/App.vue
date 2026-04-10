<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppLayout from '@/components/layout/AppLayout.vue'

const route = useRoute()
const appStore = useAppStore()

const isAuthPage = computed(() =>
  ['/login', '/register', '/verify-email', '/forgot-password', '/reset-password'].includes(route.path)
)

onMounted(() => {
  appStore.bootstrap()
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
