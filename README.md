# dsh-global-fonts

把本机中文字体钉进 DeepSeek Harness 的系统提示词，让 AI 做 Word / PPT / Excel 排版时
**直接照表套**，不再查字体、不再比较、不再反过来问你「用哪个字体」.
设置页自带一页面板，五类用途 × 中文/西文都能换成你机器上任意字体。

适用 Windows（GDI 家族名 + Office 字体槽）。思源字体需自行安装。

---

## 为什么需要它

模型每次排版都要先纠结字体：查一遍已装字体、比较黑体还是宋体、再问一遍用哪个。
来回几轮，token 花在挑字体上，产出的字体名还经常是错的 ——「思源黑体 Medium」和
「思源黑体 CN Medium」差一个词，Word 会静默换成别的字体，你还未必看得出来。

这个插件把「用哪个」写死进提示词，把「有哪些」交给面板：

- 提示词里钉着一张用途表，模型只能照抄
- 再加一段禁令：不查、不比、不问、不猜、不解释
- 想换字体，在面板里改，下一句话就生效

## 默认字体表

| 用途 | 中文 | 西文 |
| --- | --- | --- |
| 标题 | `思源宋体 CN Heavy` | `思源黑体 CN Heavy` |
| 小标题 | `思源黑体 CN Bold` | `思源黑体 CN Bold` |
| 正文 | `思源黑体 CN Medium` | `思源黑体 CN Medium` |
| 加粗 | `思源黑体 CN Bold` | `思源黑体 CN Bold` |
| 图表注 | `思源黑体 CN Regular` | `思源黑体 CN Regular` |

正文一律黑体，宋体只给标题。表格里写的是 **GDI 家族名（face 名）**，不是家族简称。

## 面板

**设置 → 字体**。

| 区块 | 作用 |
| --- | --- |
| 总开关 | 关掉立刻停止注入，模型回到自己挑字体 |
| 字体表 | 5 个用途 × 中文/西文，输入框带下拉，可搜全部已装字体 |
| 恢复默认 | 一键回上面那张表 |
| 重读字体 | 装了新字体后重新扫描候选 |
| 看注入的提示词 | 显示实际喂给模型的原文 |

选中一个字重时，如果它需要额外的 `bold=true` 才能拿对（思源宋体 400/700 共用一个
家族名就是这么坑），面板会自动帮你带上。

## 安装

在 DSH 插件市场里搜 `dsh-global-fonts`，或在 profile 里手动链接：

```bash
# profile 目录，形如 ~/.dsh/profiles/desktop
# 1. package.json 的 dependencies 加
#      "dsh-global-fonts": "file:/path/to/dsh-global-fonts"
#    dsh.profile.bundles 加
#      "dsh-global-fonts"
# 2. 建软链，不想让包管理器改 store 的话直接 junction 最省事
#      node_modules/dsh-global-fonts -> /path/to/dsh-global-fonts
# 3. 重启 DSH
```

改 `index.js` / `client.js` 要重启；面板里改字体值不用。

## 字体候选从哪来

按顺序找，前一个没有就用后一个：

1. **office-fonts skill 的索引** —— `$DSH_HOME/skills/office-fonts/cache/fonts.json`，
   带完整字重信息（哪个是 Medium、哪个是 Heavy、哪个要 bold），最准
2. **Windows GDI 扫描** —— 用 PowerShell 跑 `System.Drawing.Text.InstalledFontCollection`
   枚举家族名，缓存到 `~/.dsh/global-fonts/fonts-cache.json`。只有名字，没有字重区分
3. 都没有 —— 面板输入框直接手打字体名，照样能用

装了 office-fonts skill 的话优先用它；没装也能跑。

## 配置

| 变量 | 作用 |
| --- | --- |
| `DSH_GLOBAL_FONTS=off` | 整体停用，不注入任何提示词 |
| `DSH_GLOBAL_FONTS_HOME` | 数据目录，默认 `~/.dsh/global-fonts` |
| `DSH_FONT_CACHE` | 指定 office-fonts 索引的绝对路径 |

数据文件：

```
~/.dsh/global-fonts/state.json       开关 + 五个用途 × 中/西文
~/.dsh/global-fonts/last-prompt.txt  最近一次注入的原文
~/.dsh/global-fonts/fonts-cache.json GDI 扫描缓存
```

## 已知限制

- 只在 Windows 上有意义：字体名是 GDI 家族名，写的是 Office 的 eastAsia / ascii 槽
- 不装思源字体也能用，但默认表里的名字要改成你机器上真有的字体
- 系统扫描拿不到字重，同一个家族的不同字重会显示成多个并列名字

## 许可

MIT