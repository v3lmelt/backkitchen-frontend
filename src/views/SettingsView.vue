<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { albumApi, userApi } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Album, User } from '@/types'

const { t } = useI18n()
const appStore = useAppStore()
const users = ref<User[]>([])
const albums = ref<Album[]>([])
const loading = ref(true)
const savingAlbumId = ref<number | null>(null)

const newAlbum = ref({ title: '', description: '', cover_color: '#A855F7' })
const teamState = reactive<Record<number, { mastering_engineer_id: number | null; member_ids: number[] }>>({})

onMounted(async () => {
  loading.value = true
  try {
    const [loadedUsers, loadedAlbums] = await Promise.all([userApi.list(), albumApi.list()])
    users.value = loadedUsers
    albums.value = loadedAlbums
    syncTeamState()
  } finally {
    loading.value = false
  }
})

function syncTeamState() {
  for (const album of albums.value) {
    teamState[album.id] = {
      mastering_engineer_id: album.mastering_engineer_id,
      member_ids: album.members.map(member => member.user_id),
    }
  }
}

async function createAlbum() {
  if (!newAlbum.value.title) return
  const album = await albumApi.create(newAlbum.value)
  albums.value.push(album)
  syncTeamState()
  newAlbum.value = { title: '', description: '', cover_color: '#A855F7' }
}

function toggleMember(albumId: number, userId: number) {
  const state = teamState[albumId]
  if (!state) return
  if (state.member_ids.includes(userId)) {
    state.member_ids = state.member_ids.filter(id => id !== userId)
  } else {
    state.member_ids = [...state.member_ids, userId]
  }
}

async function saveTeam(album: Album) {
  savingAlbumId.value = album.id
  try {
    const updated = await albumApi.updateTeam(album.id, teamState[album.id])
    const idx = albums.value.findIndex(item => item.id === updated.id)
    if (idx !== -1) albums.value[idx] = updated
    syncTeamState()
  } finally {
    savingAlbumId.value = null
  }
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-8">
    <h1 class="text-2xl font-sans font-bold text-foreground">{{ t('settings.heading') }}</h1>

    <section class="card space-y-4">
      <h2 class="text-lg font-sans font-semibold text-foreground">{{ t('settings.createAlbum') }}</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.albumTitle') }}</label>
          <input v-model="newAlbum.title" class="input-field w-full" :placeholder="t('settings.albumTitlePlaceholder')" />
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.coverColor') }}</label>
          <input v-model="newAlbum.cover_color" type="color" class="input-field w-full h-10" />
        </div>
      </div>
      <div>
        <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.description') }}</label>
        <textarea v-model="newAlbum.description" class="input-field w-full h-20 resize-none" :placeholder="t('settings.descriptionPlaceholder')" />
      </div>
      <button @click="createAlbum" class="btn-primary text-sm w-full">{{ t('settings.createButton') }}</button>
    </section>

    <section>
      <h2 class="text-lg font-sans font-semibold text-foreground mb-4">{{ t('settings.albumTeams') }}</h2>

      <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
      <div v-else class="space-y-4">
        <div v-for="album in albums" :key="album.id" class="card space-y-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-sm font-medium text-foreground">{{ album.title }}</h3>
              <p class="text-xs text-muted-foreground mt-1">{{ album.description || t('settings.noDescription') }}</p>
            </div>
            <div class="text-xs text-muted-foreground">
              {{ t('settings.producerLabel', { name: album.producer?.display_name || t('settings.unassigned') }) }}
            </div>
          </div>

          <template v-if="appStore.currentUser?.id === album.producer_id">
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.masteringEngineerSelect') }}</label>
              <select v-model="teamState[album.id].mastering_engineer_id" class="input-field w-full">
                <option :value="null">{{ t('settings.noneOption') }}</option>
                <option v-for="user in users" :key="user.id" :value="user.id">
                  {{ user.display_name }}
                </option>
              </select>
            </div>

            <div>
              <div class="text-xs text-muted-foreground mb-2">{{ t('settings.participants') }}</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label v-for="user in users" :key="user.id" class="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    :checked="teamState[album.id].member_ids.includes(user.id)"
                    @change="toggleMember(album.id, user.id)"
                  />
                  <span>{{ user.display_name }}</span>
                </label>
              </div>
            </div>

            <button
              @click="saveTeam(album)"
              :disabled="savingAlbumId === album.id"
              class="btn-primary text-sm"
            >
              {{ savingAlbumId === album.id ? t('settings.saving') : t('settings.saveTeam') }}
            </button>
          </template>

          <template v-else>
            <div class="text-sm text-muted-foreground">
              {{ t('settings.readOnlyNotice') }}
            </div>
            <div class="text-sm text-foreground">
              {{ t('settings.masteringEngineerInfo', { name: album.mastering_engineer?.display_name || t('settings.unassigned') }) }}
            </div>
            <div class="text-xs text-muted-foreground">
              {{ t('settings.participantsInfo', { list: album.members.map(member => member.user.display_name).join(', ') || t('settings.noneParticipants') }) }}
            </div>
          </template>
        </div>
      </div>
    </section>
  </div>
</template>
