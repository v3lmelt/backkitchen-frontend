<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { userApi, albumApi } from '@/api'
import type { User, Album } from '@/types'

const users = ref<User[]>([])
const albums = ref<Album[]>([])
const loading = ref(true)

// New user form
const showNewUser = ref(false)
const newUser = ref({ username: '', display_name: '', role: 'reviewer', avatar_color: '#A855F7' })

// New album form
const showNewAlbum = ref(false)
const newAlbum = ref({ title: '', description: '', cover_color: '#A855F7' })

onMounted(async () => {
  try {
    const [u, a] = await Promise.all([userApi.list(), albumApi.list()])
    users.value = u
    albums.value = a
  } finally {
    loading.value = false
  }
})

async function createUser() {
  if (!newUser.value.username || !newUser.value.display_name) return
  const user = await userApi.create(newUser.value)
  users.value.push(user)
  showNewUser.value = false
  newUser.value = { username: '', display_name: '', role: 'reviewer', avatar_color: '#A855F7' }
}

async function createAlbum() {
  if (!newAlbum.value.title) return
  const album = await albumApi.create(newAlbum.value)
  albums.value.push(album)
  showNewAlbum.value = false
  newAlbum.value = { title: '', description: '', cover_color: '#A855F7' }
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-8">
    <h1 class="text-2xl font-mono font-bold text-foreground">Settings</h1>

    <!-- Team Members -->
    <section>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-mono font-semibold text-foreground">Team Members</h2>
        <button @click="showNewUser = !showNewUser" class="btn-primary text-sm">+ Add Member</button>
      </div>

      <!-- New User Form -->
      <div v-if="showNewUser" class="card space-y-3 mb-4 border-primary/50">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-muted-foreground mb-1">Username</label>
            <input v-model="newUser.username" class="input-field w-full" placeholder="username" />
          </div>
          <div>
            <label class="block text-xs text-muted-foreground mb-1">Display Name</label>
            <input v-model="newUser.display_name" class="input-field w-full" placeholder="Display Name" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-muted-foreground mb-1">Role</label>
            <select v-model="newUser.role" class="input-field w-full">
              <option value="producer">Producer</option>
              <option value="author">Author</option>
              <option value="reviewer">Reviewer</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-muted-foreground mb-1">Avatar Color</label>
            <input v-model="newUser.avatar_color" type="color" class="input-field w-full h-9" />
          </div>
        </div>
        <div class="flex gap-2">
          <button @click="createUser" class="btn-primary text-sm">Create</button>
          <button @click="showNewUser = false" class="btn-secondary text-sm">Cancel</button>
        </div>
      </div>

      <div class="bg-card border border-border rounded-none overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border text-left text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">
              <th class="px-4 py-3">User</th>
              <th class="px-4 py-3">Username</th>
              <th class="px-4 py-3">Role</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="border-b border-border last:border-0">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <div
                    class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    :style="{ backgroundColor: user.avatar_color }"
                  >
                    {{ user.display_name.charAt(0) }}
                  </div>
                  <span class="text-sm text-foreground">{{ user.display_name }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-muted-foreground">{{ user.username }}</td>
              <td class="px-4 py-3 text-sm text-muted-foreground capitalize">{{ user.role }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Albums -->
    <section>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-mono font-semibold text-foreground">Albums</h2>
        <button @click="showNewAlbum = !showNewAlbum" class="btn-primary text-sm">+ New Album</button>
      </div>

      <div v-if="showNewAlbum" class="card space-y-3 mb-4 border-primary/50">
        <div>
          <label class="block text-xs text-muted-foreground mb-1">Album Title</label>
          <input v-model="newAlbum.title" class="input-field w-full" placeholder="Album title" />
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">Description</label>
          <textarea v-model="newAlbum.description" class="input-field w-full h-20 resize-none" placeholder="Description..." />
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">Cover Color</label>
          <input v-model="newAlbum.cover_color" type="color" class="input-field w-16 h-9" />
        </div>
        <div class="flex gap-2">
          <button @click="createAlbum" class="btn-primary text-sm">Create</button>
          <button @click="showNewAlbum = false" class="btn-secondary text-sm">Cancel</button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div v-for="album in albums" :key="album.id" class="card">
          <div class="flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
              :style="{ backgroundColor: album.cover_color }"
            >
              {{ album.title.charAt(0) }}
            </div>
            <div>
              <h3 class="text-sm font-medium text-foreground">{{ album.title }}</h3>
              <p class="text-xs text-muted-foreground">{{ album.track_count }} tracks</p>
              <p v-if="album.description" class="text-xs text-muted-foreground mt-0.5">{{ album.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
