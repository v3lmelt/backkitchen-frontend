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
    version: '0.0.1',
    date: '2026-04-17',
    headline: {
      'zh-CN': '评审、母带、后台一次性升级',
      en: 'Review, mastering, and admin — all get a lift',
    },
    summary: {
      'zh-CN':
        '这一版围绕"在评论里把话说清楚"和"让评审/母带/后台的每一步都更顺手"展开：你可以在评论里直接 @ 某个问题、指向附件里的某个时间点；问题抽屉现在能直接试听；同行评审需要先完成清单才能提交；导出音频会自动带上专辑目录号；危险操作（如销号、交付确认）全部加了保护。',
      en:
        "This release is about saying things precisely in comments and making every step of review, mastering, and admin feel more polished. You can now @mention an issue in a comment and point at a specific moment inside a specific attachment; the issue drawer plays audio in place; the peer-review checklist must be completed before you can submit; exported audio carries the album's catalog number automatically; and destructive actions (account deletion, delivery confirmation, and the like) are all better protected.",
    },
    sections: [
      {
        heading: {
          'zh-CN': '评论里也能把话说清楚',
          en: 'Say it precisely — right inside a comment',
        },
        items: [
          {
            title: {
              'zh-CN': '评论里直接 @ 某个问题：@issue:1',
              en: 'Mention an issue in a comment: @issue:1',
            },
            description: {
              'zh-CN':
                '现在你可以在评论里写 @issue:1、@issue:2 来引用当前曲目里的问题。编号是"这首曲目内"的顺序号，不是跨曲目的大编号，看起来和对齐起来都更自然——每首曲目都从 1 号开始数。',
              en:
                'You can now write @issue:1 or @issue:2 in any comment to reference an issue on the current track. The number is the order within this track (not a global ID), so each track starts counting from #1 — it reads like a natural conversation.',
            },
          },
          {
            title: {
              'zh-CN': '精确指向某个附件的某个时间点：[2]@0:45',
              en: 'Point at a specific moment in a specific attachment: [2]@0:45',
            },
            description: {
              'zh-CN':
                '当一条评论里带了多个音频附件时，现在可以用 [1]@1:23、[2]@0:45 这样的写法，明确指"第 2 个附件的 45 秒处"。同行评审和母带沟通里的"你听听这里"再也不会有歧义。',
              en:
                "When a comment has multiple audio attachments, you can write [1]@1:23 or [2]@0:45 to point at \"attachment 2 at 0:45\". No more ambiguity when someone says \"listen here\" in peer review or mastering chats.",
            },
          },
          {
            title: {
              'zh-CN': '问题抽屉里直接听',
              en: 'Listen to an issue without leaving the page',
            },
            description: {
              'zh-CN':
                '点开曲目详情的问题抽屉，就能直接看到这个问题指向的波形片段，并且能原地播放、跳转、定位时间点。不用再点进问题详情页再点回来。',
              en:
                'Open the issue drawer on the track detail page and you see the waveform segment the issue points to, with playback controls right there. No more hopping to the issue detail page and back.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '后台管理（Admin）',
          en: 'Admin Console',
        },
        items: [
          {
            title: {
              'zh-CN': '后台控制台：账号、社团、专辑、审计一站式',
              en: 'One place to manage accounts, circles, albums, and audit trails',
            },
            description: {
              'zh-CN':
                '管理员现在在后台控制台里能完整地处理账号状态、社团和专辑的治理工作，并且能回溯关键操作的审计记录。之前需要绕远路的操作现在都能直接做。',
              en:
                'Admins now have a single console to manage account status, govern circles and albums, and review an audit trail of key actions — work that used to require workarounds now lives in one place.',
            },
          },
          {
            title: {
              'zh-CN': '后台控制台支持中英文切换',
              en: 'Admin console speaks both Chinese and English',
            },
            description: {
              'zh-CN': '后台控制台的每一个文案都接入了中英文切换，和系统其他地方保持一致。',
              en: 'Every label in the admin console is now translated, matching the zh-CN / en toggle used elsewhere.',
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '工作流与仪表盘更顺手',
          en: 'Smoother workflow and dashboard',
        },
        items: [
          {
            title: {
              'zh-CN': '新建专辑只需更少点击',
              en: 'Fewer clicks to spin up a new album',
            },
            description: {
              'zh-CN': '创建专辑的流程被拉直了一遍，从头走到尾需要的步骤和来回切换都变少了。',
              en: 'The create-album flow has been straightened out — fewer steps, fewer context switches from start to finish.',
            },
          },
          {
            title: {
              'zh-CN': '各种工作流模板行为更一致',
              en: 'Workflow templates behave more consistently',
            },
            description: {
              'zh-CN':
                '不管你用的是哪种同行评审 → 主催审批 → 母带 → 终审的变体，细节上的行为都对齐了，切换模板时遇到的奇怪边界情况少了很多。',
              en:
                'Whichever peer-review → producer-gate → mastering → final-review variant you use, the fine-grained behavior is now aligned — far fewer surprises when switching templates.',
            },
          },
          {
            title: {
              'zh-CN': '完成一个步骤后自动回到曲目页',
              en: 'Complete a step, land back on the track',
            },
            description: {
              'zh-CN': '完成一个工作步骤后会自动回到曲目详情页，而不是停留在已经结束的工作台上发呆。',
              en: 'Finishing a workflow step now takes you back to the track detail view instead of leaving you on an already-finished workspace.',
            },
          },
          {
            title: {
              'zh-CN': '工作台抽屉里直接处理问题',
              en: 'Handle issues right in the workspace drawer',
            },
            description: {
              'zh-CN': '工作台抽屉里就能直接创建、回复、解决问题，不用再频繁跳到独立的问题详情页。',
              en: 'Create, reply to, and resolve issues directly in the workspace drawer — no more jumping out to the standalone issue page.',
            },
          },
          {
            title: {
              'zh-CN': '仪表盘里，被拒曲目单独一栏',
              en: 'Rejected tracks get their own lane on the dashboard',
            },
            description: {
              'zh-CN': '被拒曲目不再混进主列表干扰视线，而是单独加载和筛选，仪表盘看起来更清爽。',
              en: 'Rejected tracks are loaded and filtered separately instead of cluttering the main list — the dashboard reads much cleaner.',
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
              'zh-CN': '母带侧边栏显示修复，历史条目更精炼',
              en: 'Mastering sidebar visibility fixed, history entry refined',
            },
            description: {
              'zh-CN':
                '之前在某些情况下曲目详情页看不到母带侧边栏，这次修好了；母带历史的条目本身也做了视觉上的精简，信息更清楚。',
              en:
                "A case where the mastering sidebar wouldn't show up on the track detail page is fixed, and the mastering history entries themselves have been visually simplified so the information reads more clearly.",
            },
          },
          {
            title: {
              'zh-CN': '母带路由下的面包屑和入口修正',
              en: 'Cleaner mastering breadcrumbs and entry point',
            },
            description: {
              'zh-CN': '进入母带相关页面时，顶部的面包屑现在会显示正确的路径，母带沟通的入口视觉权重也调得更合理。',
              en: 'Top breadcrumbs now show the correct trail on mastering routes, and the mastering chat entry point has a more sensible visual weight.',
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
              'zh-CN': '清单必须打勾才能提交评审',
              en: "Checklist must be complete before you can submit",
            },
            description: {
              'zh-CN':
                '同行评审的检查清单以前是"建议"，现在变成硬性要求——必须全部勾选完才能提交结论。减少"随手过评"，让评审更扎实。',
              en:
                'The peer-review checklist used to be a soft reminder. Now every item must be checked before you can submit your verdict — no more accidental sign-offs.',
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
              'zh-CN': '导出的音频会自动带上专辑目录号',
              en: 'Exported audio carries the album catalog number',
            },
            description: {
              'zh-CN':
                '专辑的目录号（catalog number）会自动写入导出音频文件的元数据里。交给压盘或发行时不用再手动补，本地归档时也更清楚这张碟是哪一个版本。',
              en:
                "The album's catalog number is now written into each exported file's metadata automatically. You won't have to patch it in by hand before handing off to pressing or distribution, and your local archive stays properly labeled.",
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
              'zh-CN': '听过的音频不会重复下载，本地缓存有上限',
              en: "Already-played audio won't redownload; the local cache has a hard cap",
            },
            description: {
              'zh-CN':
                '现在系统会缓存你听过 / 下载过的音频，重复打开时不会再重新从服务器拉一遍，速度更快。同时缓存有一个容量上限，不会让你电脑越用越满。',
              en:
                "The system now caches audio you've already played or downloaded, so reopening a file doesn't fetch it again — it just plays. The cache also has a hard size limit, so it won't fill up your disk over time.",
            },
          },
          {
            title: {
              'zh-CN': '评论里的音频附件受权限保护',
              en: 'Audio attachments in comments are now permission-gated',
            },
            description: {
              'zh-CN': '评论里的音频附件只能由登录并有权限的人才能下载、播放，不再存在被直接拉取的风险。',
              en: 'Audio attachments inside comments can only be fetched or played by signed-in users who have access — no more direct-link leakage.',
            },
          },
          {
            title: {
              'zh-CN': '附件顺序稳定，[N] 时间戳不会错位',
              en: "Attachment order is stable — [N] timestamps won't drift",
            },
            description: {
              'zh-CN': '评论内附件的编号顺序现在是稳定的，[1]、[2] 这些时间戳引用不会因为上传顺序或刷新页面而变来变去。',
              en: "The ordering of attachments in a comment is now stable, so references like [1] and [2] in timestamp syntax don't shift around after uploads or page refreshes.",
            },
          },
        ],
      },
      {
        heading: {
          'zh-CN': '安全性与操作反馈',
          en: 'Safety & Feedback',
        },
        items: [
          {
            title: {
              'zh-CN': '危险操作都加了二次确认',
              en: "Dangerous actions all ask twice",
            },
            description: {
              'zh-CN':
                '注销账号、确认母带交付、拒绝曲目这类无法回头的操作，现在都会先弹出清晰的确认提示，误触成本降到最低。',
              en:
                "Irreversible actions like deleting your account, confirming a mastering delivery, or rejecting a track now show a clear confirmation first — much harder to set them off by accident.",
            },
          },
          {
            title: {
              'zh-CN': '加载、空状态和错误提示更整齐',
              en: 'Cleaner loading, empty, and error states',
            },
            description: {
              'zh-CN':
                '系统各处的加载骨架、空状态、错误提示与无障碍支持都做了统一；注册、上传等边界场景的校验也更严格，报错时知道是哪里出了问题。',
              en:
                'Loading skeletons, empty states, error messages, and accessibility support have been unified across the app. Validation on edge cases like registration and upload is tighter too — when something fails, you can tell why.',
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
