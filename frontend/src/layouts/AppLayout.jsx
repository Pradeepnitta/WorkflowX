import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getAccessToken, getCurrentUser, logout } from '../services/authService.js'
import { getOrganizations } from '../services/organizationService.js'
import { connectSocket, disconnectSocket } from '../services/socketService.js'
import '../App.css'

export default function AppLayout() {
    const location = useLocation()
    const navigate = useNavigate()
    const [user, setUser] = useState(null)
    const [organization, setOrganization] = useState(null)
    const [authVersion, setAuthVersion] = useState(0)
    const [unreadCount, setUnreadCount] = useState(4)
    const [toasts, setToasts] = useState([])

    function addToast(toast) {
        setToasts((prev) => [toast, ...prev.slice(0, 4)])
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== toast.id))
        }, 5000)
    }

    useEffect(() => {
        function onAuthChange() {
            setAuthVersion((v) => v + 1)
        }
        window.addEventListener('auth-change', onAuthChange)
        window.addEventListener('storage', onAuthChange)
        return () => {
            window.removeEventListener('auth-change', onAuthChange)
            window.removeEventListener('storage', onAuthChange)
        }
    }, [])

    useEffect(() => {
        const token = getAccessToken()
        const socket = connectSocket(token)
        if (!socket) return

        function handleTaskCreated(newTask) {
            addToast({
                id: Date.now() + Math.random(),
                icon: '✨',
                title: 'New Task Created',
                message: `"${newTask.title}" added to ${newTask.project || 'workspace'}.`,
            })
            setUnreadCount((c) => c + 1)
        }

        function handleTaskUpdated(task) {
            addToast({
                id: Date.now() + Math.random(),
                icon: '⚡',
                title: 'Task Status Updated',
                message: `"${task.title}" moved to ${task.status || 'updated'}.`,
            })
            setUnreadCount((c) => c + 1)
        }

        function handleCommentCreated(payload) {
            addToast({
                id: Date.now() + Math.random(),
                icon: '💬',
                title: 'New Discussion Comment',
                message: payload?.comment?.content || payload?.comment?.text || 'A new comment was posted on a task.',
            })
            setUnreadCount((c) => c + 1)
        }

        socket.on('task:created', handleTaskCreated)
        socket.on('task:updated', handleTaskUpdated)
        socket.on('comment:created', handleCommentCreated)

        return () => {
            socket.off('task:created', handleTaskCreated)
            socket.off('task:updated', handleTaskUpdated)
            socket.off('comment:created', handleCommentCreated)
        }
    }, [authVersion])

    useEffect(() => {
        const token = getAccessToken()
        if (!token) {
            setUser(null)
            setOrganization(null)
            return
        }
        getCurrentUser()
            .then(setUser)
            .catch(() => setUser(null))
        getOrganizations()
            .then((orgs) => {
                if ((orgs?.length || 0) > 0) setOrganization(orgs[0])
                else setOrganization(null)
            })
            .catch(() => setOrganization(null))
    }, [authVersion, location.pathname])

    async function handleSignOut() {
        setUser(null)
        setOrganization(null)
        await logout().catch(() => undefined)
        navigate('/login', { replace: true })
    }

    const currentRole = (organization?.role || localStorage.getItem('workflowx_registered_role') || 'MEMBER').toUpperCase()
    const isAdmin = currentRole === 'ADMIN'

    const currentPath = location.pathname
    const pathNameMap = {
        '/': 'Overview',
        '/tasks': 'Signboard',
        '/projects': 'Projects',
        '/teams': 'Team',
        '/members': 'Members',
        '/analytics': 'Analytics',
        '/notifications': 'Inbox',
        '/search': 'Search',
        '/profile': 'Profile',
        '/settings': 'Settings',
        '/admin': 'Admin Console',
    }
    const currentTitle = pathNameMap[currentPath] || 'Workspace'

    const displayName = user?.name || (user?.email ? user.email.split('@')[0] : 'Workspace User')
    const userInitials = displayName
        ? displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
        : 'WU'

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
                    <span className="brand-mark">W</span>
                    <span>WorkFlow<span className="brand-accent">X</span></span>
                </div>

                <div className="workspace-switcher" onClick={() => navigate('/settings')} style={{ cursor: 'pointer' }}>
                    <span className="workspace-avatar">
                        {organization?.name ? organization.name[0].toUpperCase() : 'W'}
                    </span>
                    <span>
                        <strong>{organization?.name || 'Workspace'}</strong>
                        <small>{organization?.role ? `${organization.role} Workspace` : 'Workspace'}</small>
                    </span>
                    <span className="chevron">⌄</span>
                </div>

                <nav aria-label="Main navigation">
                    <p className="nav-label">Workspace</p>
                    <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <span className="nav-icon">▦</span>Overview
                    </NavLink>
                    <NavLink to="/tasks" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <span className="nav-icon">📋</span>Signboard
                    </NavLink>
                    <NavLink to="/projects" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <span className="nav-icon">▤</span>Projects
                    </NavLink>
                    <NavLink to="/teams" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <span className="nav-icon">♧</span>Team
                    </NavLink>
                    <NavLink to="/members" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <span className="nav-icon">👤</span>Members
                    </NavLink>

                    <p className="nav-label nav-label-spaced">Manage</p>
                    {isAdmin && (
                        <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <span className="nav-icon">🛡️</span>Admin
                        </NavLink>
                    )}
                    <NavLink to="/notifications" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <span className="nav-icon">◌</span>Inbox
                        {unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}
                    </NavLink>
                    <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <span className="nav-icon">📊</span>Analytics
                    </NavLink>
                    <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <span className="nav-icon">⚙</span>Settings
                    </NavLink>
                </nav>

                <div className="sidebar-footer" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px' }}>
                    <div className="user-avatar" style={{ cursor: 'pointer' }} onClick={() => navigate('/profile')}>
                        {userInitials}
                    </div>
                    <div style={{ cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={() => navigate('/profile')}>
                        <strong style={{ display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {displayName}
                        </strong>
                        <span
                            style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                background: currentRole === 'ADMIN' ? '#fee2e2' : currentRole === 'MANAGER' ? '#e0e7ff' : '#f0fdf4',
                                color: currentRole === 'ADMIN' ? '#b91c1c' : currentRole === 'MANAGER' ? '#4338ca' : '#15803d',
                                padding: '1px 6px',
                                borderRadius: '4px',
                            }}
                        >
                            {currentRole}
                        </span>
                    </div>
                    <button
                        id="sidebar-signout-btn"
                        className="signout-button"
                        onClick={handleSignOut}
                        style={{
                            background: '#fef2f2',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                        }}
                        aria-label="Sign out"
                        title="Sign out of current role"
                    >
                        <span>↪</span> Exit
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <header className="topbar">
                    <div className="breadcrumbs">
                        <span>Workspace</span>
                        <b>/</b>
                        <strong>{currentTitle}</strong>
                    </div>
                    <div className="top-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button className="icon-button" aria-label="Search" onClick={() => navigate('/search')}>
                            ⌕
                        </button>
                        <button className="icon-button notification" aria-label="Notifications" onClick={() => navigate('/notifications')}>
                            ♧<i />
                        </button>
                        <button className="help-button" onClick={() => navigate('/settings')}>
                            ? <span>Help</span>
                        </button>
                        <button
                            id="topbar-signout-btn"
                            type="button"
                            onClick={handleSignOut}
                            style={{
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                color: '#475569',
                                borderRadius: '6px',
                                padding: '5px 12px',
                                fontSize: '11px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                            }}
                            title="Sign out from current role"
                        >
                            <span>↪</span> Sign Out
                        </button>
                    </div>
                </header>

                <div className="content-wrap">
                    {currentPath === '/admin' && !isAdmin ? (
                        <div
                            id="admin-access-restricted-card"
                            style={{
                                maxWidth: '580px',
                                margin: '60px auto',
                                background: '#fff',
                                border: '1px solid #fee2e2',
                                borderRadius: '12px',
                                padding: '36px',
                                textAlign: 'center',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                            }}
                        >
                            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'grid', placeItems: 'center', fontSize: '26px', margin: '0 auto 16px' }}>
                                🚫
                            </div>
                            <h2 style={{ margin: '0 0 8px', color: '#111827', fontSize: '20px' }}>
                                Admin Console Restricted
                            </h2>
                            <p style={{ color: '#4b5563', fontSize: '13px', lineHeight: '1.6', marginBottom: '16px' }}>
                                You are signed in as <b>{user?.name || user?.email || 'User'}</b> with the role <span style={{ fontWeight: 700, color: '#dc2626' }}>{currentRole}</span>.
                            </p>
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#334155', lineHeight: '1.5', marginBottom: '24px', textAlign: 'left' }}>
                                📌 <b>WorkFlowX Security Policy:</b>
                                <br />
                                The same email address cannot have access to different roles. If you want to use the <b>ADMIN</b> role, you must log out of this account and sign in or sign up with an Administrator email.
                            </div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                <button type="button" className="secondary-button" onClick={() => navigate('/')}>
                                    Go to Overview
                                </button>
                                <button
                                    id="restricted-logout-btn"
                                    type="button"
                                    className="primary-button"
                                    onClick={handleSignOut}
                                    style={{ background: '#dc2626' }}
                                >
                                    Log Out & Switch Role
                                </button>
                            </div>
                        </div>
                    ) : (
                        <Outlet />
                    )}
                </div>

                <footer className="app-footer">
                    <div className="footer-brand-info">
                        <span>© {new Date().getFullYear()}</span>
                        <strong className="footer-brand-name">WorkFlowX Inc.</strong>
                        <span style={{ color: '#d1d5db' }}>•</span>
                        <span>All rights reserved.</span>
                    </div>

                    <div className="footer-contacts-list">
                        <a href="mailto:support@workflowx.com" className="footer-contact-item">
                            <span>✉️</span>
                            <span>support@workflowx.com</span>
                        </a>

                        <a href="tel:+916309680192" className="footer-contact-item">
                            <span>📞</span>
                            <span>+91 6309680192</span>
                        </a>

                        <div className="footer-badge-support">
                            <span style={{ fontSize: '9px' }}>●</span>
                            <span>24/7 Enterprise Support</span>
                        </div>
                    </div>
                </footer>

                {/* Real-time Socket.IO Push Notification Toast Stack */}
                <aside
                    className="live-toast-container"
                    aria-live="polite"
                    style={{
                        position: 'fixed',
                        top: '20px',
                        right: '24px',
                        zIndex: 9999,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        pointerEvents: 'none',
                        maxWidth: '380px',
                        width: 'calc(100% - 48px)',
                    }}
                >
                    {toasts.map((toast) => (
                        <div
                            key={toast.id}
                            className="live-toast-item"
                            style={{
                                pointerEvents: 'auto',
                                background: '#ffffff',
                                color: '#1f2937',
                                padding: '12px 16px',
                                borderRadius: '10px',
                                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                                border: '1px solid #fee2e2',
                                borderLeft: '4px solid #ee785e',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            }}
                        >
                            <span style={{ fontSize: '18px', lineHeight: 1 }}>{toast.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                    <strong style={{ fontSize: '13px', color: '#111827', fontWeight: 600 }}>{toast.title}</strong>
                                    <span style={{ fontSize: '10px', color: '#9ca3af' }}>Live</span>
                                </div>
                                <p style={{ margin: 0, fontSize: '12px', color: '#4b5563', lineHeight: 1.4 }}>{toast.message}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}
                                title="Dismiss"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </aside>
            </main>
        </div>
    )
}

