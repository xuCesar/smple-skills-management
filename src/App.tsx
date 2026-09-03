import { useEffect, useMemo, useState } from 'react'
import { createConfigStore, type ManagedConfig } from './domain/config'
import { scanSkillDirectories, type DiscoverySnapshot } from './domain/discovery'
import { createPublicGitHubSourceAdapter, parsePublicRepository, type SkillReview } from './domain/github'
import { groupDiscoveredSkills } from './domain/identity'
import { installReviewedSkill, lifecycleAvailable, reviewLifecycleSource } from './domain/tauri-lifecycle'

type Skill = {
  id: string
  name: string
  description: string
  category: string
  version: string
  updated: string
  uses: string
  color: string
  icon: string
  tags: string[]
  installations?: Array<{ path: string; source: 'default' | 'user' }>
}

const emptySkill: Skill = { id: '', name: '暂无选中 Skill', description: '扫描目录后将在这里显示 Skill 详情。', category: '—', version: '—', updated: '—', uses: '—', color: '#94a3b8', icon: '⌁', tags: [] }

const categories = [
  { label: '全部技能', icon: '▦' },
  { label: '收藏', icon: '☆' },
  { label: '最近使用', icon: '◷' },
]

const categoryFilters = ['全部', '开发', '设计', '数据', '效率', '自动化']

function Icon({ children, size = 18 }: { children: string; size?: number }) {
  return <span className="icon" style={{ fontSize: size }}>{children}</span>
}

export function App() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [config, setConfig] = useState<ManagedConfig | null>(null)
  const [snapshot, setSnapshot] = useState<DiscoverySnapshot | null>(null)
  const [scanning, setScanning] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('全部')
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { createConfigStore().load().then(setConfig).catch(() => setToast('配置读取失败，已使用默认设置')) }, [])

  const scan = async () => {
    if (!config) return
    setScanning(true)
    try {
      const next = await scanSkillDirectories(config.directories, config.installations)
      setSnapshot(next)
      const discovered = groupDiscoveredSkills(next.skills).map((group, index) => ({ id: group.id, name: group.name, description: group.description || '暂无描述', category: '开发', version: '—', updated: '刚刚扫描', uses: '—', color: ['#f29d74', '#7aa2f7', '#a98cf4', '#6dc9b3'][index % 4], icon: '✦', tags: ['本地', ...(group.installations.some((item) => item.source === 'default') ? ['默认目录'] : []), ...(group.installations.some((item) => item.source === 'user') ? ['自定义目录'] : [])], installations: group.installations.map(({ path, source }) => ({ path, source })) }))
      setSkills(discovered)
      setSelectedId(discovered[0]?.id ?? '')
      setToast(`扫描完成：发现 ${next.skills.length} 个技能`)
    } catch { setToast('扫描失败，请检查目录权限') } finally { setScanning(false); window.setTimeout(() => setToast(''), 2200) }
  }

  const selected = skills.find((skill) => skill.id === selectedId) ?? skills[0] ?? emptySkill
  const filteredSkills = useMemo(() => skills.filter((skill) => {
    const matchesQuery = `${skill.name} ${skill.description} ${skill.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === '全部' || skill.category === filter
    return matchesQuery && matchesFilter
  }), [skills, query, filter])


  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">S</div><div><div className="brand-name">Skill Desk</div><div className="brand-sub">个人技能工作台</div></div></div>
        <div className="workspace-switcher"><span className="workspace-dot" /> 我的工作区 <Icon size={13}>⌄</Icon></div>
        <nav className="primary-nav" aria-label="主导航">
          <div className="nav-label">浏览</div>
          {categories.map((item) => <button key={item.label} className={`nav-item ${item.label === '全部技能' ? 'active' : ''}`}><Icon>{item.icon}</Icon><span>{item.label}</span>{item.label === '全部技能' && <span className="nav-count">{skills.length}</span>}</button>)}
          <div className="nav-label nav-label-spaced">管理</div>
          <button className="nav-item"><Icon>＋</Icon><span>安装技能</span></button>
          <button className="nav-item"><Icon>⚙</Icon><span>设置</span></button>
        </nav>
        <div className="sidebar-footer"><div className="sync-status"><span className="status-dot" /> 已同步 <span className="sync-time">刚刚</span></div><div className="profile"><div className="avatar">XZ</div><div className="profile-name">xuzheng</div><Icon size={14}>⌄</Icon></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>我的工作区</span><Icon size={13}>›</Icon><strong>全部技能</strong></div><div className="top-actions"><button className="icon-button" aria-label="通知"><Icon>♧</Icon><span className="notification-dot" /></button><button className="help-button"><Icon size={15}>?</Icon> 帮助</button></div></header>
        <div className="content-grid">
          <section className="skills-column">
            <div className="page-heading"><div><h1>全部技能</h1><p>发现并管理本机 Skills，按需维护你的工作流。</p></div><button className="primary-button" onClick={() => setShowModal(true)}><Icon size={16}>＋</Icon> 安装技能</button></div>
            <div className="summary-row"><div className="summary-item"><span className="summary-number">{skills.length}</span><span>个技能</span></div><div className="summary-divider" /><div className="summary-item"><span className="summary-number accent">{config?.installations.length ?? 0}</span><span>Managed installations</span></div>{snapshot && <><div className="summary-divider" /><div className="summary-item"><span className="summary-number warm">{snapshot.warnings.length + snapshot.conflicts.length + snapshot.staleInstallations.length}</span><span>需要处理</span></div></>}</div>
            <div className="toolbar"><div className="search-box"><Icon size={16}>⌕</Icon><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索技能名称或描述" /><kbd>⌘ K</kbd></div><div className="filter-tabs">{categoryFilters.map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div><button className="sort-button" onClick={scan} disabled={scanning}><Icon size={14}>↻</Icon> {scanning ? '扫描中…' : snapshot ? '重新扫描' : '扫描目录'}</button></div>
            <div className="skills-list">
              {filteredSkills.map((skill) => <SkillCard key={skill.id} skill={skill} selected={skill.id === selectedId} onSelect={() => setSelectedId(skill.id)} />)}
              {filteredSkills.length === 0 && <div className="empty-state"><div className="empty-icon">⌕</div><h3>{snapshot ? '没有找到匹配的技能' : '尚未扫描 Skill directories'}</h3><p>{snapshot ? '可以调整搜索条件，或检查扫描警告。' : '点击“扫描目录”读取本机 Skills。'}</p></div>}
            </div>
            {snapshot && (snapshot.invalidDirectories.length > 0 || snapshot.warnings.length > 0 || snapshot.conflicts.length > 0 || snapshot.staleInstallations.length > 0) && <div className="scan-notice">扫描需要关注：{snapshot.invalidDirectories.length} 个无效目录，{snapshot.warnings.length} 条警告，{snapshot.conflicts.length} 个 identity conflict，{snapshot.staleInstallations.length} 个 stale installation。</div>}
            <div className="list-footer">显示 {filteredSkills.length} / {skills.length} 个已安装技能 <button>查看全部 <Icon size={13}>→</Icon></button></div>
          </section>

          <aside className="detail-panel">
            <div className="detail-top"><span className="detail-label">技能详情</span><button className="icon-button subtle"><Icon size={16}>⋯</Icon></button></div>
            <div className="detail-hero"><div className="skill-icon-large" style={{ background: `${selected.color}1f`, color: selected.color }}>{selected.icon}</div><div><h2>{selected.name}</h2><div className="version-line"><span>v{selected.version}</span><span className="verified"><Icon size={12}>✓</Icon> 已验证</span></div></div></div>
            <p className="detail-description">{selected.description}</p>
            <div className="detail-actions"><button className="primary-button" onClick={() => setToast('正在检查更新…')}><Icon size={14}>↻</Icon> 检查更新</button><button className="secondary-button" onClick={() => setToast('已打开技能文档')}><Icon size={14}>↗</Icon> 查看文档</button></div>
            <div className="detail-divider" />
            <div className="detail-section"><div className="section-title">技能信息</div><div className="meta-list"><div><span>来源</span><strong>{selected.tags.includes('默认目录') ? '默认 Skill directory' : '本地 Skill directory'}</strong></div><div><span>最后更新</span><strong>{selected.updated}</strong></div><div><span>累计使用</span><strong>{selected.uses} 次</strong></div><div><span>兼容环境</span><strong>桌面端 · CLI</strong></div></div></div>
            <div className="detail-section"><div className="section-title">标签</div><div className="tag-list">{selected.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></div>
            {selected.installations && <div className="detail-section"><div className="section-title">Installation targets</div><div className="installation-list">{selected.installations.map((installation) => <div key={installation.path}><span>{installation.source === 'default' ? '默认' : '自定义'}</span><code>{installation.path}</code></div>)}</div></div>}
            <div className="detail-note"><Icon size={15}>✧</Icon><div><strong>管理提示</strong><p>Skill library 只记录发现与来源，不会改变外部代理的读取行为。</p></div></div>
          </aside>
        </div>
      </main>
      {showModal && <InstallModal onClose={() => setShowModal(false)} onInstalled={() => { setShowModal(false); setToast('安装完成，正在刷新 Skill library'); void scan() }} />}
      {toast && <div className="toast"><span className="toast-check">✓</span>{toast}</div>}
    </div>
  )
}

function SkillCard({ skill, selected, onSelect }: { skill: Skill; selected: boolean; onSelect: () => void }) {
  return <article className={`skill-card ${selected ? 'selected' : ''}`} onClick={onSelect}><div className="skill-card-icon" style={{ background: `${skill.color}18`, color: skill.color }}>{skill.icon}</div><div className="skill-card-body"><div className="skill-card-title"><h3>{skill.name}</h3>{skill.tags.includes('推荐') && <span className="recommend">推荐</span>}</div><p>{skill.description}</p><div className="skill-card-meta"><span>{skill.category}</span><span className="meta-dot">·</span><span>v{skill.version}</span><span className="meta-dot">·</span><span>更新于 {skill.updated}</span></div></div><span className="library-state">已发现</span></article>
}

function InstallModal({ onClose, onInstalled }: { onClose: () => void; onInstalled: () => void }) {
  const [locator, setLocator] = useState('')
  const [review, setReview] = useState<(SkillReview & { reviewId?: string; skillId: string }) | null>(null)
  const [error, setError] = useState('')
  const [directory, setDirectory] = useState('~/.agents/skills')
  const [installing, setInstalling] = useState(false)
  const inspect = async () => {
    try {
      const parsed = parsePublicRepository(locator)
      if (lifecycleAvailable()) {
        const hostReview = await reviewLifecycleSource(locator)
        setReview({ ...hostReview, source: parsePublicRepository(hostReview.source) })
      } else {
        const preview = await createPublicGitHubSourceAdapter().review(parsed)
        setReview({ ...preview, skillId: parsed.repo })
      }
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '来源格式不正确') }
  }
  const install = async () => {
    if (!review) return
    setInstalling(true)
    try {
      if (!lifecycleAvailable()) throw new Error('浏览器预览仅支持 review；请在 Skill Desk 桌面端确认安装')
      if (!review.reviewId) throw new Error('当前 review 不能用于安装，请在桌面端重新审查来源')
      await installReviewedSkill(review.reviewId, directory, review.skillId, true)
      onInstalled()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '安装失败') } finally { setInstalling(false) }
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><h2>{review ? '审查技能来源' : '安装新技能'}</h2><p>{review ? '确认来源和文件后再选择安装位置' : '从公开 GitHub 仓库添加到 Skill library'}</p></div><button className="icon-button subtle" onClick={onClose}>×</button></div>{review ? <><div className="review-source"><span className="skill-icon-large">⌘</span><div><strong>{review.source.owner}/{review.source.repo}</strong><span>{review.source.canonical}</span><span>Skill 路径：{review.skillPath}</span></div></div><div className="review-box"><div className="review-title">文件清单 · {review.revision}</div>{review.files.map((file) => <div className="review-file" key={file.path}><Icon size={13}>{file.kind === 'skill' ? '▤' : file.kind === 'script' || file.kind === 'executable' || file.kind === 'symlink' ? '⚠' : '□'}</Icon><span>{file.path}</span><small>{file.kind === 'skill' ? '入口文件' : file.kind === 'file' ? '普通文件' : '风险文件'}</small></div>)}</div><pre className="review-content">{review.skillContent}</pre>{review.riskFlags.length > 0 && <div className="form-error">风险提示：{review.riskFlags.join('；')}</div>}<div className="target-row"><span>安装到</span><select value={directory} onChange={(event) => setDirectory(event.target.value)}><option>~/.agents/skills</option><option>~/.codex/skills</option><option>~/.claude/skills</option></select></div>{error && <div className="form-error">{error}</div>}<div className="modal-footer"><button className="secondary-button" onClick={() => setReview(null)}>返回</button><button className="primary-button" onClick={() => void install()} disabled={installing || !review}><Icon size={15}>✓</Icon> {installing ? '安装中…' : '确认安装'}</button></div></> : <><div className="dropzone"><div className="upload-icon">↑</div><strong>拖拽技能文件到这里</strong><span>支持 .skill、.zip 格式</span><button>选择文件</button></div><div className="modal-divider"><span>或</span></div><div className="url-input"><Icon size={15}>⌁</Icon><input value={locator} onChange={(event) => setLocator(event.target.value)} placeholder="粘贴 GitHub 仓库地址或 owner/repo" /></div>{error && <div className="form-error">{error}</div>}<div className="modal-footer"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={() => void inspect()}><Icon size={15}>⌕</Icon> 审查来源</button></div></>}</div></div>
}
