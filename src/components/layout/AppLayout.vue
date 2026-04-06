<script setup lang="ts">
import Sidebar from './Sidebar.vue'
import AppHeader from './AppHeader.vue'
import ToastContainer from '@/components/ToastContainer.vue'
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <Sidebar />
    <div class="flex flex-col flex-1 overflow-hidden">
      <AppHeader />
      <main class="flex-1 overflow-y-auto p-4 md:p-6">
        <slot />
      </main>
    </div>
  </div>
  <ToastContainer />
</template>
