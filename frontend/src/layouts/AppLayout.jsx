import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getAccessToken, getCurrentUser, logout } from '../services/authService.js'
import { getOrganizations } from '../services/organizationService.js'
import { getProjects } from '../services/projectService.js'
import { getTeams } from '../services/teamService.js'
import { connectSocket, joinRoom } from '../services/socketService.js'
import { getNotifications } from '../services/notificationService.js'
import { getUserInitials } from '../constants/avatarOptions.js'
import '../App.css'

export default function AppLayout() {
    const location = useLocation()
    const navigate = useNavigate()
    const [user, setUser] = useState(null)
    const [organization, setOrganization] = useState(null)
    const [authVersion, setAuthVersion] = useState(0)
    const [unreadCount, setUnreadCount] = useState(0)
    const [toasts, setToasts] = useState([])
    const [members, setMembers] = useState([])
    const [projects, setProjects] = useState([])
    const [mobileNavOpen, setMobileNavOpen] = useState(false)
    const [profileMenuOpen, setProfileMenuOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchOpen, setSearchOpen] = useState(false)
    const searchInputRef = useRef(null)

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

        // Listen for notification read events from InboxPage
        function onNotifRead() {
            getNotifications()
                .then(d => {
                    const list = Array.isArray(d) ? d : (d?.data || [])
                    setUnreadCount(list.filter(n => !n.isRead).length)
                })
                .catch(() => null)
        }
        window.addEventListener('notification:read', onNotifRead)

        return () => {
            window.removeEventListener('auth-change', onAuthChange)
            window.removeEventListener('storage', onAuthChange)
            window.removeEventListener('notification:read', onNotifRead)
        }
    }, [])

    useEffect(() => {
        const token = getAccessToken()
        const socket = connectSocket(token)
        if (!socket) return

        function handleNotificationNew(notif) {
            if (!notif) return
            // If targeted to a specific user, verify it matches the current user
            if (notif.userId && user?.id && notif.userId !== user.id) return
            const notificationPresentation = {
                TASK_ASSIGNED: { icon: '🎯', title: 'Task Assigned to You' },
                TASK_PROPOSAL: { icon: '💡', title: 'Task Proposal' },
                DEADLINE_REMINDER: { icon: '⏰', title: 'Deadline Approaching' },
                TASK_OVERDUE: { icon: '⚠️', title: 'Task Overdue' },
            }[notif.type] || { icon: '🔔', title: 'Workspace Update' }
            addToast({
                id: Date.now() + Math.random(),
                icon: notificationPresentation.icon,
                title: notificationPresentation.title,
                message: notif.message,
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

        socket.on('notification:new', handleNotificationNew)
        socket.on('comment:created', handleCommentCreated)

        return () => {
            socket.off('notification:new', handleNotificationNew)
            socket.off('comment:created', handleCommentCreated)
        }
    }, [authVersion, user?.id])

    useEffect(() => {
        if (!organization?.id) return
        joinRoom(`organization:${organization.id}`)
        projects.forEach((project) => {
            if (project.id) joinRoom(`project:${project.id}`)
        })
    }, [organization?.id, projects])

    useEffect(() => {
        const socket = connectSocket(getAccessToken())
        if (!socket) return
        function handleProjectCreated(project) {
            if (project?.id) joinRoom(`project:${project.id}`)
        }
        socket.on('project:created', handleProjectCreated)
        return () => socket.off('project:created', handleProjectCreated)
    }, [authVersion])

    useEffect(() => {
        const token = getAccessToken()
        if (!token) {
            navigate('/login', { replace: true })
            return
        }
        getCurrentUser()
            .then(setUser)
            .catch((err) => {
                setUser(null)
                if (err?.statusCode === 401) {
                    navigate('/login', { replace: true })
                }
            })
        getOrganizations()
            .then((orgs) => {
                const rolePriority = { ADMIN: 0, MANAGER: 1, MEMBER: 2, VIEWER: 3 }
                const preferredOrganization = [...(Array.isArray(orgs) ? orgs : [])]
                    .sort((left, right) =>
                        (rolePriority[String(left.role || '').toUpperCase()] ?? 4)
                        - (rolePriority[String(right.role || '').toUpperCase()] ?? 4)
                    )[0]
                setOrganization(preferredOrganization || null)
            })
            .catch(() => setOrganization(null))
        // Fetch real unread count
        getNotifications()
            .then(d => {
                const list = Array.isArray(d) ? d : (d?.data || [])
                setUnreadCount(list.filter(n => !n.isRead).length)
            })
            .catch(() => null)
    }, [authVersion, location.pathname, navigate])

    useEffect(() => {
        if (!organization?.id) return

        let isCurrent = true
        Promise.all([
            getTeams(organization.id).catch(() => []),
            getProjects(organization.id).catch(() => []),
        ]).then(([loadedTeams, loadedProjects]) => {
            if (!isCurrent) return
            const role = String(organization.role || '').toUpperCase()
            const teamMembers = new Map()
            for (const team of Array.isArray(loadedTeams) ? loadedTeams : []) {
                for (const entry of team.members || []) {
                    if (entry.userId && !teamMembers.has(entry.userId)) {
                        teamMembers.set(entry.userId, { userId: entry.userId, ...(entry.user || {}) })
                    }
                }
            }
            setMembers([...teamMembers.values()])
            const accessibleProjects = Array.isArray(loadedProjects) ? loadedProjects.filter((project) => {
                if (role === 'MEMBER') return project.isMember
                if (role === 'MANAGER') return project.canManage
                return true
            }) : []
            setProjects(accessibleProjects)
        })

        return () => {
            isCurrent = false
        }
    }, [organization?.id, organization?.role])

    useEffect(() => {
        if (searchOpen) searchInputRef.current?.focus()
    }, [searchOpen])

    useEffect(() => {
        function handleSearchShortcut(event) {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault()
                setSearchOpen(true)
                navigate('/search')
            }
        }
        window.addEventListener('keydown', handleSearchShortcut)
        return () => window.removeEventListener('keydown', handleSearchShortcut)
    }, [navigate])

    async function handleSignOut() {
        setUser(null)
        setOrganization(null)
        try {
            await logout().catch(() => null)
        } finally {
            navigate('/login', { replace: true })
        }
    }

    const isSystemAdmin = user?.systemRole === 'ADMIN' && user?.accountStatus === 'ACTIVE'
    const currentRole = (organization?.role || (isSystemAdmin ? 'SYSTEM_ADMIN' : 'MEMBER')).toUpperCase()
    const isAdmin   = currentRole === 'ADMIN'
    const isManager = currentRole === 'MANAGER' || isAdmin
    const isManagerRole = currentRole === 'MANAGER'
    const isDeveloper = currentRole === 'MEMBER'

    const currentPath = location.pathname
    const pathNameMap = {
        '/': 'Overview',
        '/developer': 'Developer Dashboard',
        '/developer/tasks': 'My Tasks',
        '/developer/projects': 'My Projects',
        '/developer/team': 'My Team',
        '/developer/submissions': 'Task Submissions',
        '/developer/performance': 'My Performance',
        '/manager': isManagerRole ? 'Overview' : 'Manager Dashboard',
        '/manager/reviews': 'Task Reviews',
        '/tasks': isManagerRole ? 'All Tasks' : 'My Tasks',
        '/projects': isManagerRole ? 'My Projects' : 'Projects',
        '/teams': isManagerRole ? 'My Teams' : 'Team',
        '/members': 'Members',
        '/system-admin': 'System Admin',
        '/analytics': 'Analytics',
        '/notifications': 'Inbox',
        '/search': 'Search',
        '/profile': 'Profile',
        '/settings': 'Settings',
        '/admin': 'Admin Console',
    }
    const currentTitle = pathNameMap[currentPath] || 'Workspace'

    const displayName = user?.name || (user?.email ? user.email.split('@')[0] : 'Workspace User')
    const userInitials = getUserInitials(displayName, 'WU')

    return (
        <div className={`app-shell ${mobileNavOpen ? 'sidebar-open' : ''} ${currentPath.startsWith('/manager') ? 'manager-shell' : ''}`}>
            {mobileNavOpen && (
                <button
                    type="button"
                    className="sidebar-scrim"
                    onClick={() => setMobileNavOpen(false)}
                    aria-label="Close navigation"
                />
            )}
            <aside className="sidebar" onClick={(event) => {
                if (event.target.closest('a')) setMobileNavOpen(false)
            }}>
                <div className="brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
                    <span className="brand-mark">W</span>
                    <span className="brand-copy">
                        <span className="brand-word">WorkFlow<span className="brand-accent">X</span></span>
                        {isManagerRole && <small className="brand-subtitle">Manage · Collaborate · Deliver</small>}
                    </span>
                </div>

                <div className="workspace-switcher" onClick={() => navigate('/settings')} style={{ cursor: 'pointer' }}>
                    <span className="workspace-avatar">
                        {organization?.name ? organization.name[0].toUpperCase() : 'W'}
                    </span>
                    <span>
                        <strong>{organization?.name || 'Workspace'}</strong>
                        <small>{organization?.role ? `${organization.role} Workspace` : isSystemAdmin ? 'System Admin' : 'Workspace'}</small>
                    </span>
                    <span className="chevron">⌄</span>
                </div>

                <nav aria-label="Main navigation">
                    {isManagerRole ? (
                        <>
                            <p className="nav-label">Workspace</p>
                            <NavLink to="/manager" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span className="nav-icon">⌂</span>Overview
                            </NavLink>
                            <NavLink to="/projects" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span className="nav-icon">▤</span>My Projects
                            </NavLink>
                            <NavLink to="/teams" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span className="nav-icon">♧</span>My Teams
                            </NavLink>
                            <NavLink to="/tasks" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span className="nav-icon">▣</span>All Tasks
                            </NavLink>
                            <NavLink to="/manager/reviews" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span className="nav-icon">☷</span>Task Reviews
                            </NavLink>
                            <NavLink to="/members" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span className="nav-icon">♙</span>Developers
                            </NavLink>
                            <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span className="nav-icon">⌁</span>Analytics
                            </NavLink>
                            <NavLink to="/notifications" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span className="nav-icon">♧</span>Notifications
                                {unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}
                            </NavLink>
                            <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span className="nav-icon">⚙</span>Settings
                            </NavLink>
                        </>
                    ) : (
                        <>
                            <p className="nav-label">Workspace</p>
                            <NavLink to={isDeveloper ? '/developer' : '/'} end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span className="nav-icon">▦</span>Overview
                            </NavLink>
                            <NavLink to={isDeveloper ? '/developer/tasks' : '/tasks'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span className="nav-icon">📋</span>My Tasks
                            </NavLink>
                            <NavLink to={isDeveloper ? '/developer/projects' : '/projects'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span className="nav-icon">▤</span>{isDeveloper ? 'My Projects' : 'Projects'}
                            </NavLink>
                            <NavLink to={isDeveloper ? '/developer/team' : '/teams'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span className="nav-icon">♧</span>{isDeveloper ? 'My Team' : 'Team'}
                            </NavLink>
                            {isDeveloper && (
                                <>
                                    <p className="nav-label nav-label-spaced">Developer</p>
                                    <NavLink to="/developer/submissions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                        <span className="nav-icon">↗</span>Task Submissions
                                    </NavLink>
                                    <NavLink to="/developer/performance" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                        <span className="nav-icon">▥</span>My Performance
                                    </NavLink>
                                </>
                            )}
                            {isManager && (
                                <>
                                    <p className="nav-label nav-label-spaced">Management</p>
                                    <NavLink to="/manager" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                        <span className="nav-icon">◫</span>Manager Dashboard
                                    </NavLink>
                                    <NavLink to="/manager/reviews" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                        <span className="nav-icon">✓</span>Task Reviews
                                    </NavLink>
                                    <NavLink to="/members" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                        <span className="nav-icon">👤</span>Members
                                    </NavLink>
                                    <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                        <span className="nav-icon">📊</span>Analytics
                                    </NavLink>
                                </>
                            )}
                            {isAdmin && (
                                <>
                                    <p className="nav-label nav-label-spaced">Administration</p>
                                    <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                        <span className="nav-icon">🛡️</span>Workspace Admin
                                    </NavLink>
                                </>
                            )}
                            {isSystemAdmin && (
                                <>
                                    {!isAdmin && <p className="nav-label nav-label-spaced">Administration</p>}
                                    <NavLink to="/system-admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                        <span className="nav-icon">🌐</span>System Admin
                                    </NavLink>
                                </>
                            )}
                            <p className="nav-label nav-label-spaced">Personal</p>
                            <NavLink to="/notifications" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span className="nav-icon">◌</span>Inbox
                                {unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}
                            </NavLink>
                            {isDeveloper ? (
                                <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                    <span className="nav-icon">⚙</span>Profile Settings
                                </NavLink>
                            ) : (
                                <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                    <span className="nav-icon">⚙</span>Settings
                                </NavLink>
                            )}
                        </>
                    )}
                </nav>

                {!isManagerRole && <section className="sidebar-section" aria-label="Projects">
                    <div className="sidebar-section-heading">
                        <span className="nav-label">{isDeveloper ? 'My Projects' : 'Projects'}</span>
                        <button type="button" onClick={() => navigate('/projects')} aria-label="View all projects">+</button>
                    </div>
                    {projects.length === 0 ? (
                        <button type="button" className="sidebar-list-link sidebar-muted-link" onClick={() => navigate(isDeveloper ? '/developer/projects' : '/projects')}>
                            Browse projects
                        </button>
                    ) : projects.slice(0, 5).map((project) => (
                        <button
                            type="button"
                            className="sidebar-list-link"
                            key={project.id || project.name}
                            onClick={() => navigate(isDeveloper ? '/developer/projects' : `/tasks?project=${encodeURIComponent(project.name)}`)}
                            title={project.name}
                        >
                            <span className={`project-status-dot status-${String(project.status || 'active').toLowerCase().replace(/[^a-z]+/g, '-')}`} />
                            <span>{project.name}</span>
                        </button>
                    ))}
                </section>}

                <section className="sidebar-section sidebar-team-section" aria-label="Team members">
                    <div className="sidebar-section-heading">
                        <span className="nav-label">{isManagerRole ? 'Team Members' : 'Your team'}</span>
                        {members.length > 0 && <span className="sidebar-member-count">{members.length}</span>}
                    </div>
                    {members.slice(0, 4).map((member) => {
                        const memberName = member.name || member.user?.name || member.email || member.user?.email || 'Team member'
                        const avatarUrl = member.avatarUrl || member.user?.avatarUrl
                        return (
                            <button
                                type="button"
                                className="sidebar-member"
                                key={member.userId || member.id || member.email}
                                onClick={() => navigate('/teams')}
                                title={`${memberName}${member.role ? ` · ${member.role}` : ''}`}
                            >
                                <span className="sidebar-member-avatar">
                                    {avatarUrl ? <img src={avatarUrl} alt="" /> : getUserInitials(memberName, 'TM')}
                                </span>
                                <span className="sidebar-member-detail">
                                    <strong>{memberName}</strong>
                                    <small>{member.role === 'MEMBER' ? 'Developer' : member.role || 'Team member'}</small>
                                </span>
                                <span className="sidebar-member-presence" aria-label="Workspace member" />
                            </button>
                        )
                    })}
                    {members.length === 0 && (
                        <button type="button" className="sidebar-list-link sidebar-muted-link" onClick={() => navigate('/teams')}>
                            Open team workspace
                        </button>
                    )}
                </section>

                <div className="sidebar-footer" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px' }}>
                    <div
                        className="user-avatar"
                        style={{ cursor: 'pointer', overflow: 'hidden', padding: 0, display: 'grid', placeItems: 'center' }}
                        onClick={() => navigate('/profile')}
                    >
                        {user?.avatarUrl ? (
                            <img
                                src={user.avatarUrl}
                                alt={displayName}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                                onError={(e) => {
                                    e.target.style.display = 'none'
                                }}
                            />
                        ) : (
                            userInitials
                        )}
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
                        type="button"
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
                        aria-label="Exit"
                        title="Exit workspace and return to sign in"
                    >
                        <span>↪</span> Exit
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <header className="topbar">
                    <div className="topbar-leading">
                        <button
                            type="button"
                            className="mobile-menu-button"
                            onClick={() => setMobileNavOpen(true)}
                            aria-label="Open navigation"
                            aria-expanded={mobileNavOpen}
                        >
                            ☰
                        </button>
                        <div className="breadcrumbs">
                        <span>Workspace</span>
                        <b>/</b>
                        <strong>{currentTitle}</strong>
                        </div>
                    </div>
                    <div className="top-actions">
                        <form className={`topbar-search ${searchOpen ? 'is-open' : ''}`} onSubmit={(event) => {
                            event.preventDefault()
                            navigate(`/search${searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : ''}`)
                            setSearchQuery('')
                            setSearchOpen(false)
                        }}>
                            <button
                                type="button"
                                className="topbar-search-trigger"
                                aria-label="Open workspace search"
                                onClick={() => {
                                    setSearchOpen(true)
                                    navigate('/search')
                                }}
                            >
                                ⌕
                            </button>
                            <span aria-hidden="true">⌕</span>
                            <input
                                ref={searchInputRef}
                                aria-label="Search workspace"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                onFocus={() => {
                                    if (location.pathname !== '/search') navigate('/search')
                                }}
                                placeholder="Search projects, tasks, or team members..."
                            />
                            <kbd>Ctrl K</kbd>
                        </form>
                        <button className="icon-button notification" aria-label="Notifications" onClick={() => navigate('/notifications')}>
                            ♧{unreadCount > 0 && <i />}
                        </button>
                        <button className="icon-button" aria-label="Messages" onClick={() => navigate('/notifications')}>
                            ✉
                        </button>
                        <div className="profile-menu-wrap">
                            <button
                                type="button"
                                className="topbar-profile"
                                onClick={() => setProfileMenuOpen((open) => !open)}
                                aria-expanded={profileMenuOpen}
                            >
                                <span className="topbar-avatar">
                                    {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : userInitials}
                                </span>
                                <span className="topbar-profile-copy">
                                    <strong>{displayName}</strong>
                                    <small>{isManagerRole ? 'Manager' : user?.email || currentRole}</small>
                                </span>
                                <span className="topbar-chevron">⌄</span>
                            </button>
                            {profileMenuOpen && (
                                <div className="profile-dropdown">
                                    <button type="button" onClick={() => { setProfileMenuOpen(false); navigate('/profile') }}>My profile</button>
                                    <button type="button" onClick={() => { setProfileMenuOpen(false); navigate('/settings') }}>Workspace settings</button>
                                    <button type="button" onClick={() => { setProfileMenuOpen(false); handleSignOut() }}>Sign out</button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <div className="content-wrap">
                    {currentPath === '/system-admin' && !isSystemAdmin ? (
                        <div
                            id="system-admin-access-restricted-card"
                            style={{ maxWidth: '580px', margin: '60px auto', background: '#fff', border: '1px solid #fee2e2', borderRadius: '12px', padding: '36px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                        >
                            <h2 style={{ margin: '0 0 8px', color: '#111827', fontSize: '20px' }}>System Admin Restricted</h2>
                            <p style={{ color: '#4b5563', fontSize: '13px', lineHeight: '1.6', marginBottom: '20px' }}>Global administration is available only to active system administrators.</p>
                            <button type="button" className="secondary-button" onClick={() => navigate('/')}>Go to Overview</button>
                        </div>
                    ) : currentPath === '/admin' && !isAdmin ? (
                        <div
                            id="admin-access-restricted-card"
                            style={{ maxWidth: '580px', margin: '60px auto', background: '#fff', border: '1px solid #fee2e2', borderRadius: '12px', padding: '36px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                        >
                            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'grid', placeItems: 'center', fontSize: '26px', margin: '0 auto 16px' }}>🚫</div>
                            <h2 style={{ margin: '0 0 8px', color: '#111827', fontSize: '20px' }}>Admin Console Restricted</h2>
                            <p style={{ color: '#4b5563', fontSize: '13px', lineHeight: '1.6', marginBottom: '16px' }}>You are signed in as <b>{user?.name || user?.email || 'User'}</b> with the role <span style={{ fontWeight: 700, color: '#dc2626' }}>{currentRole}</span>.</p>
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#334155', lineHeight: '1.5', marginBottom: '24px', textAlign: 'left' }}>📌 <b>WorkFlowX Security Policy:</b><br />The same email address cannot have access to different roles. If you want to use the <b>ADMIN</b> role, you must log out of this account and sign in or sign up with an Administrator email.</div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                <button type="button" className="secondary-button" onClick={() => navigate('/')}>Go to Overview</button>
                                <button id="restricted-logout-btn" type="button" className="primary-button" onClick={handleSignOut} style={{ background: '#dc2626' }}>Log Out &amp; Switch Role</button>
                            </div>
                        </div>
                    ) : (currentPath === '/analytics' || currentPath === '/members') && !isManager ? (
                        <div
                            style={{ maxWidth: '540px', margin: '60px auto', background: '#fff', border: '1px solid #fef3c7', borderRadius: '12px', padding: '36px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                        >
                            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fef3c7', color: '#d97706', display: 'grid', placeItems: 'center', fontSize: '26px', margin: '0 auto 16px' }}>🔒</div>
                            <h2 style={{ margin: '0 0 8px', color: '#111827', fontSize: '20px' }}>Access Restricted</h2>
                            <p style={{ color: '#4b5563', fontSize: '13px', lineHeight: '1.6', marginBottom: '24px' }}>This section is available to <b>Managers</b> and <b>Administrators</b> only. Your current role is <span style={{ fontWeight: 700, color: '#d97706' }}>{currentRole}</span>.</p>
                            <button type="button" className="primary-button" onClick={() => navigate('/')}>Go to My Dashboard</button>
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
