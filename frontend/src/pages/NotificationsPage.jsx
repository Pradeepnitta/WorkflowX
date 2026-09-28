import { useEffect, useMemo, useState } from 'react'
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

function highlightMatch(text, query) {
    if (!query || !text) return text
    const cleanQuery = query.trim()
    if (!cleanQuery) return text
    const regex = new RegExp(`(${cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = String(text).split(regex)
    return parts.map((part, i) =>
        part.toLowerCase() === cleanQuery.toLowerCase() ? (
            <mark key={i} style={{ background: '#ffeaa7', color: '#6c4a00', padding: '1px 3px', borderRadius: '3px', fontWeight: 600 }}>
                {part}
            </mark>
        ) : (
            part
        )
    )
}

function formatRelativeTime(dateString) {
    if (!dateString) return 'Recent'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHours = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffSec < 60) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getNotificationCategory(notification) {
    const text = ((notification.type || '') + ' ' + (notification.message || '')).toLowerCase()
    if (text.includes('project') || text.includes('milestone')) return 'PROJECT'
    if (text.includes('task') || text.includes('assigned') || text.includes('wireframe') || text.includes('board') || text.includes('card')) return 'TASK'
    if (text.includes('mention') || text.includes('comment') || text.includes('team') || text.includes('member')) return 'TEAM'
    return 'SYSTEM'
}

function getNotificationIcon(type, category) {
    if (category === 'PROJECT') return '🚀'
    if (category === 'TASK') return '📋'
    if (category === 'TEAM') return '👥'
    return '⚡'
}

function getNotificationColor(category) {
    switch (category) {
        case 'PROJECT':
            return { bg: '#e0e7ff', text: '#3730a3', border: '#c7d2fe' }
        case 'TASK':
            return { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0' }
        case 'TEAM':
            return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' }
        default:
            return { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' }
    }
}

export default function NotificationsPage() {
    const navigate = useNavigate()
    const [notifications, setNotifications] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [activeFilter, setActiveFilter] = useState('ALL') // 'ALL' | 'UNREAD' | 'TASK' | 'PROJECT' | 'TEAM' | 'SYSTEM'
    const [searchQuery, setSearchQuery] = useState('')
    const [toastMessage, setToastMessage] = useState('')
    const [error, setError] = useState('')

    function showToast(msg) {
        setToastMessage(msg)
        setTimeout(() => setToastMessage(''), 3500)
    }

    // Initial Load
    useEffect(() => {
        setIsLoading(true)
        getNotifications()
            .then((loaded) => {
                setNotifications(Array.isArray(loaded) ? loaded : loaded?.data || [])
            })
            .catch((requestError) => setError(requestError.message))
            .finally(() => setIsLoading(false))
    }, [])

    // Real-time socket updates
    useEffect(() => {
        const socket = getSocket()
        if (!socket) return

        function handleIncomingNotification(data) {
            if (!data) return
            const newNotif = {
                id: data.id || `notif-${Date.now()}`,
                type: data.type || 'SYSTEM',
                message: data.message || 'New workspace activity detected',
                isRead: false,
                createdAt: data.createdAt || new Date().toISOString(),
            }
            setNotifications((prev) => [newNotif, ...prev])
            showToast(`🔔 ${newNotif.message}`)
        }

        function handleTaskEvent(task) {
            if (!task?.title) return
            const newNotif = {
                id: `notif-task-${Date.now()}`,
                type: 'TASK',
                message: `Task updated: "${task.title}" is now marked as ${task.status || 'Active'}.`,
                isRead: false,
                createdAt: new Date().toISOString(),
            }
            setNotifications((prev) => [newNotif, ...prev])
        }

        function handleProjectEvent(project) {
            if (!project?.name) return
            const newNotif = {
                id: `notif-proj-${Date.now()}`,
                type: 'PROJECT',
                message: `Project initiative updated: "${project.name}" status is ${project.status || 'Active'}.`,
                isRead: false,
                createdAt: new Date().toISOString(),
            }
            setNotifications((prev) => [newNotif, ...prev])
        }

        socket.on('notification:new', handleIncomingNotification)
        socket.on('task:created', handleTaskEvent)
        socket.on('task:updated', handleTaskEvent)
        socket.on('project:created', handleProjectEvent)
        socket.on('project:updated', handleProjectEvent)

        return () => {
            socket.off('notification:new', handleIncomingNotification)
            socket.off('task:created', handleTaskEvent)
            socket.off('task:updated', handleTaskEvent)
            socket.off('project:created', handleProjectEvent)
            socket.off('project:updated', handleProjectEvent)
        }
    }, [])

    // Mark single notification as read
    async function handleMarkRead(notificationId) {
        try {
            await markNotificationRead(notificationId).catch(() => null)
            setNotifications((current) =>
                current.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
            )
        } catch (requestError) {
            setError(requestError.message)
        }
    }

    // Toggle read/unread state
    async function handleToggleRead(notification, e) {
        e.stopPropagation()
        if (!notification.isRead) {
            await handleMarkRead(notification.id)
            showToast('Marked as read')
        } else {
            setNotifications((current) =>
                current.map((n) => (n.id === notification.id ? { ...n, isRead: false } : n))
            )
            showToast('Marked as unread')
        }
    }

    // Mark all as read
    async function handleMarkAllRead() {
        try {
            await markAllNotificationsRead().catch(() => null)
            setNotifications((current) => current.map((n) => ({ ...n, isRead: true })))
            showToast('All notifications marked as read.')
        } catch (requestError) {
            setError(requestError.message)
        }
    }

    // Delete single notification
    async function handleDeleteNotification(notificationId, e) {
        e.stopPropagation()
        try {
            await deleteNotification(notificationId).catch(() => null)
            setNotifications((current) => current.filter((n) => n.id !== notificationId))
            showToast('Notification dismissed.')
        } catch (requestError) {
            setError(requestError.message)
        }
    }

    // Clear all notifications
    async function handleClearAll() {
        if (!window.confirm('Clear all notifications in your feed?')) return
        try {
            await clearAllNotifications().catch(() => null)
            setNotifications([])
            showToast('All notifications cleared.')
        } catch (requestError) {
            setError(requestError.message)
        }
    }

    // Route dynamically based on notification content
    function handleNotificationClick(notification) {
        if (!notification.isRead) {
            handleMarkRead(notification.id)
        }

        const text = (notification.message || '').toLowerCase()
        if (text.includes('project') || text.includes('initiative')) {
            navigate('/projects')
        } else if (text.includes('task') || text.includes('wireframe') || text.includes('board') || text.includes('card')) {
            navigate('/tasks')
        } else if (text.includes('team') || text.includes('member')) {
            navigate('/members')
        } else if (text.includes('password') || text.includes('security') || text.includes('setting')) {
            navigate('/settings?tab=security')
        } else {
            navigate('/tasks')
        }
    }

    // Generate test activity for immediate interactive testing
    function handleGenerateTestActivity() {
        const samples = [
            { type: 'TASK', message: 'Sneha Patel moved task "Design iOS Wireframes" to In Progress.' },
            { type: 'PROJECT', message: 'Milestone reached for "Mobile Redesign v2": 50% tasks completed.' },
            { type: 'TEAM', message: 'Rahul Sharma assigned you to the Core Engineering Frontend team.' },
            { type: 'SYSTEM', message: 'Daily sprint predictability report is now available in Analytics.' },
        ]
        const sample = samples[Math.floor(Math.random() * samples.length)]
        const newNotif = {
            id: `test-notif-${Date.now()}`,
            type: sample.type,
            message: sample.message,
            isRead: false,
            createdAt: new Date().toISOString(),
        }
        setNotifications((prev) => [newNotif, ...prev])
        showToast(`🔔 ${sample.message}`)
    }

    // Compute metrics and filter counts
    const counts = useMemo(() => {
        const total = notifications.length
        const unread = notifications.filter((n) => !n.isRead).length
        const task = notifications.filter((n) => getNotificationCategory(n) === 'TASK').length
        const project = notifications.filter((n) => getNotificationCategory(n) === 'PROJECT').length
        const team = notifications.filter((n) => getNotificationCategory(n) === 'TEAM').length
        const system = notifications.filter((n) => getNotificationCategory(n) === 'SYSTEM').length
        return { total, unread, task, project, team, system }
    }, [notifications])

    // Filter notifications list
    const filteredNotifications = useMemo(() => {
        return notifications.filter((n) => {
            const category = getNotificationCategory(n)
            const matchesFilter =
                activeFilter === 'ALL' ||
                (activeFilter === 'UNREAD' && !n.isRead) ||
                (activeFilter === 'TASK' && category === 'TASK') ||
                (activeFilter === 'PROJECT' && category === 'PROJECT') ||
                (activeFilter === 'TEAM' && category === 'TEAM') ||
                (activeFilter === 'SYSTEM' && category === 'SYSTEM')

            const query = searchQuery.trim().toLowerCase()
            const matchesQuery =
                !query ||
                (n.message && n.message.toLowerCase().includes(query)) ||
                (n.type && n.type.toLowerCase().includes(query))

            return matchesFilter && matchesQuery
        })
    }, [notifications, activeFilter, searchQuery])

    return (
        <main className="feature-page" style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '60px' }}>
            {/* Toast Feedback Banner */}
            {toastMessage && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: '24px',
                        right: '24px',
                        background: '#0f172a',
                        color: '#fff',
                        padding: '12px 20px',
                        borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                        zIndex: 9999,
                        fontSize: '13px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    <span>🔔</span> {toastMessage}
                </div>
            )}

            {/* Feature Heading & Controls */}
            <div className="feature-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <p className="eyebrow" style={{ margin: 0 }}>Workspace • Activity Stream</p>
                        {counts.unread > 0 && (
                            <span style={{ fontSize: '11px', background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                                {counts.unread} Unread
                            </span>
                        )}
                    </div>
                    <h1 style={{ margin: '0 0 6px', fontSize: '28px', color: '#111827' }}>Notifications & Feed</h1>
                    <p className="heading-subtitle" style={{ color: '#6b7280', margin: 0 }}>
                        Real-time updates on assignments, project milestones, team discussions, and system alerts.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={handleGenerateTestActivity}
                        style={{
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            borderRadius: '6px',
                            padding: '8px 14px',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                        title="Simulate a real-time event"
                    >
                        + Simulate Alert
                    </button>

                    <button
                        type="button"
                        onClick={handleMarkAllRead}
                        disabled={counts.unread === 0}
                        style={{
                            background: '#f8fafc',
                            color: counts.unread > 0 ? '#334155' : '#94a3b8',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            padding: '8px 14px',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            cursor: counts.unread > 0 ? 'pointer' : 'default',
                        }}
                    >
                        ✓ Mark All as Read
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/settings?tab=notifications')}
                        style={{
                            background: '#fff',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            padding: '8px 14px',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}
                        title="Configure notification rules in Settings"
                    >
                        <span>⚙️</span> Preferences
                    </button>
                </div>
            </div>

            {error && (
                <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Quick KPI Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                <div
                    style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', cursor: 'pointer', borderLeft: '4px solid #3b82f6' }}
                    onClick={() => setActiveFilter('ALL')}
                >
                    <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Feed</span>
                    <strong style={{ display: 'block', fontSize: '22px', color: '#0f172a', marginTop: '2px' }}>{counts.total}</strong>
                </div>

                <div
                    style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', cursor: 'pointer', borderLeft: '4px solid #ef4444' }}
                    onClick={() => setActiveFilter('UNREAD')}
                >
                    <span style={{ fontSize: '11px', color: '#dc2626', textTransform: 'uppercase', fontWeight: 600 }}>Unread Alerts</span>
                    <strong style={{ display: 'block', fontSize: '22px', color: '#dc2626', marginTop: '2px' }}>{counts.unread}</strong>
                </div>

                <div
                    style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', cursor: 'pointer', borderLeft: '4px solid #10b981' }}
                    onClick={() => setActiveFilter('TASK')}
                >
                    <span style={{ fontSize: '11px', color: '#059669', textTransform: 'uppercase', fontWeight: 600 }}>Task Updates</span>
                    <strong style={{ display: 'block', fontSize: '22px', color: '#059669', marginTop: '2px' }}>{counts.task}</strong>
                </div>

                <div
                    style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', cursor: 'pointer', borderLeft: '4px solid #8b5cf6' }}
                    onClick={() => setActiveFilter('PROJECT')}
                >
                    <span style={{ fontSize: '11px', color: '#7c3aed', textTransform: 'uppercase', fontWeight: 600 }}>Project Initiatives</span>
                    <strong style={{ display: 'block', fontSize: '22px', color: '#7c3aed', marginTop: '2px' }}>{counts.project}</strong>
                </div>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                    background: '#fff',
                    padding: '12px 18px',
                    borderRadius: '10px',
                    border: '1px solid #e5e7eb',
                    marginBottom: '16px',
                }}
            >
                {/* Category Tabs */}
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
                    {[
                        { id: 'ALL', label: 'All', count: counts.total },
                        { id: 'UNREAD', label: 'Unread', count: counts.unread },
                        { id: 'TASK', label: 'Tasks', count: counts.task },
                        { id: 'PROJECT', label: 'Projects', count: counts.project },
                        { id: 'TEAM', label: 'Team', count: counts.team },
                        { id: 'SYSTEM', label: 'System', count: counts.system },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveFilter(tab.id)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                background: activeFilter === tab.id ? '#1e293b' : '#f1f5f9',
                                color: activeFilter === tab.id ? '#fff' : '#475569',
                                fontWeight: activeFilter === tab.id ? 600 : 500,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            <span>{tab.label}</span>
                            <span
                                style={{
                                    fontSize: '10px',
                                    padding: '1px 5px',
                                    borderRadius: '8px',
                                    background: activeFilter === tab.id ? '#334155' : '#e2e8f0',
                                    color: activeFilter === tab.id ? '#fff' : '#475569',
                                }}
                            >
                                {tab.count}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Search Input & Clear All */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ position: 'relative' }}>
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter alerts..."
                            style={{
                                padding: '6px 10px 6px 26px',
                                fontSize: '12px',
                                borderRadius: '6px',
                                border: '1px solid #d1d5db',
                                width: '180px',
                                outline: 'none',
                            }}
                        />
                        <span style={{ position: 'absolute', left: '8px', top: '7px', fontSize: '11px', color: '#9ca3af' }}>
                            🔍
                        </span>
                    </div>

                    {notifications.length > 0 && (
                        <button
                            type="button"
                            onClick={handleClearAll}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94a3b8',
                                fontSize: '12px',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                            }}
                        >
                            Clear Feed
                        </button>
                    )}
                </div>
            </div>

            {/* Notifications Feed List */}
            <section
                style={{
                    background: '#fff',
                    borderRadius: '12px',
                    border: '1px solid #e5e7eb',
                    overflow: 'hidden',
                }}
            >
                {isLoading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>
                        <p>Loading your activity feed...</p>
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                        <div style={{ fontSize: '36px', marginBottom: '12px' }}>🎉</div>
                        <h3 style={{ margin: '0 0 6px', color: '#111827' }}>You are all caught up!</h3>
                        <p style={{ margin: '0 0 18px', color: '#6b7280', fontSize: '13px' }}>
                            {searchQuery
                                ? `No notifications matched "${searchQuery}".`
                                : 'No new notifications in this category. You are on top of your work!'}
                        </p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button
                                type="button"
                                className="primary-button"
                                onClick={() => navigate('/tasks')}
                                style={{ fontSize: '12px' }}
                            >
                                Go to Signboard ➔
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate('/projects')}
                                style={{ padding: '7px 14px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', fontSize: '12px', cursor: 'pointer' }}
                            >
                                View Projects
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        {filteredNotifications.map((notification) => {
                            const category = getNotificationCategory(notification)
                            const icon = getNotificationIcon(notification.type, category)
                            const badgeStyle = getNotificationColor(category)

                            return (
                                <article
                                    key={notification.id}
                                    onClick={() => handleNotificationClick(notification)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        justifyContent: 'space-between',
                                        padding: '16px 20px',
                                        borderBottom: '1px solid #f1f5f9',
                                        background: notification.isRead ? '#ffffff' : '#f8fafc',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                                    onMouseLeave={(e) =>
                                        (e.currentTarget.style.background = notification.isRead ? '#ffffff' : '#f8fafc')
                                    }
                                    title="Click to open related workspace section"
                                >
                                    <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flex: 1 }}>
                                        {/* Status Dot & Icon */}
                                        <div style={{ position: 'relative', flexShrink: 0, marginTop: '2px' }}>
                                            <div
                                                style={{
                                                    width: '36px',
                                                    height: '36px',
                                                    borderRadius: '8px',
                                                    background: badgeStyle.bg,
                                                    color: badgeStyle.text,
                                                    border: `1px solid ${badgeStyle.border}`,
                                                    display: 'grid',
                                                    placeItems: 'center',
                                                    fontSize: '16px',
                                                }}
                                            >
                                                {icon}
                                            </div>
                                            {!notification.isRead && (
                                                <span
                                                    style={{
                                                        position: 'absolute',
                                                        top: '-3px',
                                                        right: '-3px',
                                                        width: '10px',
                                                        height: '10px',
                                                        borderRadius: '50%',
                                                        background: '#ef4444',
                                                        border: '2px solid #fff',
                                                    }}
                                                />
                                            )}
                                        </div>

                                        {/* Notification Message & Meta */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                <span
                                                    style={{
                                                        fontSize: '10px',
                                                        fontWeight: 700,
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        background: badgeStyle.bg,
                                                        color: badgeStyle.text,
                                                        letterSpacing: '0.3px',
                                                    }}
                                                >
                                                    {notification.type || category}
                                                </span>
                                                <small style={{ fontSize: '11px', color: '#94a3b8' }}>
                                                    {formatRelativeTime(notification.createdAt)}
                                                </small>
                                            </div>

                                            <p
                                                style={{
                                                    margin: '0 0 4px',
                                                    fontSize: '13.5px',
                                                    color: notification.isRead ? '#475569' : '#0f172a',
                                                    fontWeight: notification.isRead ? 400 : 600,
                                                    lineHeight: '1.4',
                                                }}
                                            >
                                                {highlightMatch(notification.message, searchQuery)}
                                            </p>

                                            <small style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                Open item ➔
                                            </small>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
                                        <button
                                            type="button"
                                            onClick={(e) => handleToggleRead(notification, e)}
                                            style={{
                                                background: '#fff',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '4px',
                                                padding: '4px 8px',
                                                fontSize: '11px',
                                                color: '#64748b',
                                                cursor: 'pointer',
                                            }}
                                            title={notification.isRead ? 'Mark as unread' : 'Mark as read'}
                                        >
                                            {notification.isRead ? 'Mark Unread' : 'Mark Read'}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={(e) => handleDeleteNotification(notification.id, e)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#94a3b8',
                                                fontSize: '13px',
                                                cursor: 'pointer',
                                                padding: '4px 6px',
                                            }}
                                            title="Dismiss notification"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </article>
                            )
                        })}
                    </div>
                )}
            </section>
        </main>
    )
}
