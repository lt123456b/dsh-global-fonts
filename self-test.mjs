// 自检：不依赖 DSH 运行时，喂一个假 ctx，确认提示词注入 + 设置页 API 都挂对了。
import { apply, name, inject, __test } from './index.js'

const { ROLE_META, DEFAULT_ROLES, renderTable, renderBan, buildPrompt, fontFamilies, scanSystemFonts, readSystemFontsCache, snapshot } = __test

const sections = []
const routes = []

function fakeEffect(fn, label) {
  const dispose = fn()
  if (typeof dispose !== 'function') throw new Error(`effect 没返回 dispose: ${label}`)
  return dispose
}

const ctx = {
  effect: fakeEffect,
  systemPrompt: {
    section(opts) {
      if (typeof opts.text !== 'function') throw new Error(`section ${opts.name} 的 text 不是函数`)
      sections.push(opts)
      return () => {}
    },
  },
  inject(deps, cb) {
    if (!deps.includes('webServer')) throw new Error('意外依赖: ' + deps.join(','))
    cb({
      effect: fakeEffect,
      webServer: {
        register(route) {
          if (route.kind !== 'exact') throw new Error('路由 kind 应为 exact')
          if (!route.path || !route.handler) throw new Error('路由缺 path 或 handler')
          routes.push(route)
          return () => {}
        },
      },
    })
  },
}

apply(ctx)

const problems = []
const warn = []
const ok = (cond, msg) => {
  if (!cond) problems.push(msg)
}

/* ── 1. 插件身份 ── */
ok(name === 'dsh-global-fonts', `name 不对: ${name}`)
ok(inject.includes('systemPrompt'), 'inject 缺 systemPrompt')

/* ── 2. 两段提示词 ── */
ok(sections.length === 2, `section 数量 ${sections.length}，应为 2`)
const byName = Object.fromEntries(sections.map((s) => [s.name, s]))
const table = byName['global-fonts']
const ban = byName['global-fonts:ban']
ok(!!table, '缺 global-fonts 表 section')
ok(!!ban, '缺 global-fonts:ban 禁令 section')
if (table) ok(table.order < 800, '字体表 order 不该排到末尾')
if (ban) ok(ban.order >= 800, '禁令应贴近对话末尾')
if (table) ok(table.interpolate === false, '字体表 interpolate 应为 false')
if (ban) ok(ban.interpolate === false, '禁令 interpolate 应为 false')

/* ── 3. 默认值符合用户口径：正文全黑体，宋体只许出现在标题 ── */
ok(Object.keys(DEFAULT_ROLES).length === ROLE_META.length, '默认值缺用途')
for (const r of ROLE_META) {
  const v = DEFAULT_ROLES[r.key]
  ok(!!v, `默认值缺 ${r.key}`)
  if (!v) continue
  ok(typeof v.cjk === 'string' && v.cjk.startsWith('思源'), `${r.key}.cjk 不是思源: ${v.cjk}`)
  ok(typeof v.latin === 'string' && v.latin.startsWith('思源'), `${r.key}.latin 不是思源: ${v.latin}`)
  // 用户明确要求：正文/加粗/小标题/注释一律黑体，宋体只有标题能用
  if (r.key !== 'title') {
    ok(v.cjk.includes('黑体'), `${r.key}.cjk 应为本机思源黑体，实际 ${v.cjk}`)
    ok(v.latin.includes('黑体'), `${r.key}.latin 应为本机思源黑体，实际 ${v.latin}`)
  }
}
ok(DEFAULT_ROLES.title.cjk.includes('宋体'), '标题中文应为思源宋体')

/* ── 4. 字体表内容 ── */
if (table) {
  const t = table.text()
  for (const needle of ['| 用途 | 中文 | 西文 | 备注 |', '思源黑体 CN Medium', '思源宋体', 'eastAsia', 'ascii']) {
    ok(t.includes(needle), `字体表缺「${needle}」`)
  }
  for (const r of ROLE_META) ok(t.includes(r.label), `字体表缺用途行「${r.label}」`)
  // 宋体不许出现在非标题行
  const bodyRows = t.split('\n').filter((line) => line.startsWith('| ') && !line.includes('| 用途 |'))
  for (const line of bodyRows) {
    if (line.includes('宋体') && !line.startsWith('| 标题')) {
      problems.push(`宋体漏进了非标题行: ${line}`)
    }
  }
}

/* ── 5. 禁令内容 ── */
if (ban) {
  const b = ban.text()
  for (const needle of ['fontctl.py', '不比较', '不问', '不猜']) {
    ok(b.includes(needle), `禁令缺「${needle}」`)
  }
}

/* ── 6. 设置页 API ── */
ok(routes.length === 1, `webServer 路由数 ${routes.length}，应为 1`)
if (routes[0]) ok(routes[0].path === '/global-fonts-api', `路由路径不对: ${routes[0].path}`)

/* ── 7. 字体索引（本机没索引只警告，不算失败）── */
const fonts = fontFamilies()
if (fonts.ok) {
  ok(Array.isArray(fonts.list) && fonts.list.length > 0, '字体清单为空')
  const flat = (fonts.list || []).flatMap((f) => (f[2] || []).map((w) => w[0]))
  ok(flat.includes('思源黑体 CN Medium'), '索引里找不到「思源黑体 CN Medium」')
  ok(flat.includes('思源宋体 CN Heavy'), '索引里找不到「思源宋体 CN Heavy」')
  ok(fonts.list.every((f) => Array.isArray(f[2]) && f[2].length > 0), '字体家族里有空字重')
} else {
  warn.push('没读到 office-fonts 索引（' + (fonts.source || '未知路径') + '），面板下拉会是空的')
}

/* ── 7.5 系统字体兜底：GDI 枚举（Windows 才有）── */
if (process.platform === 'win32') {
  const sys = await scanSystemFonts()
  if (!sys) {
    warn.push('系统字体扫描失败（PowerShell / System.Drawing 不可用），面板只能手输字体名')
  } else {
    ok(sys.families.length > 500, `系统字体只扫到 ${sys.families.length} 个，可疑`)
    const names = sys.families.map((f) => f[2][0][0])
    ok(names.includes('思源黑体 CN Medium'), '系统扫描缺「思源黑体 CN Medium」')
    ok(sys.families.some((f) => f[1] === 1), '系统扫描没识别出中文家族')
    ok(readSystemFontsCache() !== null, '系统字体缓存没落盘')
  }
} else {
  warn.push('非 Windows 平台，跳过系统字体兜底')
}

/* ── 8. snapshot 形状 ── */
const snap = snapshot()
for (const key of ['enabled', 'roles', 'meta', 'fonts', 'promptTable', 'promptBan']) {
  ok(key in snap, `snapshot 缺字段 ${key}`)
}

/* ── 9. 关闭开关：env 设 off 后两段都应返回空串 ── */
process.env.DSH_GLOBAL_FONTS = 'off'
const offEmpty = table && ban ? table.text() === '' && ban.text() === '' : false
ok(offEmpty, 'DSH_GLOBAL_FONTS=off 没有关掉注入')
const offPrompt = buildPrompt(DEFAULT_ROLES)
ok(offPrompt.table === '' && offPrompt.ban === '', 'off 时 buildPrompt 应返回空')
delete process.env.DSH_GLOBAL_FONTS

/* ── 结果 ── */
if (problems.length) {
  console.error('FAIL')
  for (const p of problems) console.error(' - ' + p)
  process.exit(1)
}

console.log('PASS  dsh-global-fonts self-test')
console.log(`  sections : ${sections.map((s) => `${s.name}@${s.order}`).join(', ')}`)
console.log(`  route    : ${routes[0] ? routes[0].path : '(none)'}`)
console.log(`  table    : ${table ? table.text().length : 0} chars`)
console.log(`  ban      : ${ban ? renderBan().length : 0} chars`)
console.log(`  fonts    : ${fonts.ok ? `${fonts.list.length} 家族 / ${fonts.source}` : '未读到索引'}`)
console.log('  off 开关 : OK   （表头为空即关闭）')
for (const w of warn) console.log('  warn     : ' + w)