<script setup lang="ts">
import { computed } from 'vue'
import Sidebar from './Sidebar.vue'
import AppHeader from './AppHeader.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import ShortcutsModal from '@/components/common/ShortcutsModal.vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const layoutStyle = computed(() => ({
  '--sidebar-w': appStore.sidebarCollapsed ? '4rem' : '15rem',
}))
</script>

<template>
  <div class="flex h-screen overflow-hidden" :style="layoutStyle">
    <Sidebar />
    <div class="flex flex-col flex-1 overflow-hidden">
      <AppHeader />
      <main class="flex-1 overflow-y-auto pt-4 px-4 pb-32 md:pt-6 md:px-6 md:pb-32 lg:pb-32">
        <slot />
      </main>
    </div>
  </div>
  <ToastContainer />
  <ShortcutsModal />
</template>
