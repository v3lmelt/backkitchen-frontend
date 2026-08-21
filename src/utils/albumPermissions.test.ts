import { describe, expect, it } from 'vitest'

import type { Album, User } from '@/types'

import { albumViewerRoleBadgeClass, albumViewerRoleLabel } from './albumPermissions'

const t = (key: string) => key

function makeAlbum(overrides: Partial<Album> = {}): Album {
  return {
    id: 1,
    title: 'Album',
    producer_id: 10,
    mastering_engineer_id: 20,
    members: [],
    ...overrides,
  } as Album
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    role: 'member',
    is_admin: false,
    admin_role: 'none',
    ...overrides,
  } as User
}

function makeAdmin(overrides: Partial<User> = {}): User {
  return makeUser({ is_admin: true, admin_role: 'operator', ...overrides })
}

describe('albumViewerRoleLabel', () => {
  it('returns an empty label without a user', () => {
    expect(albumViewerRoleLabel(makeAlbum(), null, t)).toBe('')
  })

  it('labels the album producer as producer', () => {
    const album = makeAlbum({ viewer_is_album_manager: true })
    expect(albumViewerRoleLabel(album, makeUser({ id: 10 }), t)).toBe('roles.producer')
  })

  it('labels the mastering engineer as mastering engineer', () => {
    expect(albumViewerRoleLabel(makeAlbum(), makeUser({ id: 20 }), t)).toBe('roles.masteringEngineer')
  })

  it('labels the circle owner as circle owner even when manager-flagged', () => {
    const album = makeAlbum({ viewer_is_album_manager: true, viewer_circle_role: 'owner' })
    expect(albumViewerRoleLabel(album, makeUser({ id: 42 }), t)).toBe('roles.circleOwner')
  })

  it('labels a circle co-producer as co-producer', () => {
    const album = makeAlbum({ viewer_is_album_manager: true, viewer_circle_role: 'co_producer' })
    expect(albumViewerRoleLabel(album, makeUser({ id: 42 }), t)).toBe('roles.coProducer')
  })

  it('labels an operator admin as admin instead of co-producer', () => {
    const album = makeAlbum({ viewer_is_album_manager: true })
    expect(albumViewerRoleLabel(album, makeAdmin({ id: 99 }), t)).toBe('roles.admin')
  })

  it('prefers the genuine circle role over the admin role', () => {
    const album = makeAlbum({ viewer_is_album_manager: true, viewer_circle_role: 'co_producer' })
    expect(albumViewerRoleLabel(album, makeAdmin({ id: 42 }), t)).toBe('roles.coProducer')
  })

  it('falls back to co-producer for manager-flagged albums without a circle role', () => {
    const album = makeAlbum({ viewer_is_album_manager: true })
    expect(albumViewerRoleLabel(album, makeUser({ id: 42 }), t)).toBe('roles.coProducer')
  })

  it('labels everyone else as member', () => {
    expect(albumViewerRoleLabel(makeAlbum(), makeUser({ id: 42 }), t)).toBe('roles.member')
  })
})

describe('albumViewerRoleBadgeClass', () => {
  it('uses warning colors for the producer and circle owner', () => {
    expect(albumViewerRoleBadgeClass(makeAlbum(), makeUser({ id: 10 }))).toBe('bg-warning-bg text-warning')
    const ownerAlbum = makeAlbum({ viewer_circle_role: 'owner' })
    expect(albumViewerRoleBadgeClass(ownerAlbum, makeUser({ id: 42 }))).toBe('bg-warning-bg text-warning')
  })

  it('uses info colors for the mastering engineer and admins', () => {
    expect(albumViewerRoleBadgeClass(makeAlbum(), makeUser({ id: 20 }))).toBe('bg-info-bg text-info')
    const managedAlbum = makeAlbum({ viewer_is_album_manager: true })
    expect(albumViewerRoleBadgeClass(managedAlbum, makeAdmin({ id: 99 }))).toBe('bg-info-bg text-info')
  })

  it('uses success colors for co-producers and manager-flagged viewers', () => {
    const coProducerAlbum = makeAlbum({ viewer_is_album_manager: true, viewer_circle_role: 'co_producer' })
    expect(albumViewerRoleBadgeClass(coProducerAlbum, makeUser({ id: 42 }))).toBe('bg-success-bg text-success')
    const legacyAlbum = makeAlbum({ viewer_is_album_manager: true })
    expect(albumViewerRoleBadgeClass(legacyAlbum, makeUser({ id: 42 }))).toBe('bg-success-bg text-success')
  })

  it('uses neutral colors for plain members and guests', () => {
    expect(albumViewerRoleBadgeClass(makeAlbum(), makeUser({ id: 42 }))).toBe('bg-border text-foreground')
    expect(albumViewerRoleBadgeClass(makeAlbum(), null)).toBe('bg-border text-foreground')
  })
})
