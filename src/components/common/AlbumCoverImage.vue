<script setup lang="ts">
defineOptions({ inheritAttrs: false })

defineProps<{
  src?: string | null
  alt?: string
}>()
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="alt || ''"
    v-bind="$attrs"
  />
  <div
    v-else
    v-bind="$attrs"
    class="album-cover-placeholder"
    role="img"
    :aria-label="alt || ''"
  >
    <span class="album-cover-placeholder__ring" aria-hidden="true"></span>
    <span class="album-cover-placeholder__label" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.album-cover-placeholder {
  position: relative;
  display: block;
  overflow: hidden;
  isolation: isolate;
  background:
    linear-gradient(135deg, rgb(var(--color-card)) 0%, rgb(var(--color-background)) 100%),
    rgb(var(--color-background));
}

.album-cover-placeholder::before {
  content: '';
  position: absolute;
  inset: -42%;
  z-index: -2;
  opacity: 0.9;
  background:
    repeating-radial-gradient(
      circle at center,
      transparent 0 17%,
      rgb(var(--color-border) / 0.5) 17.4% 18%,
      transparent 18.5% 27%
    );
}

.album-cover-placeholder::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(circle at 50% 50%, rgb(var(--color-primary) / 0.1), transparent 28%),
    linear-gradient(135deg, rgb(var(--color-primary) / 0.05), transparent 48%);
}

.album-cover-placeholder__ring {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(64%, 9rem);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 9999px;
  border: 2px solid rgb(var(--color-primary) / 0.22);
  background: rgb(var(--color-card) / 0.42);
  box-shadow: inset 0 0 0 1px rgb(var(--color-border) / 0.7);
}

.album-cover-placeholder__label {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(20%, 2.5rem);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 9999px;
  background: rgb(var(--color-primary) / 0.38);
  box-shadow: inset 0 0 0 1px rgb(var(--color-primary) / 0.28);
}

html[data-theme='dark'] .album-cover-placeholder {
  background:
    linear-gradient(135deg, rgb(var(--color-card)) 0%, rgb(var(--color-background)) 100%),
    rgb(var(--color-card));
}

html[data-theme='dark'] .album-cover-placeholder::before {
  opacity: 0.82;
}

html[data-theme='dark'] .album-cover-placeholder__label {
  background: rgb(var(--color-primary));
}
</style>
