/**
 * dsh-global-fonts — 把本机字体钉死进系统提示词（Host 半边）
 *
 * 干三件事：
 * 1. 数据：默认一套「正文全思源黑体、标题思源宋体 Heavy、西文也思源黑体」的字体表。
 * 2. 注入：把这张表按「用途 × 中文/西文」渲染成提示词，加一段禁令，禁止模型再检测、比较、提问字体。
 * 3. 面板：在设置页提供自定义面板，字体清单直接读 office-fonts 的本机索引，可换任意本机字体。
 *
 * 数据落在用户目录下，卸载不留进程状态：
 *   ~/.dsh/global-fonts/state.json        开关 + 五个用途 × 中文/西文
 *   ~/.dsh/global-fonts/last-prompt.txt   最近一次注入的文本（排障用）
 *
 * 关闭：面板总开关，或环境变量 DSH_GLOBAL_FONTS=off。
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'dsh-global-fonts'
export const inject = ['systemPrompt']

const HOME_DIR = process.env.DSH_GLOBAL_FONTS_HOME || join(homedir(), '.dsh', 'global-fonts')
const STATE_FILE = join(HOME_DIR, 'state.json')
const PROMPT_FILE = join(HOME_DIR, 'last-prompt.txt')
const ROUTE = '/global-fonts-api'

/** 用途：面板一行一个，注入一条。 */
const ROLE_META = [
  { key: 'title', label: '标题', hint: '文档大标题、封面标题' },
  { key: 'subtitle', label: '小标题', hint: '二级标题、章节小标题' },
  { key: 'body', label: '正文', hint: '默认档，占全文绝大部分' },
  { key: 'strong', label: '加粗', hint: '正文里的重点、强调' },
  { key: 'caption', label: '图表注', hint: '图注、表注、引用块' },
]

/**
 * 默认值 = 用户定的那套：
 *   正文全思源黑体 Medium、标题思源宋体 Heavy、加粗思源黑体 Bold、西文也思源黑体。
 * 每项的 bold 字段表示「这个字体名要额外设 bold=true 才能拿对字重」（思源宋体的 Bold 档就是这样）。
 */
const DEFAULT_ROLES = {
  title: { cjk: '思源宋体 CN Heavy', latin: '思源黑体 CN Heavy', bold: false },
  subtitle: { cjk: '思源黑体 CN Bold', latin: '思源黑体 CN Bold', bold: false },
  body: { cjk: '思源黑体 CN Medium', latin: '思源黑体 CN Medium', bold: false },
  strong: { cjk: '思源黑体 CN Bold', latin: '思源黑体 CN Bold', bold: false },
  caption: { cjk: '思源黑体 CN Regular', latin: '思源黑体 CN Regular', bold: false },
}

/* ────────────────────────────── 状态 ────────────────────────────── */

function ensureHome() {
  if (!existsSync(HOME_DIR)) mkdirSync(HOME_DIR, { recursive: true })
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  ensureHome()
  const tmp = file + '.tmp'
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, file)
}

function readState() {
  const raw = readJson(STATE_FILE, null)
  const saved = raw && typeof raw === 'object' ? raw : {}
  const out = { enabled: saved.enabled !== false, roles: {} }
  for (const r of ROLE_META) {
    const d = DEFAULT_ROLES[r.key]
    const v = (saved.roles && saved.roles[r.key]) || {}
    out.roles[r.key] = {
      cjk: typeof v.cjk === 'string' && v.cjk.trim() ? v.cjk.trim() : d.cjk,
      latin: typeof v.latin === 'string' && v.latin.trim() ? v.latin.trim() : d.latin,
      bold: v.bold === true,
    }
  }
  return out
}

function saveState(state) {
  writeJson(STATE_FILE, state)
}

function envOff() {
  const v = String(process.env.DSH_GLOBAL_FONTS ?? '').trim().toLowerCase()
  return v === 'off' || v === '0' || v === 'false'
}

function isOn(state) {
  return state.enabled !== false && !envOff()
}

/* ─────────────────────────── 本机字体索引 ─────────────────────────── */

let FONT_CACHE = null

/** 没装 office-fonts skill 时，用 Windows GDI 自己扫一遍，缓存在这里。 */
const SYSTEM_FONTS_FILE = join(HOME_DIR, 'fonts-cache.json')

/**
 * 用 GDI 的 InstalledFontCollection 枚举家族名 —— 这正是 Office 字体框里
 * 那串名字，比翻字体文件猜文件名靠谱（思源黑体每个字重都是独立家族名）。
 *
 * 中文不能走 stdout：Windows PowerShell 5.1 往管道里写的是系统 ANSI 码页，
 * Node 按 UTF-8 读会全变乱码。所以让 PowerShell 自己落一个 UTF-8 JSON 文件，
 * Node 再读回来。
 */
function scanSystemFonts() {
  if (process.platform !== 'win32') return Promise.resolve(null)

  const tmp = join(HOME_DIR, 'fonts-scan.tmp.json')
  const quoted = tmp.replace(/'/g, "''")
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    '$n = (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }',
    `$n | ConvertTo-Json -Compress | Out-File -FilePath '${quoted}' -Encoding utf8`,
  ].join('; ')

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 30000, windowsHide: true },
      () => {
        let names = null
        try {
          const txt = readFileSync(tmp, 'utf8').replace(/^\uFEFF/, '')
          const raw = JSON.parse(txt)
          names = Array.isArray(raw) ? raw : [raw]
        } catch {
          names = null
        }
        try {
          unlinkSync(tmp)
        } catch {
          /* 临时文件清不掉就留着，反正下回覆盖 */
        }
        if (!names || !names.length) return resolve(null)

        const seen = new Set()
        const list = []
        for (const raw of names) {
          const nm = String(raw || '').trim()
          if (!nm || seen.has(nm)) continue
          seen.add(nm)
          // 家族名里带汉字就当中文家族，面板里排前面
          const cjk = /[\u3400-\u9fff]/.test(nm) ? 1 : 0
          // 系统扫描拿不到字重，每个名字当独立 face，字重留空
          list.push([nm, cjk, [[nm, 400, '', 0]]])
        }
        if (!list.length) return resolve(null)
        list.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
        const payload = { scannedAt: new Date().toISOString(), families: list }
        try {
          writeJson(SYSTEM_FONTS_FILE, payload)
        } catch {
          /* 缓存写不了不影响这次返回 */
        }
        resolve(payload)
      },
    )
  })
}

function readSystemFontsCache() {
  const raw = readJson(SYSTEM_FONTS_FILE, null)
  if (!raw || !Array.isArray(raw.families) || !raw.families.length) return null
  return {
    ok: true,
    kind: 'system',
    list: raw.families,
    scannedAt: raw.scannedAt || '',
    source: SYSTEM_FONTS_FILE,
  }
}

/** office-fonts 的索引可能落在几处，按顺序找。 */
function fontCachePaths() {
  const out = []
  if (process.env.DSH_FONT_CACHE) out.push(process.env.DSH_FONT_CACHE)
  const dshHome = process.env.DSH_HOME
  if (dshHome) out.push(join(dshHome, 'skills', 'office-fonts', 'cache', 'fonts.json'))
  out.push(join(homedir(), '.dsh', 'skills', 'office-fonts', 'cache', 'fonts.json'))
  out.push('D:\\dsh-home\\skills\\office-fonts\\cache\\fonts.json')
  return out
}

/**
 * 读 office-fonts 的 families，压成紧凑结构：
 *   [家族名, 是否中文(1/0), [[字体名, 字重, 字重标签, 需bold(1/0)], ...]]
 * 面板只认字体名（face），不是家族名 —— 两者差一个 Heavy/Medium 就会被 Word 静默替换。
 */
function fontFamilies() {
  if (FONT_CACHE) return FONT_CACHE
  for (const p of fontCachePaths()) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8'))
      const list = []
      for (const f of raw.families || []) {
        const ws = []
        for (const w of f.weights || []) {
          if (w.gdi === false) continue
          const face = String(w.face || '').trim()
          if (!face) continue
          ws.push([face, Number(w.class) || 400, String(w.label || ''), w.bold ? 1 : 0])
        }
        if (!ws.length) continue
        list.push([String(f.name || ''), f.cjk ? 1 : 0, ws])
      }
      // 中文家族排前面，面板里更好找
      list.sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'zh'))
      FONT_CACHE = {
        ok: true,
        kind: 'office-fonts',
        list,
        scannedAt: (raw.meta && raw.meta.scanned_at_iso) || '',
        source: p,
      }
      return FONT_CACHE
    } catch {
      /* 换下一个候选 */
    }
  }
  // 没装 office-fonts skill：退到本机 GDI 扫描的缓存
  const sys = readSystemFontsCache()
  if (sys) {
    FONT_CACHE = sys
    return FONT_CACHE
  }
  FONT_CACHE = { ok: false, kind: 'none', list: [], scannedAt: '', source: '' }
  return FONT_CACHE
}

/* ──────────────────────────── 提示词 ──────────────────────────── */

/** 本机字体名集合 —— 判断配置里的字体到底装没装。 */
function installedFaces(list) {
  const set = new Set()
  for (const f of list || []) {
    for (const w of f[2] || []) if (w[0]) set.add(w[0])
  }
  return set
}

/** 各角色配的字体里本机没有的那些。本机没有索引时一律不判定，免得误报。 */
function missingFaces(state, list) {
  if (!list || !list.length) return []
  const set = installedFaces(list)
  const out = []
  for (const r of ROLE_META) {
    const v = state.roles[r.key] || {}
    for (const lang of ['cjk', 'latin']) {
      const face = v[lang]
      if (face && !set.has(face) && !out.includes(face)) out.push(face)
    }
  }
  return out
}

function renderTable(state, missing) {
  const rows = ROLE_META.map((r) => {
    const v = state.roles[r.key]
    const notes = []
    if (v.bold) notes.push('必须同时设 bold=true')
    if (r.key === 'body') notes.push('默认档')
    if (r.key === 'strong') notes.push('名字里已含 Bold 的不要再设 bold=true')
    return `| ${r.label} | ${v.cjk} | ${v.latin} | ${notes.join('；')} |`
  })

  return [
    '【本机字体表·直接照抄，不许查、不许改、不许问】',
    '',
    '凡是产出带排版的文字（Word、PPT、Excel、HTML、Markdown 转文档、给别人的字体建议），中文用「中文」列，西文用「西文」列，一律照抄，不另行挑选。',
    '',
    '| 用途 | 中文 | 西文 | 备注 |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '字体名是 Windows GDI 家族名，一个字都不能改：「思源黑体 CN Medium」不是「思源黑体 Medium」，也不是「Source Han Sans SC Medium」。',
    'Office 的字体槽：eastAsia（中文）填中文列，ascii/hAnsi（西文）填西文列。',
    ...(missing && missing.length
      ? [
          '',
          '【本机缺字体·静默替换】',
          `这台机器没装：${missing.join('、')}。上表里出现这些名字时，改用本机已有的同类字体（中文优先 微软雅黑 → 宋体 → 等线；西文优先 Arial → Calibri），不要写这些缺字体名，也不要向用户解释。`,
        ]
      : []),
  ].join('\n')
}

function renderBan() {
  return [
    '【字体禁令·不遵守就算返工】',
    '',
    '只要涉及给文字定字体，就按上面的字体表办，禁止再出现下面这些动作：',
    '',
    '1. 不查字体：不加载 office-fonts 技能，不跑 fontctl.py，不做字体检测，不列已安装字体，不调用 show / resolve / doctor / list。',
    '2. 不比较：不罗列备选字体，不权衡黑体还是宋体，不分析字重档位。',
    '3. 不问：不向用户确认「用哪个字体」，不因为字体多问一轮。',
    '4. 不猜：表里没有的字体名一律不写；拿不准就用正文那一档。',
    '5. 不解释：回复里不解释「为什么选这个字体」，除非用户明确问。',
    '',
    '唯一例外：用户明确要求「检查/核对这份文档里实际用的字体」，才允许对那份文件跑一次 check。',
    '不涉及排版排字的任务（写代码、跑命令、查资料）完全不管字体。',
  ].join('\n')
}

function buildPrompt(state) {
  if (!isOn(state)) return { table: '', ban: '', missing: [] }
  const fonts = fontFamilies()
  const missing = missingFaces(state, fonts.list)
  return { table: renderTable(state, missing), ban: renderBan(), missing }
}

function dumpPrompt(text) {
  try {
    ensureHome()
    writeFileSync(PROMPT_FILE, text, 'utf8')
  } catch {
    /* 排障文件写不了不影响主流程 */
  }
}

/* ─────────────────────────── HTTP API ─────────────────────────── */

function isLoopback(req) {
  const addr = req.socket && req.socket.remoteAddress
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 2_000_000) raw = ''
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

function snapshot() {
  const state = readState()
  const fonts = fontFamilies()
  const prompt = buildPrompt(state)
  return {
    enabled: state.enabled !== false && !envOff(),
    envOff: envOff(),
    roles: state.roles,
    meta: ROLE_META,
    defaults: DEFAULT_ROLES,
    fonts: fonts.list,
    fontsOk: fonts.ok,
    fontsKind: fonts.kind,
    fontsScannedAt: fonts.scannedAt,
    fontsSource: fonts.source,
    missing: prompt.missing,
    promptTable: prompt.table,
    promptBan: prompt.ban,
  }
}

/** 保存后的回包不带字体清单 —— 那玩意儿两百多 KB，每敲一下都传一遍太浪费。 */
function snapshotLite() {
  const state = readState()
  const prompt = buildPrompt(state)
  return {
    enabled: state.enabled !== false && !envOff(),
    envOff: envOff(),
    roles: state.roles,
    missing: prompt.missing,
    promptTable: prompt.table,
    promptBan: prompt.ban,
  }
}

function makeHandler() {
  return async function handleApi(req, res) {
    const reply = (status, obj) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(obj))
    }
    if (!isLoopback(req)) return reply(403, { ok: false, error: '只接受本机请求' })

    try {
      let op = ''
      let body = {}
      if (req.method === 'GET') {
        op = new URL(req.url || '/', 'http://localhost').searchParams.get('op') || 'snapshot'
        if (op === 'snapshot') return reply(200, { ok: true, ...snapshot() })
        return reply(400, { ok: false, error: '未知 op: ' + op })
      }

      body = await readBody(req)
      op = String(body.op || '')
      if (!op) return reply(400, { ok: false, error: '缺少 op' })

      switch (op) {
        case 'state':
          return reply(200, { ok: true, ...snapshot() })

        case 'save': {
          const patch = body.patch && typeof body.patch === 'object' ? body.patch : body
          const state = readState()
          if (typeof patch.enabled === 'boolean') state.enabled = patch.enabled
          if (patch.roles && typeof patch.roles === 'object') {
            for (const r of ROLE_META) {
              const next = patch.roles[r.key]
              if (!next || typeof next !== 'object') continue
              const cur = state.roles[r.key]
              if (typeof next.cjk === 'string' && next.cjk.trim()) cur.cjk = next.cjk.trim()
              if (typeof next.latin === 'string' && next.latin.trim()) cur.latin = next.latin.trim()
              if (typeof next.bold === 'boolean') cur.bold = next.bold
            }
          }
          saveState(state)
          return reply(200, { ok: true, ...snapshotLite() })
        }

        case 'reset': {
          const state = readState()
          state.roles = JSON.parse(JSON.stringify(DEFAULT_ROLES))
          saveState(state)
          return reply(200, { ok: true, ...snapshotLite() })
        }

        case 'reloadFonts': {
          FONT_CACHE = null
          // 没 office-fonts 索引时，重读 = 让 Windows GDI 重新枚举一遍并落缓存
          if (!fontFamilies().ok && process.platform === 'win32') {
            await scanSystemFonts()
            FONT_CACHE = null
          }
          return reply(200, { ok: true, ...snapshot() })
        }

        default:
          return reply(400, { ok: false, error: '未知 op: ' + op })
      }
    } catch (err) {
      return reply(500, { ok: false, error: String((err && err.message) || err) })
    }
  }
}

/* ────────────────────────────── 入口 ────────────────────────────── */

export function apply(ctx) {
  ensureHome()

  // 字体候选：优先 office-fonts 的索引，没有就让 Windows GDI 扫一次（后台，不阻塞启动）
  if (!fontFamilies().ok) {
    scanSystemFonts()
      .then((payload) => {
        if (payload) FONT_CACHE = null
      })
      .catch(() => {})
  }

  // 1) 字体表：每次组装提示词现算，面板改完下一轮立刻生效。
  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: 'global-fonts',
        order: 200,
        interpolate: false,
        text: () => {
          const prompt = buildPrompt(readState())
          dumpPrompt(prompt.table + '\n\n' + prompt.ban)
          return prompt.table
        },
      }),
    'dsh-global-fonts: 字体表注入',
  )

  // 2) 禁令：贴近对话末尾，压住后段跑偏。
  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: 'global-fonts:ban',
        order: 895,
        interpolate: false,
        text: () => buildPrompt(readState()).ban,
      }),
    'dsh-global-fonts: 字体禁令',
  )

  // 3) 设置页面板用的 HTTP API（只本机回环）。
  ctx.inject(['webServer'], (wctx) => {
    wctx.effect(
      () => wctx.webServer.register({ kind: 'exact', path: ROUTE, handler: makeHandler() }),
      'dsh-global-fonts: API 路由',
    )
  })
}

export const __test = {
  ROLE_META,
  DEFAULT_ROLES,
  readState,
  saveState,
  renderTable,
  renderBan,
  installedFaces,
  missingFaces,
  buildPrompt,
  fontFamilies,
  scanSystemFonts,
  readSystemFontsCache,
  snapshot,
  HOME_DIR,
  SYSTEM_FONTS_FILE,
}