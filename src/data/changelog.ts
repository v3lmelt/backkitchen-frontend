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
    version: '0.1.1',
    date: '2026-04-17',
    headline: {
      'zh-CN': '本版本更新概览',
      en: 'Release overview',
    },
    summary: {
      'zh-CN':
        '本次更新聚焦专辑封面上传体验，新增 20 MB 专用上限与更清晰的上传提示，且不影响其他图片上传场景。以下为本版本主要变更。',
      en:
        'This release focuses on the album cover upload experience, adding a dedicated 20 MB limit and clearer upload feedback without affecting other image upload flows. The key changes in this release are listed below.',
    },
    sections: [
      {
        heading: {
          'zh-CN': '专辑与上传',
          en: 'Albums & Uploads',
        },
        items: [
          {
            title: {
              'zh-CN': '专辑封面单独支持最多 20 MB 上传',
              en: 'Album covers now support uploads up to 20 MB',
            },
            description: {
              'zh-CN':
                '专辑封面上传改为使用独立的 20 MB 限制，不再复用系统其他图片附件的 10 MB 通用限制；头像、社团 Logo、问题与评论图片等其他上传场景保持原有上限不变。',
              en:
                'Album cover uploads now use a dedicated 20 MB limit instead of the shared 10 MB image limit used elsewhere. Other upload flows such as avatars, circle logos, and issue/comment images retain their existing limits.',
            },
          },
          {
            title: {
              'zh-CN': '优化专辑封面上传校验与报错提示',
              en: 'Improved album cover validation and error feedback',
            },
            description: {
              'zh-CN':
                '在新建专辑页与专辑设置页中，封面选择阶段会提前校验格式与大小，并对常见上传失败原因给出更明确的提示；若专辑已创建但封面上传失败，也会明确说明后续需要在设置页重新上传。',
              en:
                'The new album and album settings pages now validate cover format and size before upload and provide clearer messages for common upload failures. If album creation succeeds but the cover upload fails, the UI now explicitly tells the user to re-upload the cover in album settings.',
            },
          },
        ],
      },
    ],
  },
  {
    version: '0.0.1',
    date: '2026-04-17',
    headline: {
      'zh-CN': '本版本更新概览',
      en: 'Release overview',
    },
    summary: {
      'zh-CN':
        '本次更新涵盖评论协作、后台管理、工作流与仪表盘、母带阶段、专辑导出、下载与播放以及安全性等多个方面，包含若干项功能新增、体验优化与问题修复。以下为本版本主要变更。',
      en:
        'This release covers comment collaboration, admin management, workflow and dashboard, the mastering stage, album export, downloads and playback, and safety, comprising a number of new features, experience improvements, and bug fixes. The key changes in this release are listed below.',
    },
    sections: [
      {
        heading: {
          'zh-CN': '评论与协作',
          en: 'Comments & Collaboration',
        },
        items: [
          {
            title: {
              'zh-CN': '优化讨论区加载表现',
              en: 'Improved discussion panel loading',
            },
            description: {
              'zh-CN':
                '曲目详情页的讨论区与母带讨论区默认仅加载最新 20 条，并在列表顶部提供「加载更早的讨论」按钮按需回溯更早内容，避免一次性拉取全部历史影响响应速度。母带沟通侧边栏（聊天室）保持原有的完整加载行为不变。',
              en:
                'The discussion panel on the track detail page and the mastering discussion panel now load only the 20 most recent entries by default, with a "Load earlier discussions" button at the top of the list for retrieving older content on demand. This avoids fetching the full history upfront, which could affect responsiveness. The mastering communication sidebar (chat) retains its existing full-load behavior.',
            },
          },
          {
            title: {
              'zh-CN': '新增评论中引用问题的能力',
              en: 'Added the ability to reference issues within comments',
            },
            description: {
              'zh-CN':
                '在评论中输入 @issue:1 即可引用当前曲目的 1 号问题。问题编号以曲目为单位独立计数，不跨曲目共享，每首曲目均从 1 号起编。',
              en:
                'Entering @issue:1 in a comment references issue #1 of the current track. Issue numbering is scoped to each track rather than shared globally, with every track starting from #1.',
            },
          },
          {
            title: {
              'zh-CN': '新增带索引的附件时间戳语法',
              en: 'Added indexed attachment timestamp syntax',
            },
            description: {
              'zh-CN':
                '当评论包含多个音频附件时，可使用 [1]@1:23、[2]@0:45 的格式指向特定附件的特定时间点，便于在评审与沟通中精确定位音频位置。',
              en:
                'When a comment contains multiple audio attachments, references in the form [1]@1:23 or [2]@0:45 may be used to point at a specific moment within a specific attachment, enabling precise audio referencing during review and discussion.',
            },
          },
          {
            title: {
              'zh-CN': '优化问题抽屉交互',
              en: 'Improved issue drawer interaction',
            },
            description: {
              'zh-CN':
                '问题抽屉内新增内嵌波形预览与播放控件，无需离开当前页面即可试听并定位时间点。',
              en:
                'An inline waveform preview and playback controls have been added to the issue drawer, allowing audition and seeking without leaving the current page.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '后台管理',
          en: 'Admin Console',
        },
        items: [
          {
            title: {
              'zh-CN': '新增后台治理与审计能力',
              en: 'Added governance and audit capabilities to the admin console',
            },
            description: {
              'zh-CN':
                '管理员可在后台控制台中集中处理账号状态、社团与专辑治理等事务，并可回溯关键操作的审计记录。',
              en:
                'Administrators can now centrally manage account status as well as circle and album governance within the admin console, and review an audit trail of key actions.',
            },
          },
          {
            title: {
              'zh-CN': '后台控制台完成全量国际化',
              en: 'Admin console has been fully internationalized',
            },
            description: {
              'zh-CN': '后台控制台支持中英双语切换，与系统其他界面保持一致。',
              en: 'The admin console now supports switching between Chinese and English, consistent with the rest of the system.',
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
              'zh-CN': '优化专辑创建流程',
              en: 'Improved the album creation flow',
            },
            description: {
              'zh-CN': '新建专辑所需的操作步骤与页面跳转得到进一步精简。',
              en: 'The number of steps and page transitions required to create a new album has been further reduced.',
            },
          },
          {
            title: {
              'zh-CN': '优化工作流模板一致性',
              en: 'Improved consistency across workflow templates',
            },
            description: {
              'zh-CN':
                '对多种同行评审 → 主催审批 → 母带 → 终审的工作流变体进行行为对齐，降低在不同模板间切换时的体验差异。',
              en:
                'Behavior across multiple peer-review → producer-gate → mastering → final-review workflow variants has been aligned, reducing experience discrepancies when switching between templates.',
            },
          },
          {
            title: {
              'zh-CN': '优化工作流步骤完成后的跳转逻辑',
              en: 'Improved navigation after completing a workflow step',
            },
            description: {
              'zh-CN': '完成某一步骤后将自动返回曲目详情页，不再停留在已结束的步骤工作台。',
              en: 'Upon completing a step, the view now automatically returns to the track detail page rather than remaining on the finished step workspace.',
            },
          },
          {
            title: {
              'zh-CN': '优化工作台抽屉体验',
              en: 'Improved the workspace drawer experience',
            },
            description: {
              'zh-CN': '问题的创建、回复与处理可直接在抽屉内完成，无需跳转至独立的问题详情页。',
              en: 'Issue creation, reply, and resolution can now be performed directly within the drawer, without navigating to the standalone issue detail page.',
            },
          },
          {
            title: {
              'zh-CN': '优化仪表盘筛选',
              en: 'Improved dashboard filtering',
            },
            description: {
              'zh-CN': '被拒曲目不再混入主列表，支持独立加载与筛选。',
              en: 'Rejected tracks are no longer mixed into the main list and can be loaded and filtered independently.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '母带阶段',
          en: 'Mastering Stage',
        },
        items: [
          {
            title: {
              'zh-CN': '修复母带侧边栏显示问题，精简母带历史条目',
              en: 'Fixed mastering sidebar visibility and simplified history entries',
            },
            description: {
              'zh-CN':
                '修复在特定条件下曲目详情页无法显示母带侧边栏的问题，同时对母带历史条目的视觉呈现进行了精简。',
              en:
                'Fixed an issue where the mastering sidebar could fail to display on the track detail page, and streamlined the visual presentation of mastering history entries.',
            },
          },
          {
            title: {
              'zh-CN': '修复母带相关页面的面包屑与入口',
              en: 'Fixed breadcrumbs and entry point on mastering pages',
            },
            description: {
              'zh-CN': '修复母带相关页面顶部面包屑的标签显示，调整母带沟通入口的视觉权重。',
              en: 'Corrected breadcrumb labels on mastering-related pages and adjusted the visual weight of the mastering communication entry point.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '专辑导出',
          en: 'Album Export',
        },
        items: [
          {
            title: {
              'zh-CN': '导出音频自动写入专辑目录号',
              en: 'Exported audio automatically embeds the album catalog number',
            },
            description: {
              'zh-CN':
                '专辑目录号（Catalog Number）将自动写入导出音频文件的元数据，便于交付压盘与发行环节使用，同时利于本地归档。',
              en:
                'The album catalog number is now automatically written into the metadata of exported audio files, supporting handoff to pressing and distribution as well as local archiving.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '下载与播放',
          en: 'Downloads & Playback',
        },
        items: [
          {
            title: {
              'zh-CN': '新增音频缓存机制',
              en: 'Added an audio caching mechanism',
            },
            description: {
              'zh-CN':
                '对已播放或已下载的音频进行本地缓存，重复访问时不再重新发起网络请求，响应速度有所提升；缓存容量设有上限，不会无限制占用本地存储。',
              en:
                'Previously played or downloaded audio is now cached locally, so repeated access no longer issues new network requests and responsiveness improves. The cache has an upper size limit and will not consume local storage without bound.',
            },
          },
          {
            title: {
              'zh-CN': '评论内音频附件改由受保护的下载路由提供',
              en: 'Audio attachments in comments now served via a protected download route',
            },
            description: {
              'zh-CN': '评论内的音频附件仅登录且具备相应权限的用户可访问。',
              en: 'Audio attachments within comments are now accessible only to authenticated users with the appropriate permissions.',
            },
          },
          {
            title: {
              'zh-CN': '评论内音频附件的编号顺序稳定化',
              en: 'Stabilized audio attachment ordering within comments',
            },
            description: {
              'zh-CN': '评论内附件的编号顺序已稳定化，[1]、[2] 等时间戳引用不再因上传顺序或页面刷新而发生偏移。',
              en: 'The numbering order of attachments within comments is now stable, and references such as [1] or [2] in timestamp syntax will no longer shift due to upload order or page refreshes.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '安全性',
          en: 'Safety',
        },
        items: [
          {
            title: {
              'zh-CN': '关键不可逆操作新增二次确认',
              en: 'Added confirmation prompts for critical irreversible actions',
            },
            description: {
              'zh-CN':
                '对关键不可逆操作（包括账号注销、母带交付确认、曲目拒绝等）增加了二次确认流程。',
              en:
                'Confirmation dialogs have been added to critical irreversible actions, including account deletion, mastering delivery confirmation, and track rejection.',
            },
          },
          {
            title: {
              'zh-CN': '统一加载、空状态与错误提示',
              en: 'Unified loading, empty, and error states',
            },
            description: {
              'zh-CN':
                '对各视图下的加载态、空状态与错误提示进行了统一；注册、上传等场景的输入校验也进一步收紧。',
              en:
                'Loading, empty, and error states have been unified across views; input validation for scenarios such as registration and upload has also been tightened.',
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
