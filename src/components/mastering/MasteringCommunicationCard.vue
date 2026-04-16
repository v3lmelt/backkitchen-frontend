<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronRight, MessageSquare } from 'lucide-vue-next'

import type { Discussion, Track } from '@/types'
import { formatLocaleDate } from '@/utils/time'

const props = defineProps<{
  track: Track
  discussions: Discussion[]
  ctaLabel: string
  intro?: string | null
}>()

const emit = defineEmits<{
  open: []
}>()

const { t, locale } = useI18n()
const fmtDate = (value: string) => formatLocaleDate(value, locale.value)

const sortedDiscussions = computed(() =>
  [...props.discussions].sort((a, b) => (
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )),
)

const latestDiscussion = computed(() => sortedDiscussions.value.at(-1) ?? null)
const approvalCount = computed(() =>
  [props.track.current_master_delivery?.producer_approved_at, props.track.current_master_delivery?.submitter_approved_at]
    .filter(Boolean)
    .length,
)

const state = computed(() => {
  if (props.track.status === 'completed') {
    return {
      label: t('masteringCommunication.status.completed'),
      className: 'bg-success-bg text-success',
    }
  }

  if (props.track.current_master_delivery && !props.track.current_master_delivery.confirmed_at) {
    return {
      label: t('masteringCommunication.status.awaitingEngineerConfirmation'),
      className: 'bg-warning-bg text-warning',
    }
  }

  if (props.track.current_master_delivery && approvalCount.value < 2) {
    return {
      label: t('masteringCommunication.status.awaitingFinalApproval'),
      className: 'bg-primary/15 text-primary',
    }
  }

  if (props.track.current_master_delivery && approvalCount.value >= 2) {
    return {
      label: t('masteringCommunication.status.deliveryReady'),
      className: 'bg-success-bg text-success',
    }
  }

  if (
    props.track.workflow_step?.ui_variant === 'mastering'
    || props.track.status === 'mastering'
    || props.track.status === 'mastering_revision'
  ) {
    return {
      label: t('masteringCommunication.status.awaitingMastering'),
      className: 'bg-primary/15 text-primary',
    }
  }

  if (props.discussions.length > 0) {
    return {
      label: t('masteringCommunication.status.active'),
      className: 'bg-info-bg text-info',
    }
  }

  return {
    label: t('masteringCommunication.status.readyToStart'),
    className: 'bg-border text-muted-foreground',
  }
})

const discussionCountLabel = computed(() => (
  props.discussions.length > 0
    ? t('masteringCommunication.messageCount', { count: props.discussions.length })
    : t('masteringCommunication.none')
))

const deliveryLabel = computed(() => (
  props.track.current_master_delivery
    ? t('masteringCommunication.deliveryValue', { version: props.track.current_master_delivery.delivery_number })
    : t('masteringCommunication.deliveryEmpty')
))

const approvalLabel = computed(() => (
  props.track.current_master_delivery
    ? t('masteringCommunication.approvalValue', { approved: approvalCount.value, total: 2 })
    : t('masteringCommunication.approvalEmpty')
))

const previewLabel = computed(() => {
  if (latestDiscussion.value) return t('masteringCommunication.latestDiscussion')
  if (props.track.mastering_notes) return t('masteringCommunication.masteringNotes')
  return t('masteringCommunication.getStarted')
})

const previewMeta = computed(() => {
  if (!latestDiscussion.value) return ''

  const author = latestDiscussion.value.author?.display_name || t('trackDetail.system')
  return `${author} · ${fmtDate(latestDiscussion.value.created_at)}`
})

const previewText = computed(() => {
  if (latestDiscussion.value) {
    const content = latestDiscussion.value.content.trim()
    if (content) return content
    if (latestDiscussion.value.audios?.length) return t('masteringCommunication.audioAttachment')
    if (latestDiscussion.value.images?.length) return t('masteringCommunication.imageAttachment')
    return t('masteringCommunication.attachmentOnly')
  }

  if (props.track.mastering_notes?.trim()) {
    return props.track.mastering_notes.trim()
  }

  return t('masteringCommunication.emptyPreview')
})

const introText = computed(() => props.intro || t('masteringCommunication.subtitle'))
</script>

<template>
  <section class="card space-y-4 border border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div class="space-y-3 min-w-0">
        <div class="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-mono text-primary">
          <MessageSquare class="h-3.5 w-3.5" :stroke-width="2" />
          {{ t('masteringCommunication.title') }}
        </div>
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-sans font-semibold text-foreground">{{ introText }}</h3>
            <span class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-mono" :class="state.className">
              {{ state.label }}
            </span>
          </div>
          <p class="text-sm text-muted-foreground">
            {{ t('masteringCommunication.description') }}
          </p>
        </div>
      </div>

      <button
        type="button"
        class="btn-primary h-10 shrink-0 px-4 text-sm"
        @click="emit('open')"
      >
        <span class="inline-flex items-center gap-1.5">
          {{ ctaLabel }}
          <ChevronRight class="h-4 w-4" :stroke-width="2.5" />
        </span>
      </button>
    </div>

    <div class="grid gap-3 sm:grid-cols-3">
      <div class="rounded-none border border-border bg-background/80 px-3 py-3">
        <div class="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          {{ t('masteringCommunication.messageHeading') }}
        </div>
        <div class="mt-1 text-sm font-semibold text-foreground">{{ discussionCountLabel }}</div>
      </div>
      <div class="rounded-none border border-border bg-background/80 px-3 py-3">
        <div class="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          {{ t('masteringCommunication.deliveryHeading') }}
        </div>
        <div class="mt-1 text-sm font-semibold text-foreground">{{ deliveryLabel }}</div>
      </div>
      <div class="rounded-none border border-border bg-background/80 px-3 py-3">
        <div class="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          {{ t('masteringCommunication.approvalHeading') }}
        </div>
        <div class="mt-1 text-sm font-semibold text-foreground">{{ approvalLabel }}</div>
      </div>
    </div>

    <div class="rounded-none border border-primary/20 bg-background/80 px-4 py-3">
      <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div class="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          {{ previewLabel }}
        </div>
        <div v-if="previewMeta" class="text-xs text-muted-foreground">
          {{ previewMeta }}
        </div>
      </div>
      <p class="mt-2 max-h-20 overflow-hidden whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
        {{ previewText }}
      </p>
    </div>
  </section>
</template>
