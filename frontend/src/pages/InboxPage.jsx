import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    clearAllNotifications,
} from '../services/notificationService.js'
import { getSocket } from '../services/socketService.js'
import '../App.css'
import './InboxPage.css'

function hl(text, query) {
    if (!query || !text) return text
    const q = query.trim()
    if (!q) return text
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    return String(text).split(re).map((p, i) =>
        p.toLowerCase() === q.toLowerCase()
            ? <mark key={i} className="inbox-hl">{p}</mark>
            : p
    )
}

function relTime(iso) {
    if (!iso) return 'just now'
    const ms = Date.now() - new Date(iso)
    const s = Math.floor(ms / 1000)
    if (s < 60) return 'just now'
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 7) return `${d}d ago`
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getCat(n) {
    const t = ((n.type || '') + ' ' + (n.message || '')).toLowerCase()
    if (t.includes('project') || t.includes('milestone') || t.includes('initiative')) return 'PROJECT'
    if (t.includes('task') || t.includes('assigned') || t.includes('board') || t.includes('card') || t.includes('sprint')) return 'TASK'
    if (t.includes('mention') || t.includes('comment') || t.includes('team') || t.includes('member')) return 'TEAM'
    return 'SYSTEM'
}

const CMETA = {
    PROJECT: { icon: '🚀', label: 'Project', color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe' },
    TASK:    { icon: '📋', label: 'Task',    color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
    TEAM:    { icon: '👥', label: 'Team',    color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    SYSTEM:  { icon: '⚡', label: 'System',  color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' },
}


export default function InboxPage() {
    const nav = useNavigate()
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('ALL')
    const [q, setQ] = useState('')
    const [sel, setSel] = useState(null)
    const [toast, setToast] = useState('')
    const [err, setErr] = useState('')
    const searchRef = useRef(null)

    function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

    useEffect(() => {
        setLoading(true)
        getNotifications()
            .then(d => setItems(Array.isArray(d) ? d : d?.data || []))
            .catch(e => setErr(e.message))
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => {
        const socket = getSocket()
        if (!socket) return
        function onNew(data) {
            if (!data) return
            const n = { id: data.id || `live-${Date.now()}`, type: data.type || 'SYSTEM', message: data.message || 'New workspace activity', isRead: false, createdAt: data.createdAt || new Date().toISOString() }
            setItems(p => [n, ...p])
            flash(`🔔 ${n.message}`)
        }
        function onTask(task) { if (task?.title) onNew({ type: 'TASK', message: `Task updated: "${task.title}" → ${task.status || 'Active'}` }) }
        function onProj(project) { if (project?.name) onNew({ type: 'PROJECT', message: `Project updated: "${project.name}" is ${project.status || 'Active'}` }) }
        socket.on('notification:new', onNew)
        socket.on('task:created', onTask); socket.on('task:updated', onTask)
        socket.on('project:created', onProj); socket.on('project:updated', onProj)
        return () => {
            socket.off('notification:new', onNew)
            socket.off('task:created', onTask); socket.off('task:updated', onTask)
            socket.off('project:created', onProj); socket.off('project:updated', onProj)
        }
    }, [])

    async function markRead(id) {
        await markNotificationRead(id).catch(() => null)
        setItems(p => p.map(n => n.id === id ? { ...n, isRead: true } : n))
        window.dispatchEvent(new CustomEvent('notification:read'))
    }
    async function markAll() {
        await markAllNotificationsRead().catch(() => null)
        setItems(p => p.map(n => ({ ...n, isRead: true })))
        flash('All messages marked as read.')
        window.dispatchEvent(new CustomEvent('notification:read'))
    }
    async function del(id, e) {
        e?.stopPropagation()
        await deleteNotification(id).catch(() => null)
        setItems(p => p.filter(n => n.id !== id))
        if (sel === id) setSel(null)
        flash('Message removed.')
    }
    async function clearAll() {
        if (!window.confirm('Clear your entire inbox?')) return
        await clearAllNotifications().catch(() => null)
        setItems([]); setSel(null); flash('Inbox cleared.')
    }
    function open(n) { if (!n.isRead) markRead(n.id); setSel(sel === n.id ? null : n.id) }
    function goTo(n) {
        const t = (n.message || '').toLowerCase()
        if (t.includes('project') || t.includes('milestone')) nav('/projects')
        else if (t.includes('team') || t.includes('squad') || t.includes('roster')) nav('/teams')
        else nav('/tasks')
    }

    const counts = useMemo(() => ({
        total: items.length,
        unread: items.filter(n => !n.isRead).length,
        task: items.filter(n => getCat(n) === 'TASK').length,
        project: items.filter(n => getCat(n) === 'PROJECT').length,
        team: items.filter(n => getCat(n) === 'TEAM').length,
        system: items.filter(n => getCat(n) === 'SYSTEM').length,
    }), [items])

    const filtered = useMemo(() => items.filter(n => {
        const cat = getCat(n)
        const mf = filter === 'ALL' || (filter === 'UNREAD' && !n.isRead) || filter === cat
        const mq = !q.trim() || (n.message || '').toLowerCase().includes(q.trim().toLowerCase())
        return mf && mq
    }), [items, filter, q])

    const selItem = items.find(n => n.id === sel) || null

    const TABS = [
        { id: 'ALL', label: 'All', count: counts.total },
        { id: 'UNREAD', label: 'Unread', count: counts.unread },
        { id: 'TASK', label: 'Tasks', count: counts.task },
        { id: 'PROJECT', label: 'Projects', count: counts.project },
        { id: 'TEAM', label: 'Team', count: counts.team },
        { id: 'SYSTEM', label: 'System', count: counts.system },
    ]

    return (
        <div className="inbox-root">
            {toast && <div className="inbox-toast" role="status">{toast}</div>}

            {/* Header */}
            <div className="inbox-header">
                <div>
                    <p className="eyebrow">Communications &amp; Updates</p>
                    <h1 className="inbox-title">Inbox</h1>
                    <p className="inbox-subtitle">Task updates, project milestones, and team mentions — all in one place.</p>
                </div>
                <div className="inbox-header-actions">
                    <button className="inbox-btn" onClick={markAll} disabled={counts.unread === 0}>✓ Mark All Read</button>
                    <button className="inbox-btn inbox-btn--danger" onClick={clearAll} disabled={items.length === 0}>🗑 Clear</button>
                </div>
            </div>

            {err && <div className="inbox-err" role="alert">⚠️ {err} <button onClick={() => setErr('')}>✕</button></div>}

            {/* Metrics */}
            <div className="inbox-metrics">
                {[
                    { label: 'Total', value: counts.total, icon: '📥', c: '#6366f1' },
                    { label: 'Unread', value: counts.unread, icon: '🔴', c: '#ef4444' },
                    { label: 'Tasks', value: counts.task, icon: '📋', c: '#059669' },
                    { label: 'Projects', value: counts.project, icon: '🚀', c: '#4f46e5' },
                ].map(m => (
                    <div key={m.label} className="inbox-metric">
                        <span className="inbox-metric-icon" style={{ color: m.c }}>{m.icon}</span>
                        <div>
                            <div className="inbox-metric-val" style={{ color: m.c }}>{m.value}</div>
                            <div className="inbox-metric-lbl">{m.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Body: List + Detail */}
            <div className="inbox-body">
                {/* List Column */}
                <div className="inbox-list-col">
                    {/* Search */}
                    <div className="inbox-search">
                        <span className="inbox-search-ico">⌕</span>
                        <input ref={searchRef} type="text" placeholder="Search messages…" value={q} onChange={e => setQ(e.target.value)} className="inbox-search-inp" />
                        {q && <button className="inbox-search-clr" onClick={() => { setQ(''); searchRef.current?.focus() }}>✕</button>}
                    </div>

                    {/* Tabs */}
                    <div className="inbox-tabs">
                        {TABS.map(tab => (
                            <button key={tab.id} className={`inbox-tab ${filter === tab.id ? 'active' : ''}`} onClick={() => setFilter(tab.id)}>
                                {tab.label}
                                {tab.count > 0 && <span className={`inbox-tab-count ${filter === tab.id ? 'active' : ''}`}>{tab.count}</span>}
                            </button>
                        ))}
                    </div>

                    {/* Items */}
                    <div className="inbox-list">
                        {loading ? (
                            <div className="inbox-empty"><div className="inbox-spinner" /><p>Loading messages…</p></div>
                        ) : filtered.length === 0 ? (
                            <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                                <h3 style={{ margin: '0 0 6px', color: '#111827' }}>All caught up!</h3>
                                <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>{q ? `No results for "${q}"` : 'No messages here yet.'}</p>
                            </div>
                        ) : filtered.map(n => {
                            const cat = getCat(n); const m = CMETA[cat]
                            const isOpen = sel === n.id
                            return (
                                <div key={n.id} className={`inbox-row ${!n.isRead ? 'unread' : ''} ${isOpen ? 'selected' : ''}`} onClick={() => open(n)}>
                                    <div className="inbox-row-dot">{!n.isRead && <span className="inbox-dot" />}</div>
                                    <div className="inbox-row-ico" style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>{m.icon}</div>
                                    <div className="inbox-row-body">
                                        <div className="inbox-row-head">
                                            <span className="inbox-cat-badge" style={{ background: m.bg, color: m.color }}>{m.label}</span>
                                            <span className="inbox-row-time">{relTime(n.createdAt)}</span>
                                        </div>
                                        <p className={`inbox-row-msg ${!n.isRead ? 'bold' : ''}`}>{hl(n.message, q)}</p>
                                    </div>
                                    <div className="inbox-row-acts" onClick={e => e.stopPropagation()}>
                                        <button className="inbox-row-act" onClick={() => { n.isRead ? setItems(p => p.map(x => x.id === n.id ? { ...x, isRead: false } : x)) : markRead(n.id); flash(n.isRead ? 'Marked unread' : 'Marked read') }} title={n.isRead ? 'Mark unread' : 'Mark read'}>{n.isRead ? '◎' : '●'}</button>
                                        <button className="inbox-row-act del" onClick={e => del(n.id, e)} title="Delete">✕</button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Detail Column */}
                <div className={`inbox-detail-col ${selItem ? 'open' : ''}`}>
                    {selItem ? (() => {
                        const cat = getCat(selItem); const m = CMETA[cat]
                        return (
                            <div className="inbox-detail">
                                <div className="inbox-detail-hd">
                                    <div className="inbox-detail-ico" style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>{m.icon}</div>
                                    <div style={{ flex: 1 }}>
                                        <span className="inbox-cat-badge" style={{ background: m.bg, color: m.color }}>{m.label}</span>
                                        <div className="inbox-detail-ts">{relTime(selItem.createdAt)}</div>
                                    </div>
                                    <button className="inbox-detail-close" onClick={() => setSel(null)} title="Close">✕</button>
                                </div>
                                <div className="inbox-detail-body">
                                    <p className="inbox-detail-msg">{selItem.message}</p>
                                    <div className="inbox-detail-grid">
                                        <div className="inbox-detail-row"><span className="inbox-detail-lbl">Category</span><span>{m.label}</span></div>
                                        <div className="inbox-detail-row"><span className="inbox-detail-lbl">Status</span><span className={`inbox-status ${selItem.isRead ? 'read' : 'unread'}`}>{selItem.isRead ? '✓ Read' : '● Unread'}</span></div>
                                        <div className="inbox-detail-row"><span className="inbox-detail-lbl">Received</span><span>{selItem.createdAt ? new Date(selItem.createdAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'}</span></div>
                                    </div>
                                </div>
                                <div className="inbox-detail-ft">
                                    <button className="inbox-detail-cta" onClick={() => goTo(selItem)}>Open in Workspace →</button>
                                    <button className="inbox-detail-act" onClick={() => { selItem.isRead ? setItems(p => p.map(x => x.id === selItem.id ? { ...x, isRead: false } : x)) : markRead(selItem.id) }}>{selItem.isRead ? 'Mark Unread' : 'Mark Read'}</button>
                                    <button className="inbox-detail-act danger" onClick={e => del(selItem.id, e)}>Delete</button>
                                </div>
                            </div>
                        )
                    })() : (
                        <div className="inbox-detail-empty">
                            <div style={{ fontSize: 52, marginBottom: 12 }}>📬</div>
                            <h3>Select a message</h3>
                            <p>Click any message in the list to read its full details here.</p>
                            <div className="inbox-tips">
                                <div className="inbox-tip"><span>🔔</span><span>Live messages arrive instantly via WebSocket</span></div>
                                <div className="inbox-tip"><span>🚀</span><span>Click "Open in Workspace" to jump to the relevant page</span></div>
                                <div className="inbox-tip"><span>✓</span><span>Mark all read in one click from the header</span></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
