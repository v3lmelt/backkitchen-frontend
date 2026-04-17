export const CHANGELOG_SEEN_KEY = 'backkitchen_changelog_seen'
export const CHANGELOG_SEEN_EVENT = 'backkitchen:changelog-seen'

export type ChangelogLocale = 'zh-CN' | 'en'
export type LocalizedText = Record<ChangelogLocale, string>

export interface ChangelogItem {
  title: LocalizedText
  description?: LocalizedText
}

export interface ChangelogSection {
  heading: LocalizedText
  items: ChangelogItem[]
}

export interface ChangelogEntry {
  version: string
  date: string
  headline: LocalizedText
  summary: LocalizedText
  sections: ChangelogSection[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-04-17',
    headline: {
      'zh-CN': '评论协作、后台治理与母带工作流大更新',
      en: 'Collaboration, admin governance, and mastering workflow overhaul',
    },
    summary: {
      'zh-CN':
        '本次更新跨越了评审、母带、后台、下载与专辑导出五个大方向，共计 45 个前端 commit / 21 个后端 commit。重点打磨了评论内的问题与附件引用能力、后台治理能力、母带阶段的沟通面貌，以及下载与危险操作的安全性。',
      en:
        'This release spans review, mastering, admin, downloads, and album export — 45 frontend commits and 21 backend commits in total. Key investments: issue/attachment references in comments, an expanded admin console, a cleaner mastering stage, and safer downloads and destructive actions.',
    },
    sections: [
      {
        heading: {
          'zh-CN': '评论与问题协作',
          en: 'Comments & Issue Collaboration',
        },
        items: [
          {
            title: {
              'zh-CN': '评论内支持 @issue:N 引用，基于曲目内本地编号',
              en: 'Reference issues in comments with @issue:N, resolved against per-track local numbers',
            },
            description: {
              'zh-CN':
                '每个问题在所属曲目内分配一个独立的本地编号（local_number），评论中的 @issue:1 会定位到当前曲目的 1 号问题，而不再依赖全局 ID。跨曲目引用不会再互相干扰。',
              en:
                'Each issue now has its own local number within its track. Writing @issue:1 in a comment resolves to issue #1 of the current track instead of a global ID, so references stay correct across tracks.',
            },
          },
          {
            title: {
              'zh-CN': '评论附件支持带索引的时间戳语法',
              en: 'Indexed attachment timestamp syntax',
            },
            description: {
              'zh-CN':
                '当一条评论包含多个音频附件时，可以用 [1]@1:23、[2]@0:45 这样的写法精确指向某个附件的某个时间点，便于评审、母带沟通中准确引用对话中的片段。',
              en:
                'When a comment has multiple audio attachments, you can now point at a specific one with syntax like [1]@1:23 or [2]@0:45, making references in peer review and mastering chats unambiguous.',
            },
          },
          {
            title: {
              'zh-CN': '问题抽屉新增波形预览与内嵌播放控制',
              en: 'Issue drawer gains waveform preview and inline playback controls',
            },
            description: {
              'zh-CN':
                '在曲目详情的问题抽屉里可以直接看到问题所指向的波形片段，并在不离开页面的情况下试听、跳转、定位时间点。底层预览逻辑被抽取为可复用的 composable。',
              en:
                'The issue drawer on the track detail page now embeds a waveform preview and inline playback controls, so you can listen without navigating away. The underlying preview logic has been extracted into a reusable composable.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '后台治理（Admin）',
          en: 'Admin Governance',
        },
        items: [
          {
            title: {
              'zh-CN': '后台控制台新增治理与审计能力',
              en: 'Admin console gains governance and audit controls',
            },
            description: {
              'zh-CN':
                '管理员现在拥有一组完整的治理工作流：账户状态、社团 / 专辑治理、审计记录等。后端同步提供对应的 API 与数据模型，并在 SQLite 下对迁移脚本进行了专项加固。',
              en:
                'Administrators now have a dedicated suite of governance workflows covering account status, circle / album governance, and audit trails. The backend exposes matching APIs and data models, with migrations specifically hardened for SQLite.',
            },
          },
          {
            title: {
              'zh-CN': '后台控制台完整本地化',
              en: 'Admin console fully localized',
            },
            description: {
              'zh-CN': '后台控制台所有文本接入 vue-i18n，与其余界面一致支持中英文切换。',
              en: 'Every string in the admin console is now routed through vue-i18n and follows the same zh-CN / en toggle as the rest of the app.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '工作流与仪表盘',
          en: 'Workflow & Dashboard',
        },
        items: [
          {
            title: {
              'zh-CN': '专辑工作流搭建效率提升',
              en: 'Album workflow setup is faster',
            },
            description: {
              'zh-CN':
                '后端精简了专辑初始化 API，前端同步优化了新建专辑的交互路径，减少了设置一个新专辑所需的步骤与来回切换。',
              en:
                'The backend streamlined the album setup API, and the frontend follows through with a shorter creation flow. Fewer clicks and fewer context switches to get an album ready.',
            },
          },
          {
            title: {
              'zh-CN': '经典工作流变体的一致性修复',
              en: 'Consistency fixes across classic workflow variants',
            },
            description: {
              'zh-CN':
                '针对同行评审→主催审批→母带→终审的多种变体进行了行为对齐，减少了在不同工作流模板间切换时遇到的边界情况。',
              en:
                'Behavior across the peer-review → producer-gate → mastering → final-review variants has been aligned, removing edge cases users hit when switching templates.',
            },
          },
          {
            title: {
              'zh-CN': '工作步骤完成后的导航更合理',
              en: 'Smarter navigation after completing a workflow step',
            },
            description: {
              'zh-CN': '完成一个工作步骤后会自动回到曲目详情页，而不是停留在已经结束的步骤工作台上。',
              en: 'Completing a workflow step now returns you to the track detail view instead of leaving you on a finished step workspace.',
            },
          },
          {
            title: {
              'zh-CN': '工作台抽屉体验优化，问题可内联处理',
              en: 'Workflow workspace drawer: inline issue handling',
            },
            description: {
              'zh-CN': '工作台抽屉内可以直接创建 / 回复 / 处理问题，无需频繁跳转到独立的问题详情页。',
              en: 'You can now create, reply to, and resolve issues directly in the workspace drawer instead of jumping out to the standalone issue page.',
            },
          },
          {
            title: {
              'zh-CN': '仪表盘显式支持被拒曲目筛选',
              en: 'Dashboard supports explicit rejected-track filtering',
            },
            description: {
              'zh-CN': '被拒曲目不再混入主列表，而是独立加载、独立筛选，仪表盘的信号更干净。',
              en: 'Rejected tracks are loaded and filtered separately instead of mixing into the main list, so the dashboard signal stays clean.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '母带阶段打磨',
          en: 'Mastering Stage Polish',
        },
        items: [
          {
            title: {
              'zh-CN': '曲目详情中的母带历史条目更精炼，可见性修复',
              en: 'Refined mastering history entry on track detail',
            },
            description: {
              'zh-CN':
                '母带侧边栏在曲目详情页的可见性问题已修复；母带历史条目本身也进行了视觉精炼。顶部的"母带沟通"大卡片被移除，改为更轻量的入口。',
              en:
                'Fixed a bug where the mastering sidebar could be hidden on the track detail page; the mastering history entry has also been visually refined. The bulky "mastering communication" hero card has been removed in favor of a lighter entry point.',
            },
          },
          {
            title: {
              'zh-CN': '母带面包屑与母带沟通可见性提升',
              en: 'Fixed mastering breadcrumbs, improved mastering chat visibility',
            },
            description: {
              'zh-CN': '顶部面包屑在母带相关路由下的标签被修正；母带沟通入口的视觉权重调整得更合理。',
              en: 'Top breadcrumbs now read correctly on mastering routes, and the mastering communication entry has a more sensible visual weight.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '同行评审',
          en: 'Peer Review',
        },
        items: [
          {
            title: {
              'zh-CN': '同行评审检查清单成为显式阻断项',
              en: 'Peer-review checklist is now an explicit blocker',
            },
            description: {
              'zh-CN':
                '在检查清单全部勾选之前，无法提交同行评审结论。这项约束以前只是建议，现在变成硬性门槛，避免"随手过评"。',
              en:
                'You can no longer submit a peer-review verdict while checklist items remain unchecked. What used to be a soft hint is now a hard gate, preventing accidental sign-offs.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '导出与目录号（Catalog Number）',
          en: 'Export & Catalog Number',
        },
        items: [
          {
            title: {
              'zh-CN': '导出音频时写入专辑目录号',
              en: 'Album catalog number embedded into exported audio',
            },
            description: {
              'zh-CN':
                '专辑的目录号（catalog number）会被写入导出音频文件的元数据中，便于交付给压盘 / 发行端使用，也便于用户本地归档。',
              en:
                'The album catalog number is now written into the exported audio files\' metadata, making handoff to pressing / distribution easier and improving local archiving.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '下载与音频缓存',
          en: 'Downloads & Audio Cache',
        },
        items: [
          {
            title: {
              'zh-CN': '下载统一走音频缓存，持久化存储按字节设上限',
              en: 'Downloads routed through the audio cache with a byte-capped persistent store',
            },
            description: {
              'zh-CN':
                '所有音频下载不再重复从网络拉取，而是走本地缓存层；持久化缓存大小按字节封顶，避免长期使用后磁盘占用失控。',
              en:
                'Audio downloads now go through a local cache layer instead of hitting the network repeatedly, and the persistent cache is capped by byte size so long-term usage won\'t blow up disk footprint.',
            },
          },
          {
            title: {
              'zh-CN': '附件音频走受保护下载路由',
              en: 'Attachment audio is served from protected download routes',
            },
            description: {
              'zh-CN': '评论内的音频附件现在通过鉴权的下载路由，避免了未授权访问；同时修复了下载错误的处理路径。',
              en: 'Comment audio attachments are now served via an auth-protected download route, and download error handling has been fixed end-to-end.',
            },
          },
          {
            title: {
              'zh-CN': '评论内附件音频排序稳定化',
              en: 'Comment attachment audio ordering stabilized',
            },
            description: {
              'zh-CN': '用于附件时间戳语法 [N] 的索引现在有稳定的排序，不会因为上传顺序或服务端刷新而漂移。',
              en: 'The index used by the [N] attachment-timestamp syntax is now ordered deterministically, so it won\'t drift across uploads or server refreshes.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '安全性与反馈',
          en: 'Safety & Feedback',
        },
        items: [
          {
            title: {
              'zh-CN': '破坏性操作全面加固',
              en: 'Destructive flows hardened end-to-end',
            },
            description: {
              'zh-CN':
                '账号注销、母带交付确认、曲目拒绝等关键操作的二次确认、权限校验与失败反馈都进行了统一打磨；后端对交付确认增加了守卫条件。',
              en:
                'Account deletion, mastering-delivery confirmation, track rejection, and similar critical flows have been given consistent confirmation dialogs, permission checks, and error feedback; the backend adds new guard conditions on delivery confirmation.',
            },
          },
          {
            title: {
              'zh-CN': '前端用户反馈状态统一',
              en: 'Unified frontend user-feedback states',
            },
            description: {
              'zh-CN':
                '加载、空状态、错误提示和无障碍支持在多个视图下得到统一；注册 / 上传等边界场景的校验也更严格。',
              en:
                'Loading, empty, and error states (plus accessibility) have been aligned across views, and validation is tighter on edge cases like registration and upload.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '质量与测试',
          en: 'Quality & Tests',
        },
        items: [
          {
            title: {
              'zh-CN': '前后端测试覆盖全面扩展',
              en: 'Expanded frontend and backend test coverage',
            },
            description: {
              'zh-CN':
                '前端的工作流视图、设置页等关键路径新增了覆盖；后端对工作流状态机与基础设施层也补齐了集成测试，并修正了开发套件中 R2 问题音频重定向的桩实现。',
              en:
                'Key paths in workflow views and settings now have frontend test coverage, and the backend adds integration tests around the workflow state machine and infra layer. The dev suite\'s R2 issue-audio redirect stub has been corrected.',
            },
          },
        ],
      },
    ],
  },
]

export const LATEST_CHANGELOG_VERSION = CHANGELOG[0]?.version ?? ''

export function pickLocalized(text: LocalizedText, locale: string): string {
  return locale === 'en' ? text.en : text['zh-CN']
}
