import { createRouter, createWebHistory } from 'vue-router'

const PUBLIC_ROUTES = ['/login', '/register', '/verify-email']
const TOKEN_KEY = 'backkitchen_token'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
    },
    {
      path: '/verify-email',
      name: 'verify-email',
      component: () => import('@/views/VerifyEmailView.vue'),
    },
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
      path: '/tracks/:id/producer',
      name: 'producer-decision',
      component: () => import('@/views/ProducerDecisionView.vue'),
    },
    {
      path: '/tracks/:id/mastering',
      name: 'mastering-review',
      component: () => import('@/views/MasteringReviewView.vue'),
    },
    {
      path: '/tracks/:id/final-review',
      name: 'final-review',
      component: () => import('@/views/FinalReviewView.vue'),
    },
    {
      path: '/tracks/:id/step/:stepId',
      name: 'workflow-step',
      component: () => import('@/views/WorkflowStepView.vue'),
    },
    {
      path: '/upload',
      name: 'upload',
      component: () => import('@/views/UploadTrackView.vue'),
    },
    {
      path: '/settings',
      redirect: '/albums',
    },
    {
      path: '/albums',
      name: 'albums',
      component: () => import('@/views/AlbumsView.vue'),
    },
    {
      path: '/albums/new',
      name: 'album-new',
      component: () => import('@/views/AlbumNewView.vue'),
    },
    {
      path: '/albums/:albumId/settings',
      name: 'album-settings',
      component: () => import('@/views/AlbumSettingsView.vue'),
    },
    {
      path: '/circles',
      name: 'circles',
      component: () => import('@/views/CirclesView.vue'),
    },
    {
      path: '/circles/new',
      name: 'circle-new',
      component: () => import('@/views/CircleNewView.vue'),
    },
    {
      path: '/circles/:circleId',
      name: 'circle-detail',
      component: () => import('@/views/CircleDetailView.vue'),
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
    },
  ],
})

router.beforeEach((to) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (to.path === '/verify-email') return true
  if (PUBLIC_ROUTES.includes(to.path)) {
    if (token) return '/'
    return true
  }
  if (!token) return '/login'
  return true
})

export default router
