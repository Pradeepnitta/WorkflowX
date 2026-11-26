import { useCallback, useEffect, useState } from 'react'
import {
    getSystemAdminAuditLogs,
    getSystemAdminOverview,
    getSystemAdminUsers,
    updateSystemAdminUser,
} from '../services/systemAdminService.js'
import { getUserInitials } from '../constants/avatarOptions.js'
import './SystemAdminPage.css'

const pageSize = 25
const overviewCards = [
    ['totalUsers', 'Users'],
    ['activeUsers', 'Active users'],
    ['totalAdmins', 'System admins'],
    ['totalManagers', 'Managers'],
    ['totalDevelopers', 'Developers'],
    ['totalProjects', 'Projects'],
    ['activeProjects', 'Active projects'],
    ['totalTeams', 'Teams'],
    ['totalTasks', 'Tasks'],
    ['pendingTasks', 'To do'],
    ['inProgressTasks', 'In progress'],
    ['tasksUnderReview', 'In review'],
    ['completedTasks', 'Completed'],
    ['overdueTasks', 'Overdue'],
    ['newRegistrations', 'New users (30 days)'],
]

function formatDate(value) {
    if (!value) return 'Never'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString()
}

function getErrorMessage(error) {
    return error?.message || 'The request could not be completed.'
}

export default function SystemAdminPage() {
    const [overview, setOverview] = useState(null)
    const [users, setUsers] = useState([])
    const [totalUsers, setTotalUsers] = useState(0)
    const [auditLogs, setAuditLogs] = useState([])
    const [offset, setOffset] = useState(0)
    const [search, setSearch] = useState('')
    const [role, setRole] = useState('')
    const [accountStatus, setAccountStatus] = useState('')
    const [loading, setLoading] = useState(true)
    const [usersLoading, setUsersLoading] = useState(false)
    const [busyUserId, setBusyUserId] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    const loadOverviewAndAudit = useCallback(async () => {
        const [nextOverview, auditResult] = await Promise.all([
            getSystemAdminOverview(),
            getSystemAdminAuditLogs({ limit: 10 }),
        ])
        setOverview(nextOverview)
        setAuditLogs(auditResult?.logs || [])
    }, [])

    const loadUsers = useCallback(async (nextOffset = 0) => {
        setUsersLoading(true)
        try {
            const result = await getSystemAdminUsers({
                search: search.trim(),
                role,
                accountStatus,
                limit: pageSize,
                offset: nextOffset,
            })
            setUsers(result?.users || [])
            setTotalUsers(Number(result?.total || 0))
            setOffset(nextOffset)
        } finally {
            setUsersLoading(false)
        }
    }, [accountStatus, role, search])

    useEffect(() => {
        let current = true
        Promise.all([
            getSystemAdminOverview(),
            getSystemAdminAuditLogs({ limit: 10 }),
            getSystemAdminUsers({ limit: pageSize, offset: 0 }),
        ])
            .then(([nextOverview, auditResult, result]) => {
                if (!current) return
                setOverview(nextOverview)
                setAuditLogs(auditResult?.logs || [])
                setUsers(result?.users || [])
                setTotalUsers(Number(result?.total || 0))
            })
            .catch((requestError) => {
                if (current) setError(getErrorMessage(requestError))
            })
            .finally(() => {
                if (current) setLoading(false)
            })
        return () => {
            current = false
        }
    }, [loadOverviewAndAudit])

    async function applyFilters(event) {
        event.preventDefault()
        setError('')
        try {
            await loadUsers(0)
        } catch (requestError) {
            setError(getErrorMessage(requestError))
        }
    }

    async function updateAccount(user, changes) {
        setBusyUserId(user.id)
        setError('')
        setSuccess('')
        try {
            const updated = await updateSystemAdminUser(user.id, changes)
            setUsers((current) => current.map((entry) => entry.id === user.id ? { ...entry, ...updated } : entry))
            await loadOverviewAndAudit()
            setSuccess(`Updated account for ${updated.name || updated.email}.`)
        } catch (requestError) {
            setError(getErrorMessage(requestError))
        } finally {
            setBusyUserId('')
        }
    }

    async function changeSystemRole(user, systemRole) {
        if (user.systemRole === systemRole) return
        if (systemRole === 'ADMIN' && !window.confirm(`Grant global System Admin access to ${user.email}?`)) return
        await updateAccount(user, { systemRole })
    }

    async function changeAccountStatus(user, nextStatus) {
        if (user.accountStatus === nextStatus) return
        await updateAccount(user, { accountStatus: nextStatus })
    }

    async function changePage(nextOffset) {
        setError('')
        try {
            await loadUsers(nextOffset)
        } catch (requestError) {
            setError(getErrorMessage(requestError))
        }
    }

    if (loading) {
        return <main className="feature-page"><p className="loading-state">Loading system administration data...</p></main>
    }

    return (
        <main className="feature-page system-admin-page">
            <header className="feature-heading">
                <div>
                    <p className="eyebrow">Global administration</p>
                    <h1>System Admin</h1>
                    <p className="heading-subtitle">Manage application accounts and monitor activity across all workspaces.</p>
                </div>
                <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                        setError('')
                        Promise.all([loadOverviewAndAudit(), loadUsers(offset)])
                            .catch((requestError) => setError(getErrorMessage(requestError)))
                    }}
                >
                    Refresh data
                </button>
            </header>

            {error && <p className="service-error" role="alert">{error}</p>}
            {success && <p className="service-success" role="status">{success}</p>}

            <section className="system-admin-metrics" aria-label="Global application metrics">
                {overviewCards.map(([key, label]) => (
                    <article className="panel system-admin-metric" key={key}>
                        <span>{label}</span>
                        <strong>{Number(overview?.[key] || 0).toLocaleString()}</strong>
                    </article>
                ))}
            </section>

            <section className="panel system-admin-section">
                <div className="panel-heading">
                    <div>
                        <h2>Global accounts</h2>
                        <p>Account role and status apply across the application. Workspace roles remain organization-scoped.</p>
                    </div>
                    <strong>{totalUsers.toLocaleString()} accounts</strong>
                </div>

                <form className="system-admin-filters" onSubmit={applyFilters}>
                    <label>
                        Search accounts
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Name or email"
                        />
                    </label>
                    <label>
                        Workspace role
                        <select value={role} onChange={(event) => setRole(event.target.value)}>
                            <option value="">All roles</option>
                            <option value="ADMIN">Workspace Admin</option>
                            <option value="MANAGER">Manager</option>
                            <option value="MEMBER">Developer</option>
                            <option value="VIEWER">Viewer</option>
                        </select>
                    </label>
                    <label>
                        Account status
                        <select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)}>
                            <option value="">All statuses</option>
                            <option value="ACTIVE">Active</option>
                            <option value="INACTIVE">Inactive</option>
                            <option value="SUSPENDED">Suspended</option>
                        </select>
                    </label>
                    <button className="primary-button" type="submit" disabled={usersLoading}>
                        {usersLoading ? 'Loading...' : 'Apply filters'}
                    </button>
                </form>

                <div className="system-admin-table-wrap">
                    <table className="system-admin-table">
                        <thead>
                            <tr>
                                <th>Account</th>
                                <th>Workspace memberships</th>
                                <th>System role</th>
                                <th>Status</th>
                                <th>Last active</th>
                                <th>Registered</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id}>
                                    <td>
                                        <div className="system-admin-user">
                                            <span className="system-admin-avatar">{getUserInitials(user.name || user.email, 'U')}</span>
                                            <span><strong>{user.name}</strong><small>{user.email}</small></span>
                                        </div>
                                    </td>
                                    <td>
                                        {user.memberships?.length
                                            ? user.memberships.map((membership) => (
                                                <span className="system-admin-membership" key={`${membership.organizationId}:${membership.role}`}>
                                                    {membership.role}
                                                </span>
                                            ))
                                            : <span className="system-admin-muted">No workspace membership</span>}
                                    </td>
                                    <td>
                                        <select
                                            aria-label={`System role for ${user.email}`}
                                            value={user.systemRole || 'USER'}
                                            disabled={busyUserId === user.id}
                                            onChange={(event) => changeSystemRole(user, event.target.value)}
                                        >
                                            <option value="USER">User</option>
                                            <option value="ADMIN">System Admin</option>
                                        </select>
                                    </td>
                                    <td>
                                        <select
                                            aria-label={`Account status for ${user.email}`}
                                            value={user.accountStatus || 'ACTIVE'}
                                            disabled={busyUserId === user.id}
                                            onChange={(event) => changeAccountStatus(user, event.target.value)}
                                        >
                                            <option value="ACTIVE">Active</option>
                                            <option value="INACTIVE">Inactive</option>
                                            <option value="SUSPENDED">Suspended</option>
                                        </select>
                                    </td>
                                    <td>{formatDate(user.lastActiveAt)}</td>
                                    <td>{formatDate(user.createdAt)}</td>
                                </tr>
                            ))}
                            {!usersLoading && users.length === 0 && (
                                <tr><td className="system-admin-empty" colSpan="6">No accounts match these filters.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="system-admin-pagination">
                    <span>Showing {totalUsers === 0 ? 0 : offset + 1}–{Math.min(offset + users.length, totalUsers)} of {totalUsers}</span>
                    <div>
                        <button className="secondary-button" type="button" disabled={offset === 0 || usersLoading} onClick={() => changePage(Math.max(0, offset - pageSize))}>Previous</button>
                        <button className="secondary-button" type="button" disabled={offset + pageSize >= totalUsers || usersLoading} onClick={() => changePage(offset + pageSize)}>Next</button>
                    </div>
                </div>
            </section>

            <section className="panel system-admin-section">
                <div className="panel-heading">
                    <div>
                        <h2>Recent audit activity</h2>
                        <p>Administrative account actions are recorded on the server.</p>
                    </div>
                </div>
                {auditLogs.length === 0 ? (
                    <p className="system-admin-empty">No audit activity has been recorded.</p>
                ) : (
                    <div className="system-admin-audit-list">
                        {auditLogs.map((log) => (
                            <article className="system-admin-audit-item" key={log.id}>
                                <div><strong>{log.action.replaceAll('_', ' ')}</strong><span>{log.actorName || log.actorEmail || 'System'}</span></div>
                                <small>{log.resourceType}{log.resourceId ? ` · ${log.resourceId}` : ''}</small>
                                <time>{formatDate(log.createdAt)}</time>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </main>
    )
}
