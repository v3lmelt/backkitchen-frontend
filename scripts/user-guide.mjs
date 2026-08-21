import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const guideDir = path.join(projectRoot, 'docs', 'user-guide')
const shellFile = path.join(guideDir, 'shell.html')
const outputFile = path.join(guideDir, 'index.html')

const GROUPS = {
  start: '开始使用',
  producer: '主催指南',
  composer: '曲师指南',
  mastering: '母带工程师',
}

// 顺序即侧边导航与章节分页顺序；nav 为侧边导航显示名（可用简称）
const CHAPTERS = [
  { id: 'home', file: 'README.md', nav: '使用说明首页', group: 'start' },
  { id: 'overview', file: 'overview.md', nav: '平台与完整制作流程', group: 'start' },
  { id: 'getting-started', file: 'getting-started.md', nav: '注册、验证与登录', group: 'start' },
  { id: 'roles', file: 'roles.md', nav: '认识平台职责', group: 'start' },
  { id: 'notifications', file: 'notifications.md', nav: '通知、待办与状态', group: 'start' },
  { id: 'issues-and-versions', file: 'issues-and-versions.md', nav: '问题、评论与版本', group: 'start' },
  { id: 'producer-circles', file: 'producer/circles.md', nav: '创建和管理社团', group: 'producer' },
  { id: 'producer-albums', file: 'producer/albums.md', nav: '创建专辑与团队', group: 'producer' },
  { id: 'producer-workflow', file: 'producer/workflow.md', nav: '设置同行评审规则', group: 'producer' },
  { id: 'producer-intake', file: 'producer/intake.md', nav: '接收投稿与分配评审', group: 'producer' },
  { id: 'producer-approval', file: 'producer/approval.md', nav: '主催审批与拒绝', group: 'producer' },
  { id: 'producer-final-review', file: 'producer/final-review.md', nav: '终审、完成与重新开启', group: 'producer' },
  { id: 'composer-submission', file: 'composer/submission.md', nav: '提交自己的曲目', group: 'composer' },
  { id: 'composer-peer-review', file: 'composer/peer-review.md', nav: '进行同行评审', group: 'composer' },
  { id: 'composer-revision', file: 'composer/revision.md', nav: '处理反馈与修订', group: 'composer' },
  { id: 'mastering', file: 'mastering.md', nav: '母带沟通、交付与确认', group: 'mastering' },
]

const pageIdByMdFile = new Map(CHAPTERS.map((chapter) => [path.basename(chapter.file), chapter.id]))

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function rewriteHref(href) {
  if (href.endsWith('.md')) {
    const pageId = pageIdByMdFile.get(path.basename(href))
    assert(pageId, `Unknown guide link target "${href}".`)
    return `#${pageId}`
  }
  return href
}

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

const dataUriCache = new Map()

// 将 assets/ 下的图片读取为 base64 data URI，使产物成为自包含单文件
function embedImage(src) {
  const normalized = src.replace(/^(\.\.\/)+assets\//, 'assets/')
  if (dataUriCache.has(normalized)) return dataUriCache.get(normalized)
  const fullPath = path.join(guideDir, normalized)
  assert(existsSync(fullPath), `Missing image file "${normalized}".`)
  const mime = MIME_BY_EXT[path.extname(fullPath).toLowerCase()]
  assert(mime, `Unsupported image type "${normalized}".`)
  const dataUri = `data:${mime};base64,${readFileSync(fullPath).toString('base64')}`
  dataUriCache.set(normalized, dataUri)
  return dataUri
}

function renderInline(text) {
  const codeSpans = []
  let result = text.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code)
    return `\x01${codeSpans.length - 1}\x01`
  })
  result = escapeHtml(result)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img alt="${alt}" decoding="async" loading="lazy" src="${embedImage(src)}"/>`)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => `<a href="${rewriteHref(href)}">${label}</a>`)
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/\x01(\d+)\x01/g, (_, index) => `<code>${escapeHtml(codeSpans[Number(index)])}</code>`)
  return result
}

function renderTable(rows) {
  const parseRow = (row) => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
  const head = parseRow(rows[0])
  const body = rows.slice(2).map(parseRow)
  return [
    '<div class="table-scroll"><table>',
    '<thead>',
    '<tr>',
    ...head.map((cell) => `<th>${renderInline(cell)}</th>`),
    '</tr>',
    '</thead>',
    '<tbody>',
    ...body.map((row) => ['<tr>', ...row.map((cell) => `<td>${renderInline(cell)}</td>`), '</tr>'].join('\n')),
    '</tbody>',
    '</table></div>',
  ].join('\n')
}

const BLOCK_START = /^(#{1,3}\s|```|> |- |\d+\. |\|)/

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const html = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }

    if (line.startsWith('```')) {
      const language = line.slice(3).trim()
      const code = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(lines[i])
        i += 1
      }
      i += 1
      const classAttr = language ? ` class="language-${language}"` : ''
      html.push(`<pre><code${classAttr}>${escapeHtml(code.join('\n'))}\n</code></pre>`)
      continue
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      html.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`)
      i += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''))
        i += 1
      }
      html.push(`<blockquote><p>${renderInline(quote.join(' '))}</p></blockquote>`)
      continue
    }

    if (line.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|?$/.test(lines[i + 1])) {
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i])
        i += 1
      }
      html.push(renderTable(rows))
      continue
    }

    if (line.startsWith('- ')) {
      const items = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2))
        i += 1
      }
      html.push(['<ul>', ...items.map((item) => `<li>${renderInline(item)}</li>`), '</ul>'].join('\n'))
      continue
    }

    if (/^\d+\. /.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''))
        i += 1
      }
      html.push(['<ol>', ...items.map((item) => `<li>${renderInline(item)}</li>`), '</ol>'].join('\n'))
      continue
    }

    const paragraph = []
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) {
      paragraph.push(lines[i])
      i += 1
    }
    const content = paragraph
      .map((part) => (/ {2,}$/.test(part) ? `${renderInline(part.trimEnd())}<br/>` : renderInline(part)))
      .join('\n')
    html.push(`<p>${content}</p>`)
  }

  return html.join('\n')
}

function loadChapter(chapter) {
  const fullPath = path.join(guideDir, chapter.file)
  assert(existsSync(fullPath), `Missing chapter file "${chapter.file}".`)
  const source = readFileSync(fullPath, 'utf8').replace(/\r\n?/g, '\n')
  const titleMatch = /^#\s+(.*)$/m.exec(source)
  assert(titleMatch, `${chapter.file}: first-level heading is required as the chapter title.`)
  const body = source.replace(/^#\s+.*\n/, '')
  return { title: titleMatch[1].trim(), body: renderMarkdown(body) }
}

function renderNav(chapters) {
  const sections = []
  let currentGroup = null
  chapters.forEach((chapter, index) => {
    if (chapter.group !== currentGroup) {
      if (currentGroup) sections.push('</section>')
      sections.push(`<section class="nav-group"><h2>${GROUPS[chapter.group]}</h2>`)
      currentGroup = chapter.group
    }
    const number = String(index + 1).padStart(2, '0')
    sections.push(
      `<a class="nav-item" href="#${chapter.id}" data-nav-page="${chapter.id}" data-search="${chapter.nav} ${chapter.title}"><span>${number}</span>${chapter.nav}</a>`,
    )
  })
  sections.push('</section>')
  return sections.join('')
}

function renderArticle(chapter, index, total) {
  const number = String(index + 1).padStart(2, '0')
  return `<article class="guide-page" id="page-${chapter.id}" data-page="${chapter.id}" data-title="${chapter.title}" data-index="${index + 1}" hidden>
          <header class="article-header">
            <div>
              <p class="article-kicker">${GROUPS[chapter.group]} / ${number}</p>
              <h1>${chapter.title}</h1>
            </div>
            <button class="copy-link" type="button" data-copy-link>复制链接</button>
          </header>
          <div class="article-body">
${chapter.body}</div>
          <nav class="article-pagination" aria-label="章节导航">
            <button type="button" data-prev>← 上一篇</button>
            <span>${number} / ${String(total).padStart(2, '0')}</span>
            <button type="button" data-next>下一篇 →</button>
          </nav>
        </article>`
}

function render() {
  assert(existsSync(shellFile), 'shell.html template is missing.')
  const chapters = CHAPTERS.map((chapter) => ({ ...chapter, ...loadChapter(chapter) }))
  const shell = readFileSync(shellFile, 'utf8')
  assert(shell.includes('<!-- @NAV -->') && shell.includes('<!-- @MAIN -->'), 'shell.html is missing placeholders.')
  return shell
    .replace('<!-- @NAV -->', renderNav(chapters))
    .replace('<!-- @MAIN -->', chapters.map((chapter, index) => renderArticle(chapter, index, chapters.length)).join(''))
}

function main() {
  const command = process.argv[2] ?? '--check'
  assert(command === '--check' || command === '--write', 'Use --check or --write.')

  const nextOutput = render()

  if (command === '--write') {
    writeFileSync(outputFile, nextOutput, 'utf8')
    console.log(`Updated ${path.relative(projectRoot, outputFile)}`)
    return
  }

  if (!existsSync(outputFile)) {
    throw new Error('Generated user guide is missing. Run `npm run user-guide:build`.')
  }

  const currentOutput = readFileSync(outputFile, 'utf8').replace(/\r\n?/g, '\n')
  if (currentOutput !== nextOutput.replace(/\r\n?/g, '\n')) {
    throw new Error('Generated user guide is stale. Run `npm run user-guide:build`.')
  }

  console.log('User guide is in sync.')
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
}
