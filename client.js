/**
 * dsh-global-fonts — 设置页「字体」面板（Client 半边）
 *
 * 注册 settings.section 的一页：总开关 + 用途 × 中文/西文 的八格字体选择。
 * 字体候选来自宿主侧读到的 office-fonts 本机索引（已压成 face 名）。
 * 数据全走宿主 HTTP API（/global-fonts-api），面板本身不存状态。
 * 注册 id 必须等于 loader entry 名（dsh-global-fonts）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-global-fonts',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const ROUTE = '/global-fonts-api'
    const STYLE_ID = 'dsh-global-fonts'
    const CSS = [
      '.sf-panel{display:flex;flex-direction:column;gap:14px;padding:4px 0;font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.sf-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px;display:flex;flex-direction:column;gap:10px}',
      '.sf-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
      '.sf-title{font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-secondary)}',
      '.sf-hint{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.55}',
      '.sf-grow{flex:1;min-width:140px}',
      '.sf-switch{position:relative;width:38px;height:21px;border-radius:999px;background:var(--dsw-alias-border-l1);cursor:pointer;transition:background .15s ease;flex:none;border:none;padding:0}',
      '.sf-switch::after{content:"";position:absolute;top:2px;left:2px;width:17px;height:17px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .15s ease}',
      '.sf-switch.on{background:var(--dsw-alias-brand-primary)}',
      '.sf-switch.on::after{transform:translateX(17px)}',
      '.sf-btn{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 12px;font-size:13px;cursor:pointer;transition:border-color .12s ease}',
      '.sf-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}',
      '.sf-btn:disabled{opacity:.5;cursor:default}',
      '.sf-grid{display:grid;grid-template-columns:64px 1fr 1fr;gap:9px 10px;align-items:center}',
      '.sf-th{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.sf-role{font-size:13px;font-weight:600}',
      '.sf-role small{display:block;font-weight:400;font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:1px}',
      '.sf-input{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 10px;font-size:12px;outline:none;font-family:inherit;width:100%;box-sizing:border-box}',
      '.sf-input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.sf-cell{position:relative}',
      '.sf-dd{position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:260px;overflow:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:200;padding:4px}',
      '.sf-dd-item{display:block;width:100%;text-align:left;background:none;border:none;color:var(--dsw-alias-label-primary);font-size:12px;padding:5px 8px;border-radius:6px;cursor:pointer;font-family:inherit}',
      '.sf-dd-item:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.sf-dd-item.on{color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.sf-dd-empty{font-size:12px;color:var(--dsw-alias-label-secondary);padding:6px 8px}',
      '.sf-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.7}',
      '.sf-pre{margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px;max-height:300px;overflow:auto;font-family:ui-monospace,Consolas,monospace}',
      '.sf-bad{color:#e5484d}',
      '.sf-link{color:var(--dsw-alias-brand-primary);text-decoration:none;border-bottom:1px solid currentColor}',
      '.sf-ok{color:#30a46c}',
    ].join('\n')

    function installStyle() {
      if (document.getElementById(STYLE_ID + '-style')) return
      const tag = document.createElement('style')
      tag.id = STYLE_ID + '-style'
      tag.setAttribute('data-plugin', STYLE_ID)
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    async function api(payload) {
      const res = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return res.json()
    }

    function Switch(props) {
      return h('button', {
        type: 'button',
        className: 'sf-switch' + (props.on ? ' on' : ''),
        title: props.on ? '已开启' : '已关闭',
        disabled: props.disabled,
        onClick: () => props.onChange && props.onChange(!props.on),
      })
    }

    /**
     * 一格：输入框 + 自绘下拉。
     * 不用 <datalist>：Chrome 对上千条 option 不渲染文字，只给一堆空白行，
     * 而且没法控制在面板里的层级。自己画一个 div 列表最稳。
     */
    function FontCell(props) {
      const [draft, setDraft] = useState(props.value)
      const [open, setOpen] = useState(false)
      const [q, setQ] = useState('')
      const timer = useRef(null)
      const box = useRef(null)

      useEffect(() => {
        setDraft(props.value)
      }, [props.value])

      useEffect(
        () => () => {
          if (timer.current) clearTimeout(timer.current)
        },
        [],
      )

      // 点到外面就收起来
      useEffect(() => {
        if (!open) return undefined
        const onDoc = (e) => {
          if (box.current && !box.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', onDoc)
        return () => document.removeEventListener('mousedown', onDoc)
      }, [open])

      // families: [家族名, 1|0 是否中文, [[face, 字重, 标签, 需bold], ...]]
      const all = useMemo(() => {
        const out = []
        for (const f of props.families || []) {
          const name = f[0]
          for (const w of f[2] || []) {
            const face = w[0]
            if (!face) continue
            out.push({ face, text: name + ' · ' + (w[2] || w[1]) })
          }
        }
        return out
      }, [props.families])

      const keyword = q.trim().toLowerCase()
      const hits = useMemo(() => {
        if (!keyword) return all.slice(0, 120)
        const out = []
        for (const it of all) {
          if (it.face.toLowerCase().indexOf(keyword) >= 0 || it.text.toLowerCase().indexOf(keyword) >= 0) {
            out.push(it)
            if (out.length >= 120) break
          }
        }
        return out
      }, [all, keyword])

      const onInput = (e) => {
        const v = e.target.value
        setDraft(v)
        setQ(v)
        setOpen(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          if (v.trim() && v !== props.value) props.onPick(v.trim())
        }, 400)
      }

      const choose = (face) => {
        setDraft(face)
        setOpen(false)
        props.onPick(face)
      }

      return h(
        'div',
        { className: 'sf-cell', ref: box },
        h('input', {
          className: 'sf-input',
          type: 'text',
          value: draft,
          disabled: props.disabled,
          placeholder: '点开选，或直接输字体名',
          onFocus: () => {
            setQ('')
            setOpen(true)
          },
          onChange: onInput,
        }),
        open && !props.disabled
          ? h(
              'div',
              { className: 'sf-dd' },
              hits.length
                ? hits.map((it) =>
                    h(
                      'button',
                      {
                        key: it.face,
                        type: 'button',
                        className: 'sf-dd-item' + (it.face === props.value ? ' on' : ''),
                        onMouseDown: (e) => {
                          e.preventDefault()
                          choose(it.face)
                        },
                      },
                      it.text,
                    ),
                  )
                : h('div', { className: 'sf-dd-empty' }, all.length ? '没有匹配的字体' : '还没读到字体列表'),
            )
          : null,
      )
    }

    function Panel() {
      const [data, setData] = useState(null)
      const [busy, setBusy] = useState('')
      const [msg, setMsg] = useState(null)
      const [showPreview, setShowPreview] = useState(false)

      useEffect(() => {
        installStyle()
      }, [])

      const load = useCallback(async () => {
        const res = await fetch(ROUTE + '?op=snapshot').then((r) => r.json())
        if (res && res.ok) setData(res)
        else setMsg({ kind: 'bad', text: '读不到状态：' + ((res && res.error) || '未知错误') })
      }, [])

      useEffect(() => {
        load()
      }, [load])

      const run = useCallback(
        async (op, extra, label) => {
          setBusy(label || op)
          setMsg(null)
          try {
            const res = await api({ op, ...(extra || {}) })
            if (!res || res.ok === false) {
              setMsg({ kind: 'bad', text: (res && res.error) || '操作失败' })
              return null
            }
            setData((prev) => ({ ...(prev || {}), ...res }))
            return res
          } catch (err) {
            setMsg({ kind: 'bad', text: String(err && err.message ? err.message : err) })
            return null
          } finally {
            setBusy('')
          }
        },
        [],
      )

      const pick = useCallback(
        async (roleKey, lang, face) => {
          const roles = { [roleKey]: { [lang]: face } }
          // 该 face 若属于「名字不带 Bold、要额外 bold=true」的档，自动带上
          let bold = null
          for (const f of (data && data.fonts) || []) {
            for (const w of f[2] || []) {
              if (w[0] === face) bold = w[3] === 1
            }
          }
          if (bold !== null) roles[roleKey].bold = bold
          await run('save', { patch: { roles } }, 'save')
        },
        [data, run],
      )

      if (!data) {
        return h('div', { className: 'sf-panel' }, h('div', { className: 'sf-hint' }, '正在读字体状态…'))
      }

      const enabled = data.enabled !== false
      const roles = data.roles || {}
      const meta = data.meta || []

      const header = h(
        'div',
        { className: 'sf-card' },
        h(
          'div',
          { className: 'sf-row' },
          h(Switch, {
            on: enabled,
            disabled: !!busy,
            onChange: (v) => run('save', { patch: { enabled: v } }, 'toggle'),
          }),
          h('div', { className: 'sf-grow' },
            h('div', { style: { fontWeight: 600 } }, enabled ? '字体固定：开' : '字体固定：关'),
            h('div', { className: 'sf-hint' },
              enabled
                ? 'AI 生成文档时直接按下面这张表套字体，不再检测、不再斟酌。'
                : '已关闭，AI 不再收到字体表，会回到自己挑字体的老样子。'),
          ),
        ),
        data.envOff
          ? h('div', { className: 'sf-bad', style: { fontSize: 12 } },
              '注意：环境变量 DSH_GLOBAL_FONTS=off 正生效，面板开关点了也不会注入。')
          : null,
      )

      const grid = h(
        'div',
        { className: 'sf-card' },
        h('div', { className: 'sf-title' }, '字体表（用途 × 中文/西文）'),
        h(
          'div',
          { className: 'sf-grid' },
          h('div', { className: 'sf-th' }, '用途'),
          h('div', { className: 'sf-th' }, '中文'),
          h('div', { className: 'sf-th' }, '西文'),
          meta.flatMap((m) => [
            h('div', { key: 'l-' + m.key, className: 'sf-role' },
              m.label,
              h('small', null, m.hint || ''),
            ),
            h(FontCell, {
              key: 'c-' + m.key,
              value: (roles[m.key] && roles[m.key].cjk) || '',
              families: data.fonts,
              disabled: !!busy,
              onPick: (face) => pick(m.key, 'cjk', face),
            }),
            h(FontCell, {
              key: 'x-' + m.key,
              value: (roles[m.key] && roles[m.key].latin) || '',
              families: data.fonts,
              disabled: !!busy,
              onPick: (face) => pick(m.key, 'latin', face),
            }),
          ]),
        ),
        data.missing && data.missing.length
          ? h('div', { className: 'sf-bad', style: { marginTop: 8, fontSize: 12 } },
              '本机没装：' + data.missing.join('、') +
                ' —— 生成文档时会自动换成同类字体；想彻底对齐，点上面的框改成已装的字体。')
          : null,
        h('div', { className: 'sf-hint' },
          '默认那套是思源字体。没装的话去下（免费开源）：',
          h('a', { className: 'sf-link', href: 'https://github.com/adobe-fonts/source-han-sans/releases', target: '_blank', rel: 'noreferrer' }, '思源黑体'),
          ' ／ ',
          h('a', { className: 'sf-link', href: 'https://github.com/adobe-fonts/source-han-serif/releases', target: '_blank', rel: 'noreferrer' }, '思源宋体'),
          '。装好回来点「重读字体」。',
        ),
        h('div', { className: 'sf-hint' },
          '输入框可以打字搜，也可以直接从下拉里挑。改完自动保存，下一句话就生效。',
          data.fontsOk
            ? ' 字体候选来自 office-fonts 索引' + (data.fontsScannedAt ? '（' + data.fontsScannedAt.slice(0, 10) + ' 扫描）' : '') + '。'
            : h('span', { className: 'sf-bad' }, ' 没找到 office-fonts 索引，先跑一次 fontctl.py scan 再点「重读字体」。'),
        ),
      )

      const toolbar = h(
        'div',
        { className: 'sf-row' },
        h('button', {
          type: 'button',
          className: 'sf-btn',
          disabled: !!busy,
          onClick: async () => {
            if (!window.confirm('把所有用途恢复成默认那套？')) return
            await run('reset', {}, 'reset')
          },
        }, '恢复默认'),
        h('button', {
          type: 'button',
          className: 'sf-btn',
          disabled: !!busy,
          onClick: () => run('reloadFonts', {}, 'reload'),
        }, '重读字体'),
        h('button', {
          type: 'button',
          className: 'sf-btn',
          disabled: !!busy,
          onClick: () => setShowPreview((v) => !v),
        }, showPreview ? '收起预览' : '看注入的提示词'),
        busy ? h('span', { className: 'sf-hint' }, '保存中…') : null,
      )

      const preview = showPreview
        ? h('div', { className: 'sf-card' },
            h('div', { className: 'sf-title' }, '实际注入给模型的内容'),
            h('pre', { className: 'sf-pre' }, data.promptTable + '\n\n' + data.promptBan),
          )
        : null

      const footer = h('div', { className: 'sf-hint' },
        '存到 ~/.dsh/global-fonts/state.json；环境变量 DSH_GLOBAL_FONTS=off 可整体关掉。改 index.js / client.js 后要重启 DSH 才生效。')

      return h('div', { className: 'sf-panel' },
        header,
        msg
          ? h('div', { className: msg.kind === 'bad' ? 'sf-bad' : 'sf-ok', style: { fontSize: 12 } }, msg.text)
          : null,
        grid,
        toolbar,
        preview,
        footer,
      )
    }

    const inject = ['slots']

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'global-fonts', order: 27, label: '字体' },
        () => h(Panel),
      ))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})