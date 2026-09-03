import { useEffect, useMemo, useState } from 'react'
import { createConfigStore, type ManagedConfig } from './domain/config'
import { scanSkillDirectories, type DiscoverySnapshot } from './domain/discovery'
import { createPublicGitHubSourceAdapter, parsePublicRepository, type SkillReview } from './domain/github'

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
}

const initialSkills: Skill[] = [
  { id: 'ui-ux-pro-max', name: 'ui-ux-pro-max', description: 'UI/UX 设计智能，包含 50+ 风格、161 套配色与响应式布局建议。', category: '设计', version: '1.8.2', updated: '今天 09:42', uses: '12.4k', color: '#f29d74', icon: '✦', tags: ['设计', '前端', '推荐'] },
  { id: 'frontend-app-builder', name: 'frontend-app-builder', description: '从零构建高质量前端应用，关注视觉系统、交互状态与浏览器验证。', category: '开发', version: '0.1.2', updated: '昨天 18:30', uses: '8.7k', color: '#7aa2f7', icon: '⌘', tags: ['React', 'Vite', '工作流'] },
  { id: 'code-review', name: 'code-review', description: '以正确性、安全性和回归风险为重点，审查固定范围内的代码变更。', category: '开发', version: '1.3.0', updated: '8 月 28 日', uses: '6.3k', color: '#a98cf4', icon: '◒', tags: ['质量', '审查'] },
  { id: 'data-analytics', name: 'data-analytics', description: '将数据问题路由到分析、指标诊断、可视化与报告等专门工作流。', category: '数据', version: '0.2.35', updated: '8 月 27 日', uses: '4.8k', color: '#6dc9b3', icon: '▥', tags: ['分析', '报告'] },
  { id: 'documents', name: 'documents', description: '创建、编辑和审阅 Word 文档，支持评论、修订与格式检查。', category: '效率', version: '26.826', updated: '8 月 24 日', uses: '3.1k', color: '#e5c16c', icon: '▤', tags: ['文档', 'Office'] },
  { id: 'browser-control', name: 'browser-control', description: '控制内置浏览器，完成导航、表单填充和可见页面状态检查。', category: '自动化', version: '26.820', updated: '8 月 20 日', uses: '2.6k', color: '#6ec1e4', icon: '◉', tags: ['浏览器', '自动化'] },
]

const categories = [
  { label: '全部技能', icon: '▦', count: 24 },
  { label: '收藏', icon: '☆', count: 6 },
  { label: '最近使用', icon: '◷', count: 8 },
]

const categoryFilters = ['全部', '开发', '设计', '数据', '效率', '自动化']

function Icon({ children, size = 18 }: { children: string; size?: number }) {
  return <span className="icon" style={{ fontSize: size }}>{children}</span>
}

export function App() {
  const [skills, setSkills] = useState(initialSkills)
  const [config, setConfig] = useState<ManagedConfig | null>(null)
  const [snapshot, setSnapshot] = useState<DiscoverySnapshot | null>(null)
  const [scanning, setScanning] = useState(false)
  const [selectedId, setSelectedId] = useState(initialSkills[0].id)
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
      const discovered = next.skills.map((skill, index) => ({ id: skill.id, name: skill.name, description: skill.description || '暂无描述', category: '开发', version: '—', updated: '刚刚扫描', uses: '—', color: ['#f29d74', '#7aa2f7', '#a98cf4', '#6dc9b3'][index % 4], icon: '✦', tags: ['本地', skill.source === 'default' ? '默认目录' : '自定义目录'] }))
      setSkills(discovered)
      setSelectedId(discovered[0]?.id ?? '')
      setToast(`扫描完成：发现 ${next.skills.length} 个技能`)
    } catch { setToast('扫描失败，请检查目录权限') } finally { setScanning(false); window.setTimeout(() => setToast(''), 2200) }
  }

  const selected = skills.find((skill) => skill.id === selectedId) ?? skills[0]
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
          {categories.map((item) => <button key={item.label} className={`nav-item ${item.label === '全部技能' ? 'active' : ''}`}><Icon>{item.icon}</Icon><span>{item.label}</span><span className="nav-count">{item.count}</span></button>)}
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
            <div className="summary-row"><div className="summary-item"><span className="summary-number">{skills.length + 18}</span><span>个技能</span></div><div className="summary-divider" /><div className="summary-item"><span className="summary-number accent">{skills.length}</span><span>已发现</span></div><div className="summary-divider" /><div className="summary-item"><span className="summary-number warm">3</span><span>可更新</span></div></div>
            <div className="toolbar"><div className="search-box"><Icon size={16}>⌕</Icon><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索技能名称或描述" /><kbd>⌘ K</kbd></div><div className="filter-tabs">{categoryFilters.map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div><button className="sort-button" onClick={scan} disabled={scanning}><Icon size={14}>↻</Icon> {scanning ? '扫描中…' : snapshot ? '重新扫描' : '扫描目录'}</button></div>
            <div className="skills-list">
              {filteredSkills.map((skill) => <SkillCard key={skill.id} skill={skill} selected={skill.id === selectedId} onSelect={() => setSelectedId(skill.id)} />)}
              {filteredSkills.length === 0 && <div className="empty-state"><div className="empty-icon">⌕</div><h3>没有找到匹配的技能</h3><p>试试搜索其他关键词或切换分类。</p></div>}
            </div>
            <div className="list-footer">显示 {filteredSkills.length} / {skills.length} 个已安装技能 <button>查看全部 <Icon size={13}>→</Icon></button></div>
          </section>

          <aside className="detail-panel">
            <div className="detail-top"><span className="detail-label">技能详情</span><button className="icon-button subtle"><Icon size={16}>⋯</Icon></button></div>
            <div className="detail-hero"><div className="skill-icon-large" style={{ background: `${selected.color}1f`, color: selected.color }}>{selected.icon}</div><div><h2>{selected.name}</h2><div className="version-line"><span>v{selected.version}</span><span className="verified"><Icon size={12}>✓</Icon> 已验证</span></div></div></div>
            <p className="detail-description">{selected.description}</p>
            <div className="detail-actions"><button className="primary-button" onClick={() => setToast('正在检查更新…')}><Icon size={14}>↻</Icon> 检查更新</button><button className="secondary-button" onClick={() => setToast('已打开技能文档')}><Icon size={14}>↗</Icon> 查看文档</button></div>
            <div className="detail-divider" />
            <div className="detail-section"><div className="section-title">技能信息</div><div className="meta-list"><div><span>来源</span><strong>OpenAI Skills</strong></div><div><span>最后更新</span><strong>{selected.updated}</strong></div><div><span>累计使用</span><strong>{selected.uses} 次</strong></div><div><span>兼容环境</span><strong>桌面端 · CLI</strong></div></div></div>
            <div className="detail-section"><div className="section-title">标签</div><div className="tag-list">{selected.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></div>
            <div className="detail-note"><Icon size={15}>✧</Icon><div><strong>管理提示</strong><p>Skill library 只记录发现与来源，不会改变外部代理的读取行为。</p></div></div>
          </aside>
        </div>
      </main>
      {showModal && <InstallModal onClose={() => setShowModal(false)} onInstall={() => { setShowModal(false); setToast('安装写入尚未接入，请先保存 review 结果'); window.setTimeout(() => setToast(''), 2200) }} />}
      {toast && <div className="toast"><span className="toast-check">✓</span>{toast}</div>}
    </div>
  )
}

function SkillCard({ skill, selected, onSelect }: { skill: Skill; selected: boolean; onSelect: () => void }) {
  return <article className={`skill-card ${selected ? 'selected' : ''}`} onClick={onSelect}><div className="skill-card-icon" style={{ background: `${skill.color}18`, color: skill.color }}>{skill.icon}</div><div className="skill-card-body"><div className="skill-card-title"><h3>{skill.name}</h3>{skill.tags.includes('推荐') && <span className="recommend">推荐</span>}</div><p>{skill.description}</p><div className="skill-card-meta"><span>{skill.category}</span><span className="meta-dot">·</span><span>v{skill.version}</span><span className="meta-dot">·</span><span>更新于 {skill.updated}</span></div></div><span className="library-state">已发现</span></article>
}

function InstallModal({ onClose, onInstall }: { onClose: () => void; onInstall: () => void }) {
  const [locator, setLocator] = useState('')
  const [review, setReview] = useState<SkillReview | null>(null)
  const [error, setError] = useState('')
  const inspect = async () => { try { const parsed = parsePublicRepository(locator); setReview(await createPublicGitHubSourceAdapter().review(parsed)); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : '来源格式不正确') } }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><h2>{review ? '审查技能来源' : '安装新技能'}</h2><p>{review ? '确认来源和文件后再选择安装位置' : '从公开 GitHub 仓库添加到 Skill library'}</p></div><button className="icon-button subtle" onClick={onClose}>×</button></div>{review ? <><div className="review-source"><span className="skill-icon-large">⌘</span><div><strong>{review.source.owner}/{review.source.repo}</strong><span>{review.source.canonical}</span><span>Skill 路径：{review.skillPath}</span></div></div><div className="review-box"><div className="review-title">文件清单 · {review.revision}</div>{review.files.map((file) => <div className="review-file" key={file.path}><Icon size={13}>{file.kind === 'skill' ? '▤' : file.kind === 'script' || file.kind === 'executable' || file.kind === 'symlink' ? '⚠' : '□'}</Icon><span>{file.path}</span><small>{file.kind === 'skill' ? '入口文件' : file.kind === 'file' ? '普通文件' : '风险文件'}</small></div>)}</div><pre className="review-content">{review.skillContent}</pre>{review.riskFlags.length > 0 && <div className="form-error">风险提示：{review.riskFlags.join('；')}</div>}<div className="target-row"><span>安装到</span><select defaultValue="~/.agents/skills"><option>~/.agents/skills</option><option>~/.codex/skills</option><option>~/.claude/skills</option></select></div><div className="modal-footer"><button className="secondary-button" onClick={() => setReview(null)}>返回</button><button className="primary-button" onClick={onInstall} disabled><Icon size={15}>✓</Icon> 安装写入尚未接入</button></div></> : <><div className="dropzone"><div className="upload-icon">↑</div><strong>拖拽技能文件到这里</strong><span>支持 .skill、.zip 格式</span><button>选择文件</button></div><div className="modal-divider"><span>或</span></div><div className="url-input"><Icon size={15}>⌁</Icon><input value={locator} onChange={(event) => setLocator(event.target.value)} placeholder="粘贴 GitHub 仓库地址或 owner/repo" /></div>{error && <div className="form-error">{error}</div>}<div className="modal-footer"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={() => void inspect()}><Icon size={15}>⌕</Icon> 审查来源</button></div></>}</div></div>
}
