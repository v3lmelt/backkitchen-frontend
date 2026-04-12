<script setup lang="ts">
import { onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppLayout from '@/components/layout/AppLayout.vue'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

const isAuthPage = computed(() =>
  ['/login', '/register', '/verify-email', '/forgot-password', '/reset-password'].includes(route.path)
)

onMounted(() => {
  appStore.bootstrap()
})

watch(() => appStore.isAuthenticated, (authed) => {
  if (!authed && appStore.bootstrapped && !isAuthPage.value) {
    router.push('/login')
  }
})
</script>

<template>
  <template v-if="isAuthPage">
    <RouterView />
  </template>
  <template v-else-if="!appStore.bootstrapped">
    <div class="min-h-screen bg-background flex items-center justify-center">
      <div class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  </template>
  <AppLayout v-else>
    <RouterView />
  </AppLayout>
</template>
