import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/tracks/:id',
      name: 'track-detail',
      component: () => import('@/views/TrackDetailView.vue'),
    },
    {
      path: '/tracks/:id/review',
      name: 'peer-review',
      component: () => import('@/views/PeerReviewView.vue'),
    },
    {
      path: '/issues/:id',
      name: 'issue-detail',
      component: () => import('@/views/IssueDetailView.vue'),
    },
    {
      path: '/tracks/:id/revision',
      name: 'author-revision',
      component: () => import('@/views/AuthorRevisionView.vue'),
    },
    {
      path: '/tracks/:id/decision',
      name: 'producer-decision',
      component: () => import('@/views/ProducerDecisionView.vue'),
    },
    {
      path: '/upload',
      name: 'upload',
      component: () => import('@/views/UploadTrackView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
  ],
})

export default router
