import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    clearAllNotifications,
} from '../services/notificationService.js'
import { getCurrentUser } from '../services/authService.js'
import { getOrganizations } from '../services/organizationService.js'
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
    if (t.includes('assigned to you') || t.includes('task_assigned')) return 'ASSIGNED'
    if (t.includes('proposal') || t.includes('task_proposal') || t.includes('review needed') || t.includes('review requested') || t.includes('task_approved')) return 'REVIEW'
    if (t.includes('project') || t.includes('milestone') || t.includes('initiative')) return 'PROJECT'
    if (t.includes('task') || t.includes('board') || t.includes('card') || t.includes('sprint') || t.includes('task_updated')) return 'TASK'
    if (t.includes('mention') || t.includes('comment') || t.includes('team') || t.includes('member')) return 'TEAM'
    return 'SYSTEM'
}

const CMETA = {
    ASSIGNED: { icon: '🎯', label: 'Assigned to Me',    color: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
    REVIEW:   { icon: '💡', label: 'Proposal / Review', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
    TASK:     { icon: '📋', label: 'Task Update',       color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
    PROJECT:  { icon: '🚀', label: 'Project',           color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe' },
    TEAM:     { icon: '👥', label: 'Team',              color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
    SYSTEM:   { icon: '⚡', label: 'System',            color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' },
}

export default function InboxPage() {
    const nav = useNavigate()
    const [items, setItems] = useState([])
    const [currentUser, setCurrentUser] = useState(null)
    const [userRole, setUserRole] = useState('MEMBER')
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('ALL')
    const [q, setQ] = useState('')
    const [sel, setSel] = useState(null)
    const [toast, setToast] = useState('')
    const [err, setErr] = useState('')
    const searchRef = useRef(null)

    function flash(msg) {
        setToast(msg)
        setTimeout(() => setToast(''), 3500)
    }

    // Load User and Notifications
    useEffect(() => {
        setLoading(true)
        Promise.all([
            getCurrentUser().catch(() => null),
            getOrganizations().catch(() => []),
            getNotifications().catch(() => []),
        ])
            .then(([userData, orgs, notifs]) => {
                if (userData) {
                    setCurrentUser(userData)
                }
                const activeRole = (orgs?.[0]?.role || localStorage.getItem('workflowx_registered_role') || 'MEMBER').toUpperCase()
                setUserRole(activeRole)

                const list = Array.isArray(notifs) ? notifs : notifs?.data || []
                setItems(list)

                // If developer has assigned tasks, default view to Assigned
                if (activeRole === 'MEMBER' && list.some(n => getCat(n) === 'ASSIGNED' && !n.isRead)) {
                    setFilter('ASSIGNED')
                } else if (activeRole === 'MANAGER' && list.some(n => getCat(n) === 'REVIEW' && !n.isRead)) {
                    setFilter('REVIEW')
                }
            })
            .catch(e => setErr(e.message))
            .finally(() => setLoading(false))
    }, [])

    // Realtime Notifications via Socket
    useEffect(() => {
        const socket = getSocket()
        if (!socket) return

        function onNew(data) {
            if (!data) return
            // If targeted to a specific userId, verify it matches
            if (data.userId && currentUser?.id && data.userId !== currentUser.id) {
                return
            }
            const n = {
                id: data.id || `live-${Date.now()}`,
                type: data.type || 'SYSTEM',
                message: data.message || 'New workspace activity',
                isRead: false,
                createdAt: data.createdAt || new Date().toISOString(),
            }
            setItems(p => [n, ...p.filter(x => x.id !== n.id)])
            flash(`🔔 ${n.message}`)
            window.dispatchEvent(new CustomEvent('notification:read'))
        }

        socket.on('notification:new', onNew)
        return () => {
            socket.off('notification:new', onNew)
        }
    }, [currentUser])

    async function markRead(id) {
        await markNotificationRead(id).catch(() => null)
        setItems(p => p.map(n => n.id === id ? { ...n, isRead: true } : n))
        window.dispatchEvent(new CustomEvent('notification:read'))
    }

    async function markAll() {
        await markAllNotificationsRead().catch(() => null)
        setItems(p => p.map(n => ({ ...n, isRead: true })))
        flash('All notifications marked as read.')
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
        if (!window.confirm('Clear your entire inbox history?')) return
        await clearAllNotifications().catch(() => null)
        setItems([])
        setSel(null)
        flash('Inbox cleared.')
    }

    function open(n) {
        if (!n.isRead) markRead(n.id)
        setSel(sel === n.id ? null : n.id)
    }

    function goTo(n) {
        const t = ((n.type || '') + ' ' + (n.message || '')).toLowerCase()
        if (t.includes('project') || t.includes('milestone')) {
            nav('/projects')
        } else if (t.includes('proposal')) {
            nav('/tasks?filter=proposals')
        } else if (t.includes('assigned to you') || t.includes('task_assigned')) {
            nav('/tasks?filter=mine')
        } else if (t.includes('team') || t.includes('squad') || t.includes('roster')) {
            nav('/teams')
        } else {
            nav('/tasks')
        }
    }

    const counts = useMemo(() => ({
        total: items.length,
        unread: items.filter(n => !n.isRead).length,
        assigned: items.filter(n => getCat(n) === 'ASSIGNED').length,
        review: items.filter(n => getCat(n) === 'REVIEW').length,
        task: items.filter(n => getCat(n) === 'TASK').length,
        project: items.filter(n => getCat(n) === 'PROJECT').length,
        team: items.filter(n => getCat(n) === 'TEAM').length,
        system: items.filter(n => getCat(n) === 'SYSTEM').length,
    }), [items])

    const filtered = useMemo(() => items.filter(n => {
        const cat = getCat(n)
        const mf = filter === 'ALL'
            || (filter === 'UNREAD' && !n.isRead)
            || filter === cat
        const mq = !q.trim() || (n.message || '').toLowerCase().includes(q.trim().toLowerCase())
        return mf && mq
    }), [items, filter, q])

    const selItem = items.find(n => n.id === sel) || null

    // Tailored Tabs by User Role
    const TABS = useMemo(() => {
        if (userRole === 'MANAGER') {
            return [
                { id: 'ALL', label: 'All', count: counts.total },
                { id: 'REVIEW', label: '💡 Proposals & Reviews', count: counts.review },
                { id: 'UNREAD', label: '🔴 Unread', count: counts.unread },
                { id: 'TASK', label: '📋 Team Tasks', count: counts.task },
                { id: 'PROJECT', label: '🚀 Projects', count: counts.project },
                { id: 'TEAM', label: '👥 Team', count: counts.team },
            ]
        }
        if (userRole === 'ADMIN') {
            return [
                { id: 'ALL', label: 'All', count: counts.total },
                { id: 'UNREAD', label: '🔴 Unread', count: counts.unread },
                { id: 'REVIEW', label: '💡 Proposals & Approvals', count: counts.review },
                { id: 'TASK', label: '📋 All Tasks', count: counts.task },
                { id: 'PROJECT', label: '🚀 Projects', count: counts.project },
                { id: 'SYSTEM', label: '🛡️ System', count: counts.system },
            ]
        }
        // DEVELOPER / MEMBER (Default)
        return [
            { id: 'ALL', label: 'All', count: counts.total },
            { id: 'ASSIGNED', label: '🎯 Assigned to Me', count: counts.assigned },
            { id: 'UNREAD', label: '🔴 Unread', count: counts.unread },
            { id: 'TASK', label: '📋 Task Updates', count: counts.task },
            { id: 'REVIEW', label: '💡 My Proposals', count: counts.review },
            { id: 'TEAM', label: '👥 Team', count: counts.team },
        ]
    }, [userRole, counts])

    return (
        <div className="inbox-root">
            {toast && <div className="inbox-toast" role="status">{toast}</div>}

            {/* Header with Role Badge */}
            <div className="inbox-header">
                <div>
                    {userRole === 'ADMIN' ? (
                        <span className="inbox-role-badge adm">🛡️ Administrator Workspace Inbox</span>
                    ) : userRole === 'MANAGER' ? (
                        <span className="inbox-role-badge mgr">👔 Manager Workspace Inbox</span>
                    ) : (
                        <span className="inbox-role-badge dev">💻 Developer Workspace Inbox</span>
                    )}
                    <h1 className="inbox-title">Work Inbox &amp; Updates</h1>
                    <p className="inbox-subtitle">
                        {userRole === 'ADMIN'
                            ? 'Full workspace oversight: task approvals, security alerts, and organizational milestones.'
                            : userRole === 'MANAGER'
                            ? 'Review developer task proposals, track assignments, and approve project deliverables.'
                            : 'Direct task assignments, deadline alerts, priority updates, and team collaboration.'}
                    </p>
                </div>
                <div className="inbox-header-actions">
                    <button className="inbox-btn" onClick={markAll} disabled={counts.unread === 0}>✓ Mark All Read</button>
                    <button className="inbox-btn inbox-btn--danger" onClick={clearAll} disabled={items.length === 0}>🗑 Clear All</button>
                </div>
            </div>

            {err && <div className="inbox-err" role="alert">⚠️ {err} <button onClick={() => setErr('')}>✕</button></div>}

            {/* Metrics tailored by role */}
            <div className="inbox-metrics">
                {userRole === 'MANAGER' ? [
                    { label: 'Proposals to Review', value: counts.review, icon: '💡', c: '#b45309' },
                    { label: 'Unread Alerts', value: counts.unread, icon: '🔴', c: '#ef4444' },
                    { label: 'Team Tasks', value: counts.task, icon: '📋', c: '#2563eb' },
                    { label: 'Projects Active', value: counts.project, icon: '🚀', c: '#4f46e5' },
                ].map(m => (
                    <div key={m.label} className="inbox-metric">
                        <span className="inbox-metric-icon" style={{ color: m.c }}>{m.icon}</span>
                        <div>
                            <div className="inbox-metric-val" style={{ color: m.c }}>{m.value}</div>
                            <div className="inbox-metric-lbl">{m.label}</div>
                        </div>
                    </div>
                )) : userRole === 'ADMIN' ? [
                    { label: 'Total Events', value: counts.total, icon: '📥', c: '#6366f1' },
                    { label: 'Unread Alerts', value: counts.unread, icon: '🔴', c: '#ef4444' },
                    { label: 'Proposals & Approvals', value: counts.review, icon: '💡', c: '#b45309' },
                    { label: 'All Tasks', value: counts.task, icon: '📋', c: '#059669' },
                ].map(m => (
                    <div key={m.label} className="inbox-metric">
                        <span className="inbox-metric-icon" style={{ color: m.c }}>{m.icon}</span>
                        <div>
                            <div className="inbox-metric-val" style={{ color: m.c }}>{m.value}</div>
                            <div className="inbox-metric-lbl">{m.label}</div>
                        </div>
                    </div>
                )) : [
                    { label: 'Assigned to Me', value: counts.assigned, icon: '🎯', c: '#047857' },
                    { label: 'Unread Updates', value: counts.unread, icon: '🔴', c: '#ef4444' },
                    { label: 'Task Updates', value: counts.task, icon: '📋', c: '#2563eb' },
                    { label: 'My Proposals', value: counts.review, icon: '💡', c: '#b45309' },
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
                        <input
                            ref={searchRef}
                            type="text"
                            placeholder="Filter updates, task titles, projects…"
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            className="inbox-search-inp"
                        />
                        {q && <button className="inbox-search-clr" onClick={() => { setQ(''); searchRef.current?.focus() }}>✕</button>}
                    </div>

                    {/* Tabs */}
                    <div className="inbox-tabs">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                className={`inbox-tab ${filter === tab.id ? 'active' : ''}`}
                                onClick={() => setFilter(tab.id)}
                            >
                                {tab.label}
                                {tab.count > 0 && <span className={`inbox-tab-count ${filter === tab.id ? 'active' : ''}`}>{tab.count}</span>}
                            </button>
                        ))}
                    </div>

                    {/* Items */}
                    <div className="inbox-list">
                        {loading ? (
                            <div className="inbox-empty"><div className="inbox-spinner" /><p>Loading your workspace updates…</p></div>
                        ) : filtered.length === 0 ? (
                            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#94a3b8' }}>
                                <div style={{ fontSize: 44, marginBottom: 10 }}>
                                    {filter === 'ASSIGNED' ? '🎯' : filter === 'REVIEW' ? '💡' : '🎉'}
                                </div>
                                <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '15px' }}>
                                    {filter === 'ASSIGNED'
                                        ? 'No tasks assigned right now'
                                        : filter === 'REVIEW'
                                        ? 'No pending proposals to review'
                                        : 'All caught up!'}
                                </h3>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
                                    {q ? `No notifications matching "${q}"` : 'When tasks are assigned or updated, notifications will show here instantly.'}
                                </p>
                            </div>
                        ) : filtered.map(n => {
                            const cat = getCat(n)
                            const m = CMETA[cat]
                            const isOpen = sel === n.id
                            return (
                                <div
                                    key={n.id}
                                    className={`inbox-row ${!n.isRead ? 'unread' : ''} ${isOpen ? 'selected' : ''}`}
                                    onClick={() => open(n)}
                                >
                                    <div className="inbox-row-dot">{!n.isRead && <span className="inbox-dot" />}</div>
                                    <div className="inbox-row-ico" style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>
                                        {m.icon}
                                    </div>
                                    <div className="inbox-row-body">
                                        <div className="inbox-row-head">
                                            <span className="inbox-cat-badge" style={{ background: m.bg, color: m.color }}>
                                                {m.label}
                                            </span>
                                            <span className="inbox-row-time">{relTime(n.createdAt)}</span>
                                        </div>
                                        <p className={`inbox-row-msg ${!n.isRead ? 'bold' : ''}`}>{hl(n.message, q)}</p>
                                    </div>
                                    <div className="inbox-row-acts" onClick={e => e.stopPropagation()}>
                                        <button
                                            className="inbox-row-act"
                                            onClick={() => {
                                                n.isRead ? setItems(p => p.map(x => x.id === n.id ? { ...x, isRead: false } : x)) : markRead(n.id)
                                                flash(n.isRead ? 'Marked unread' : 'Marked read')
                                            }}
                                            title={n.isRead ? 'Mark unread' : 'Mark read'}
                                        >
                                            {n.isRead ? '◎' : '●'}
                                        </button>
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
                        const cat = getCat(selItem)
                        const m = CMETA[cat]
                        return (
                            <div className="inbox-detail">
                                <div className="inbox-detail-hd">
                                    <div className="inbox-detail-ico" style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>
                                        {m.icon}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <span className="inbox-cat-badge" style={{ background: m.bg, color: m.color }}>
                                            {m.label}
                                        </span>
                                        <div className="inbox-detail-ts">{relTime(selItem.createdAt)}</div>
                                    </div>
                                    <button className="inbox-detail-close" onClick={() => setSel(null)} title="Close">✕</button>
                                </div>
                                <div className="inbox-detail-body">
                                    <p className="inbox-detail-msg">{selItem.message}</p>
                                    <div className="inbox-detail-grid">
                                        <div className="inbox-detail-row">
                                            <span className="inbox-detail-lbl">Update Category</span>
                                            <span>{m.label}</span>
                                        </div>
                                        <div className="inbox-detail-row">
                                            <span className="inbox-detail-lbl">Status</span>
                                            <span className={`inbox-status ${selItem.isRead ? 'read' : 'unread'}`}>
                                                {selItem.isRead ? '✓ Read' : '● Unread'}
                                            </span>
                                        </div>
                                        <div className="inbox-detail-row">
                                            <span className="inbox-detail-lbl">Timestamp</span>
                                            <span>
                                                {selItem.createdAt
                                                    ? new Date(selItem.createdAt).toLocaleString(undefined, {
                                                          weekday: 'short',
                                                          month: 'short',
                                                          day: 'numeric',
                                                          hour: '2-digit',
                                                          minute: '2-digit',
                                                      })
                                                    : 'Just now'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="inbox-detail-ft">
                                    <button className="inbox-detail-cta" onClick={() => goTo(selItem)}>
                                        {cat === 'ASSIGNED'
                                            ? 'Open My Task ➔'
                                            : cat === 'REVIEW'
                                            ? 'Review in Tasks ➔'
                                            : cat === 'PROJECT'
                                            ? 'Open Project ➔'
                                            : 'Open in Workspace ➔'}
                                    </button>
                                    <button
                                        className="inbox-detail-act"
                                        onClick={() => {
                                            selItem.isRead
                                                ? setItems(p => p.map(x => x.id === selItem.id ? { ...x, isRead: false } : x))
                                                : markRead(selItem.id)
                                        }}
                                    >
                                        {selItem.isRead ? 'Mark Unread' : 'Mark Read'}
                                    </button>
                                    <button className="inbox-detail-act danger" onClick={e => del(selItem.id, e)}>
                                        Delete
                                    </button>
                                </div>
                            </div>
                        )
                    })() : (
                        <div className="inbox-detail-empty">
                            <div style={{ fontSize: 52, marginBottom: 12 }}>📬</div>
                            <h3>Select a notification</h3>
                            <p>Click any update in your list to view complete details, actions, and workspace links.</p>
                            <div className="inbox-tips">
                                <div className="inbox-tip">
                                    <span>🎯</span>
                                    <span><strong>Developer Updates:</strong> Newly assigned tasks appear with direct action links.</span>
                                </div>
                                <div className="inbox-tip">
                                    <span>💡</span>
                                    <span><strong>Manager Actions:</strong> Task proposals submitted by team members are flagged for review.</span>
                                </div>
                                <div className="inbox-tip">
                                    <span>⚡</span>
                                    <span><strong>Real-time Sync:</strong> Live alerts are pushed immediately without needing to refresh.</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
