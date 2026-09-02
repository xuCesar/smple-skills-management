import { useMemo, useState } from 'react'

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
  enabled: boolean
  tags: string[]
}

const initialSkills: Skill[] = [
  { id: 'ui-ux-pro-max', name: 'ui-ux-pro-max', description: 'UI/UX 设计智能，包含 50+ 风格、161 套配色与响应式布局建议。', category: '设计', version: '1.8.2', updated: '今天 09:42', uses: '12.4k', color: '#f29d74', icon: '✦', enabled: true, tags: ['设计', '前端', '推荐'] },
  { id: 'frontend-app-builder', name: 'frontend-app-builder', description: '从零构建高质量前端应用，关注视觉系统、交互状态与浏览器验证。', category: '开发', version: '0.1.2', updated: '昨天 18:30', uses: '8.7k', color: '#7aa2f7', icon: '⌘', enabled: true, tags: ['React', 'Vite', '工作流'] },
  { id: 'code-review', name: 'code-review', description: '以正确性、安全性和回归风险为重点，审查固定范围内的代码变更。', category: '开发', version: '1.3.0', updated: '8 月 28 日', uses: '6.3k', color: '#a98cf4', icon: '◒', enabled: true, tags: ['质量', '审查'] },
  { id: 'data-analytics', name: 'data-analytics', description: '将数据问题路由到分析、指标诊断、可视化与报告等专门工作流。', category: '数据', version: '0.2.35', updated: '8 月 27 日', uses: '4.8k', color: '#6dc9b3', icon: '▥', enabled: false, tags: ['分析', '报告'] },
  { id: 'documents', name: 'documents', description: '创建、编辑和审阅 Word 文档，支持评论、修订与格式检查。', category: '效率', version: '26.826', updated: '8 月 24 日', uses: '3.1k', color: '#e5c16c', icon: '▤', enabled: true, tags: ['文档', 'Office'] },
  { id: 'browser-control', name: 'browser-control', description: '控制内置浏览器，完成导航、表单填充和可见页面状态检查。', category: '自动化', version: '26.820', updated: '8 月 20 日', uses: '2.6k', color: '#6ec1e4', icon: '◉', enabled: true, tags: ['浏览器', '自动化'] },
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
  const [selectedId, setSelectedId] = useState(initialSkills[0].id)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('全部')
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState('')

  const selected = skills.find((skill) => skill.id === selectedId) ?? skills[0]
  const filteredSkills = useMemo(() => skills.filter((skill) => {
    const matchesQuery = `${skill.name} ${skill.description} ${skill.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === '全部' || skill.category === filter
    return matchesQuery && matchesFilter
  }), [skills, query, filter])

  const enabledCount = skills.filter((skill) => skill.enabled).length
  const toggleSkill = (id: string) => {
    setSkills((current) => current.map((skill) => skill.id === id ? { ...skill, enabled: !skill.enabled } : skill))
    const skill = skills.find((item) => item.id === id)
    if (skill) {
      setToast(`${skill.name} 已${skill.enabled ? '停用' : '启用'}`)
      window.setTimeout(() => setToast(''), 2200)
    }
  }

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
            <div className="page-heading"><div><h1>全部技能</h1><p>管理已安装的技能，按需启用你的工作流。</p></div><button className="primary-button" onClick={() => setShowModal(true)}><Icon size={16}>＋</Icon> 安装技能</button></div>
            <div className="summary-row"><div className="summary-item"><span className="summary-number">{skills.length + 18}</span><span>个技能</span></div><div className="summary-divider" /><div className="summary-item"><span className="summary-number accent">{enabledCount}</span><span>已启用</span></div><div className="summary-divider" /><div className="summary-item"><span className="summary-number warm">3</span><span>可更新</span></div></div>
            <div className="toolbar"><div className="search-box"><Icon size={16}>⌕</Icon><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索技能名称或描述" /><kbd>⌘ K</kbd></div><div className="filter-tabs">{categoryFilters.map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div><button className="sort-button"><Icon size={14}>↕</Icon> 最近更新</button></div>
            <div className="skills-list">
              {filteredSkills.map((skill) => <SkillCard key={skill.id} skill={skill} selected={skill.id === selectedId} onSelect={() => setSelectedId(skill.id)} onToggle={() => toggleSkill(skill.id)} />)}
              {filteredSkills.length === 0 && <div className="empty-state"><div className="empty-icon">⌕</div><h3>没有找到匹配的技能</h3><p>试试搜索其他关键词或切换分类。</p></div>}
            </div>
            <div className="list-footer">显示 {filteredSkills.length} / {skills.length} 个已安装技能 <button>查看全部 <Icon size={13}>→</Icon></button></div>
          </section>

          <aside className="detail-panel">
            <div className="detail-top"><span className="detail-label">技能详情</span><button className="icon-button subtle"><Icon size={16}>⋯</Icon></button></div>
            <div className="detail-hero"><div className="skill-icon-large" style={{ background: `${selected.color}1f`, color: selected.color }}>{selected.icon}</div><div><h2>{selected.name}</h2><div className="version-line"><span>v{selected.version}</span><span className="verified"><Icon size={12}>✓</Icon> 已验证</span></div></div></div>
            <p className="detail-description">{selected.description}</p>
            <div className="detail-actions"><button className={`toggle-button ${selected.enabled ? 'on' : ''}`} onClick={() => toggleSkill(selected.id)}><span className="toggle-knob" /> {selected.enabled ? '已启用' : '已停用'}</button><button className="secondary-button" onClick={() => setToast('已打开技能文档')}><Icon size={14}>↗</Icon> 查看文档</button></div>
            <div className="detail-divider" />
            <div className="detail-section"><div className="section-title">技能信息</div><div className="meta-list"><div><span>来源</span><strong>OpenAI Skills</strong></div><div><span>最后更新</span><strong>{selected.updated}</strong></div><div><span>累计使用</span><strong>{selected.uses} 次</strong></div><div><span>兼容环境</span><strong>桌面端 · CLI</strong></div></div></div>
            <div className="detail-section"><div className="section-title">标签</div><div className="tag-list">{selected.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></div>
            <div className="detail-note"><Icon size={15}>✧</Icon><div><strong>工作流提示</strong><p>启用后，新任务会自动参考此技能的最佳实践。</p></div></div>
          </aside>
        </div>
      </main>
      {showModal && <InstallModal onClose={() => setShowModal(false)} onInstall={() => { setShowModal(false); setToast('技能安装任务已加入队列'); window.setTimeout(() => setToast(''), 2200) }} />}
      {toast && <div className="toast"><span className="toast-check">✓</span>{toast}</div>}
    </div>
  )
}

function SkillCard({ skill, selected, onSelect, onToggle }: { skill: Skill; selected: boolean; onSelect: () => void; onToggle: () => void }) {
  return <article className={`skill-card ${selected ? 'selected' : ''}`} onClick={onSelect}><div className="skill-card-icon" style={{ background: `${skill.color}18`, color: skill.color }}>{skill.icon}</div><div className="skill-card-body"><div className="skill-card-title"><h3>{skill.name}</h3>{skill.tags.includes('推荐') && <span className="recommend">推荐</span>}</div><p>{skill.description}</p><div className="skill-card-meta"><span>{skill.category}</span><span className="meta-dot">·</span><span>v{skill.version}</span><span className="meta-dot">·</span><span>更新于 {skill.updated}</span></div></div><button aria-label={`${skill.enabled ? '停用' : '启用'} ${skill.name}`} className={`switch ${skill.enabled ? 'on' : ''}`} onClick={(event) => { event.stopPropagation(); onToggle() }}><span /></button></article>
}

function InstallModal({ onClose, onInstall }: { onClose: () => void; onInstall: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><h2>安装新技能</h2><p>从技能目录添加到你的工作区</p></div><button className="icon-button subtle" onClick={onClose}>×</button></div><div className="dropzone"><div className="upload-icon">↑</div><strong>拖拽技能文件到这里</strong><span>支持 .skill、.zip 格式</span><button>选择文件</button></div><div className="modal-divider"><span>或</span></div><div className="url-input"><Icon size={15}>⌁</Icon><input placeholder="粘贴技能仓库地址" /></div><div className="modal-footer"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={onInstall}><Icon size={15}>＋</Icon> 开始安装</button></div></div></div>
}
