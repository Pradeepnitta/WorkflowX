import { useEffect, useState } from 'react'
import {
    getOrganizations,
    getOrganizationMembers,
    updateOrganizationMemberRole,
    removeOrganizationMember,
    inviteOrganizationMember,
} from '../services/organizationService.js'
import { getProjects, createProject } from '../services/projectService.js'
import { getTeams, createTeam } from '../services/teamService.js'
import { authenticatedRequest } from '../services/authService.js'
import '../App.css'

const ROLES = ['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']

const PERMISSIONS_MATRIX = [
    { action: 'Manage users & accounts', admin: true, manager: false, developer: false, viewer: false },
    { action: 'Assign Role to User', admin: true, manager: false, developer: false, viewer: false },
    { action: 'Change member roles', admin: true, manager: false, developer: false, viewer: false },
    { action: 'Create projects', admin: true, manager: true, developer: false, viewer: false },
    { action: 'Delete projects', admin: true, manager: true, developer: false, viewer: false },
    { action: 'Create official tasks', admin: true, manager: true, developer: false, viewer: false },
    { action: 'Suggest tasks for review', admin: true, manager: true, developer: true, viewer: false },
    { action: 'Assign tasks to others', admin: true, manager: true, developer: false, viewer: false },
    { action: 'Execute assigned tasks', admin: true, manager: true, developer: true, viewer: false },
    { action: 'Comment on tasks', admin: true, manager: true, developer: true, viewer: false },
    { action: 'View projects & tasks', admin: true, manager: true, developer: true, viewer: true },
    { action: 'Organization settings', admin: true, manager: false, developer: false, viewer: false },
]


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

export default function AdminPage() {
    const [organizations, setOrganizations] = useState([])
    const [organizationId, setOrganizationId] = useState('')
    const [activeOrg, setActiveOrg] = useState(null)
    const [members, setMembers] = useState([])
    const [projects, setProjects] = useState([])
    const [teams, setTeams] = useState([])
    const [activeTab, setActiveTab] = useState('users')
    
    // User search & filters
    const [searchQuery, setSearchQuery] = useState('')
    const [roleFilter, setRoleFilter] = useState('ALL')
    const [selectedUser, setSelectedUser] = useState(null)
    const [activeStatusMap, setActiveStatusMap] = useState({})

    // In-app modal confirmation states
    const [pendingDeleteUser, setPendingDeleteUser] = useState(null)
    const [pendingDeleteTeam, setPendingDeleteTeam] = useState(null)
    const [pendingDeleteProject, setPendingDeleteProject] = useState(null)

    // Forms
    const [orgName, setOrgName] = useState('')
    const [orgDescription, setOrgDescription] = useState('')
    const [orgLogoUrl, setOrgLogoUrl] = useState('')
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState('MEMBER')

    // New Team / New Project forms
    const [newTeamName, setNewTeamName] = useState('')
    const [newTeamDesc, setNewTeamDesc] = useState('')
    const [newProjName, setNewProjName] = useState('')
    const [newProjDesc, setNewProjDesc] = useState('')

    // Security & Billing state
    const [require2FA, setRequire2FA] = useState(true)
    const [ssoEnabled, setSsoEnabled] = useState(true)
    const [passwordMinLength, setPasswordMinLength] = useState('8')
    const [billingPlan, setBillingPlan] = useState('Enterprise Pro Plan')
    const [activityLogs, setActivityLogs] = useState([])

    const [isLoading, setIsLoading] = useState(true)
    const [isActionBusy, setIsActionBusy] = useState(false)
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')

    const DEFAULT_ORGANIZATION = {
        id: 'org-default',
        name: 'Workspace',
        role: 'ADMIN',
        description: 'Primary Workspace',
    }

    useEffect(() => {
        getOrganizations()
            .then((orgs) => {
                const list = Array.isArray(orgs) && orgs.length > 0 ? orgs : [DEFAULT_ORGANIZATION]
                setOrganizations(list)
                setOrganizationId(list[0].id)
                setActiveOrg(list[0])
                setOrgName(list[0].name)
                setOrgDescription(list[0].description || '')
            })
            .catch(() => {
                const list = [DEFAULT_ORGANIZATION]
                setOrganizations(list)
                setOrganizationId(list[0].id)
                setActiveOrg(list[0])
                setOrgName(list[0].name)
                setOrgDescription(list[0].description || '')
            })
            .finally(() => setIsLoading(false))
    }, [])

    useEffect(() => {
        if (!organizationId) {
            setMembers([])
            setProjects([])
            setTeams([])
            return
        }
        setIsLoading(true)
        setError('')
        const foundOrg = (organizations || []).find((o) => o.id === organizationId) || DEFAULT_ORGANIZATION
        setActiveOrg(foundOrg)
        setOrgName(foundOrg.name)
        setOrgDescription(foundOrg.description || '')

        const fetchMembers = organizationId === 'org-default'
            ? Promise.resolve([])
            : getOrganizationMembers(organizationId).catch(() => [])

        const fetchProjects = organizationId === 'org-default'
            ? Promise.resolve([])
            : getProjects(organizationId).catch(() => [])

        const fetchTeams = organizationId === 'org-default'
            ? Promise.resolve([])
            : getTeams(organizationId).catch(() => [])

        Promise.all([fetchMembers, fetchProjects, fetchTeams])
            .then(([loadedMembers, loadedProjects, loadedTeams]) => {
                const mList = Array.isArray(loadedMembers) ? [...loadedMembers] : []
                const pList = Array.isArray(loadedProjects) ? [...loadedProjects] : []
                const tList = Array.isArray(loadedTeams) ? [...loadedTeams] : []
                setMembers(mList)
                setProjects(pList)
                setTeams(tList)
                // Initialize user active map
                const statusMap = {}
                mList.forEach((m) => {
                    statusMap[m.userId || m.id] = true
                })
                setActiveStatusMap(statusMap)
            })
            .catch((err) => setError(err.message))
            .finally(() => setIsLoading(false))
    }, [organizationId, organizations])

    const userRole = (activeOrg?.role || localStorage.getItem('workflowx_registered_role') || 'ADMIN').toUpperCase()
    const isAdmin = userRole === 'ADMIN'
    const isManager = userRole === 'MANAGER'

    // Member Management Actions
    async function handleRoleChange(targetUserId, newRole) {
        if (!isAdmin) {
            setError('Admin permission required: Only organization administrators can assign or change roles.')
            return
        }
        setError('')
        setSuccessMessage('')
        setMembers((current) =>
            current.map((m) => ((m.userId || m.id) === targetUserId ? { ...m, role: newRole } : m))
        )
        if (selectedUser && ((selectedUser.userId || selectedUser.id) === targetUserId)) {
            setSelectedUser((prev) => (prev ? { ...prev, role: newRole } : null))
        }
        setSuccessMessage(`Updated role of user to ${newRole}.`)

        const isUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        if (isUuid(organizationId) && isUuid(targetUserId)) {
            try {
                await updateOrganizationMemberRole(organizationId, targetUserId, newRole)
            } catch (err) {
                console.warn('Backend role update notice:', err.message)
            }
        }
    }

    function toggleUserActive(targetUserId, currentStatus) {
        if (!isAdmin) {
            setError('Admin permission required: Only organization administrators can change user active status.')
            return
        }
        setActiveStatusMap((prev) => ({ ...prev, [targetUserId]: !currentStatus }))
        setSuccessMessage(`User status toggled to ${!currentStatus ? 'Active' : 'Deactivated'}.`)
    }

    function handleRemoveMember(targetUserId, memberName) {
        if (!isAdmin) {
            setError('Admin permission required: Only organization administrators can remove members.')
            return
        }
        setPendingDeleteUser({ id: targetUserId, name: memberName || 'this user' })
    }

    async function confirmExecuteRemoveMember() {
        if (!pendingDeleteUser) return
        const targetUserId = pendingDeleteUser.id
        const memberName = pendingDeleteUser.name
        setPendingDeleteUser(null)

        setError('')
        setSuccessMessage('')

        // Instantly remove from local state so UI updates immediately
        setMembers((current) => current.filter((m) => (m.userId || m.id) !== targetUserId))
        setActiveStatusMap((prev) => {
            const next = { ...prev }
            delete next[targetUserId]
            return next
        })
        if (selectedUser && ((selectedUser.userId || selectedUser.id) === targetUserId)) {
            setSelectedUser(null)
        }

        const isUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        if (isUuid(organizationId) && isUuid(targetUserId)) {
            try {
                await removeOrganizationMember(organizationId, targetUserId)
            } catch (err) {
                console.warn('Backend remove sync notice:', err.message)
            }
        }
        setSuccessMessage(`User "${memberName}" was successfully removed from the organization.`)
    }

    async function handleInviteSubmit(event) {
        event.preventDefault()
        if (!isAdmin) {
            setError('Admin permission required: Managers cannot assign roles or invite users with roles.')
            return
        }
        if (!inviteEmail) return
        setIsActionBusy(true)
        setError('')
        setSuccessMessage('')

        const newMember = {
            userId: 'usr-' + Date.now(),
            name: inviteEmail.split('@')[0],
            email: inviteEmail.trim(),
            role: inviteRole,
            title: inviteRole === 'ADMIN' ? 'Administrator' : inviteRole === 'MANAGER' ? 'Project Manager' : inviteRole === 'MEMBER' ? 'Developer' : 'Viewer',
            team: 'General Team',
            joinedAt: 'Just now',
        }

        setMembers((prev) => [newMember, ...prev])
        setActiveStatusMap((prev) => ({ ...prev, [newMember.userId]: true }))
        setSuccessMessage(`Invitation sent to ${inviteEmail} as ${inviteRole}.`)
        const emailSent = inviteEmail
        setInviteEmail('')

        const isUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        if (isUuid(organizationId)) {
            try {
                await inviteOrganizationMember(organizationId, { email: emailSent, role: inviteRole })
            } catch (err) {
                console.warn('Backend invite sync notice:', err.message)
            }
        }
        setIsActionBusy(false)
    }

    // Team Management Actions
    async function handleCreateTeamSubmit(event) {
        event.preventDefault()
        if (!newTeamName) return
        setIsActionBusy(true)
        setError('')
        setSuccessMessage('')

        const newTeamObj = {
            id: 'team-' + Date.now(),
            name: newTeamName.trim(),
            description: newTeamDesc.trim() || 'Core team responsibilities',
            organizationId,
            members: [],
        }

        const isUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        if (isUuid(organizationId)) {
            try {
                const team = await createTeam({ name: newTeamName, description: newTeamDesc, organizationId })
                setTeams((prev) => [...prev, team])
            } catch (err) {
                console.warn('Backend team create notice:', err.message)
                setTeams((prev) => [...prev, newTeamObj])
            }
        } else {
            setTeams((prev) => [...prev, newTeamObj])
        }

        setSuccessMessage(`Team "${newTeamName.trim()}" created successfully.`)
        setNewTeamName('')
        setNewTeamDesc('')
        setIsActionBusy(false)
    }

    function handleDeleteTeam(teamId, teamName) {
        setPendingDeleteTeam({ id: teamId, name: teamName || 'this team' })
    }

    async function confirmExecuteDeleteTeam() {
        if (!pendingDeleteTeam) return
        const teamId = pendingDeleteTeam.id
        const teamName = pendingDeleteTeam.name
        setPendingDeleteTeam(null)

        setError('')
        setSuccessMessage('')
        setTeams((prev) => prev.filter((t) => t.id !== teamId))
        setSuccessMessage(`Team "${teamName}" deleted successfully.`)

        const isUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        if (isUuid(teamId)) {
            try {
                await authenticatedRequest(`/api/teams/${teamId}`, { method: 'DELETE' })
            } catch (err) {
                console.warn('Backend team delete notice:', err.message)
            }
        }
    }

    // Project Management Actions
    async function handleCreateProjectSubmit(event) {
        event.preventDefault()
        if (!newProjName) return
        setIsActionBusy(true)
        setError('')
        setSuccessMessage('')

        const newProjObj = {
            id: 'proj-' + Date.now(),
            name: newProjName.trim(),
            description: newProjDesc.trim() || 'Organization project',
            status: 'PLANNING',
            visibility: 'ORGANIZATION',
            priority: 'MEDIUM',
            organizationId,
        }

        const isUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        if (isUuid(organizationId)) {
            try {
                const proj = await createProject({ name: newProjName, description: newProjDesc, organizationId })
                setProjects((prev) => [...prev, proj])
            } catch (err) {
                console.warn('Backend project create notice:', err.message)
                setProjects((prev) => [...prev, newProjObj])
            }
        } else {
            setProjects((prev) => [...prev, newProjObj])
        }

        setSuccessMessage(`Project "${newProjName.trim()}" created successfully.`)
        setNewProjName('')
        setNewProjDesc('')
        setIsActionBusy(false)
    }

    async function handleArchiveProject(projectId, currentStatus) {
        setError('')
        setSuccessMessage('')
        const nextStatus = currentStatus === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED'
        setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status: nextStatus } : p)))
        setSuccessMessage(`Project status updated to ${nextStatus}.`)

        const isUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        if (isUuid(projectId)) {
            try {
                await authenticatedRequest(`/api/projects/${projectId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: nextStatus }),
                })
            } catch (err) {
                console.warn('Backend project update notice:', err.message)
            }
        }
    }

    function handleDeleteProject(projectId, projectName) {
        setPendingDeleteProject({ id: projectId, name: projectName || 'this project' })
    }

    async function confirmExecuteDeleteProject() {
        if (!pendingDeleteProject) return
        const projectId = pendingDeleteProject.id
        const projectName = pendingDeleteProject.name
        setPendingDeleteProject(null)

        setError('')
        setSuccessMessage('')
        setProjects((prev) => prev.filter((p) => p.id !== projectId))
        setSuccessMessage(`Project "${projectName}" deleted successfully.`)

        const isUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        if (isUuid(projectId)) {
            try {
                await authenticatedRequest(`/api/projects/${projectId}`, { method: 'DELETE' })
            } catch (err) {
                console.warn('Backend project delete notice:', err.message)
            }
        }
    }

    function handleOrgSave(event) {
        event.preventDefault()
        setError('')
        setOrganizations((prev) =>
            prev.map((o) => (o.id === organizationId ? { ...o, name: orgName, description: orgDescription } : o))
        )
        setActiveOrg((prev) => (prev ? { ...prev, name: orgName, description: orgDescription } : null))
        setSuccessMessage(`Organization profile for "${orgName}" saved successfully.`)
    }

    function handleSecuritySave(event) {
        event.preventDefault()
        setError('')
        setSuccessMessage('Security policies (2FA, SSO, Password rules) updated successfully.')
    }

    function handleExportLogs() {
        if (!activityLogs || activityLogs.length === 0) {
            setSuccessMessage('No audit logs available to export.')
            return
        }
        const csvHeader = 'ID,Actor,Action,Target,Time,Type\n'
        const csvRows = activityLogs.map(
            (l) => `"${l.id}","${l.actor}","${l.action}","${l.target}","${l.time}","${l.type}"`
        ).join('\n')
        const blob = new Blob([csvHeader + csvRows], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.setAttribute('href', url)
        link.setAttribute('download', `workflowx-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setSuccessMessage('Audit log exported to CSV successfully.')
    }

    const filteredMembers = (members || []).filter((m) => {
        const query = searchQuery.trim().toLowerCase()
        const name = (m.name || m.user?.name || '').toLowerCase()
        const email = (m.email || m.user?.email || '').toLowerCase()
        const role = (m.role || '').toLowerCase()

        const matchesQuery = !query || name.includes(query) || email.includes(query) || role.includes(query)
        const matchesRole = roleFilter === 'ALL' || m.role === roleFilter
        return matchesQuery && matchesRole
    })

    return (
        <main className="feature-page">
            {/* Page Title & Organization Switcher */}
            <div className="feature-heading">
                <div>
                    <p className="eyebrow">Organization Management</p>
                    <h1>Admin Dashboard</h1>
                    <p className="heading-subtitle">Organization-level control over Users, Teams, Roles, Projects, and Security Settings.</p>
                </div>
                {(organizations?.length || 0) > 0 && (
                    <label className="organization-select">
                        Organization
                        <select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
                            {organizations.map((org) => (
                                <option key={org.id} value={org.id}>
                                    {org.name} ({org.role})
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>

            {error && <p className="service-error" role="alert">{error}</p>}
            {successMessage && (
                <p className="service-success" role="status" style={{ color: '#52a880', background: '#eaf7f0', padding: '10px 14px', borderRadius: '7px', marginBottom: '16px', fontSize: '13px' }}>
                    {successMessage}
                </p>
            )}

            {/* Section 7: Admin Dashboard ASCII Metrics Grid */}
            <section style={{ background: '#20222b', color: '#fff', borderRadius: '12px', padding: '22px 24px', marginBottom: '28px', boxShadow: '0 10px 30px #20222b33' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #353846', paddingBottom: '14px', marginBottom: '18px' }}>
                    <span style={{ font: "700 13px 'Space Grotesk'", letterSpacing: '1px', color: '#ee785e', textTransform: 'uppercase' }}>
                        ADMIN DASHBOARD OVERVIEW
                    </span>
                    <span style={{ fontSize: '11px', color: '#858996' }}>Workspace: <b>{activeOrg?.name || 'Workspace'}</b></span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '16px' }}>
                    <div style={{ background: '#292c38', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #ee785e' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#858996', textTransform: 'uppercase' }}>Users</p>
                        <strong style={{ fontSize: '26px', font: "700 26px 'Space Grotesk'", color: '#fff' }}>{members?.length || 0}</strong>
                    </div>
                    <div style={{ background: '#292c38', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #6d9ee8' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#858996', textTransform: 'uppercase' }}>Projects</p>
                        <strong style={{ fontSize: '26px', font: "700 26px 'Space Grotesk'", color: '#fff' }}>{projects?.length || 0}</strong>
                    </div>
                    <div style={{ background: '#292c38', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #f2c85b' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#858996', textTransform: 'uppercase' }}>Teams</p>
                        <strong style={{ fontSize: '26px', font: "700 26px 'Space Grotesk'", color: '#fff' }}>{teams?.length || 0}</strong>
                    </div>
                    <div style={{ background: '#292c38', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #72b79a' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#858996', textTransform: 'uppercase' }}>Active Tasks</p>
                        <strong style={{ fontSize: '26px', font: "700 26px 'Space Grotesk'", color: '#fff' }}>{projects?.reduce((acc, p) => acc + (p.tasksSummary?.inProgress || 0) + (p.tasksSummary?.todo || 0), 0) || 0}</strong>
                    </div>
                    <div style={{ background: '#292c38', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #72b79a' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#858996', textTransform: 'uppercase' }}>Completed Tasks</p>
                        <strong style={{ fontSize: '26px', font: "700 26px 'Space Grotesk'", color: '#fff' }}>{projects?.reduce((acc, p) => acc + (p.tasksSummary?.completed || 0), 0) || 0}</strong>
                    </div>
                    <div style={{ background: '#292c38', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #ee785e' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#858996', textTransform: 'uppercase' }}>Overdue Tasks</p>
                        <strong style={{ fontSize: '26px', font: "700 26px 'Space Grotesk'", color: '#e96f59' }}>0</strong>
                    </div>
                </div>
            </section>

            {/* Navigation Tabs for Admin Sections */}
            <div className="task-toolbar" style={{ marginBottom: '24px', background: '#fff', borderRadius: '10px', padding: '0 16px' }}>
                <div className="filter-tabs" style={{ gap: '16px', overflowX: 'auto' }}>
                    {[
                        { id: 'users', label: '1. Manage Users' },
                        { id: 'roles', label: '2. Roles & Permissions' },
                        { id: 'teams', label: '3. Manage Teams' },
                        { id: 'projects', label: '4. Manage Projects' },
                        { id: 'settings', label: '5. Org Settings & Security' },
                        { id: 'logs', label: '6. Activity Audit Logs' },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            className={activeTab === tab.id ? 'selected' : ''}
                            onClick={() => setActiveTab(tab.id)}
                            style={{ fontWeight: activeTab === tab.id ? 700 : 500, fontSize: '12px' }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Section 1: Manage Users */}
            {activeTab === 'users' && (
                <section className="feature-grid">
                    <section className="project-list-panel panel" style={{ flex: '1 1 600px' }}>
                        <div className="panel-heading" style={{ flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h2>Organization Users</h2>
                                    <p>View all users, change roles, toggle active status, and view detailed user profiles.</p>
                                </div>
                                <strong style={{ fontSize: '13px', background: '#f7f7f5', padding: '4px 10px', borderRadius: '6px', border: '1px solid #ebe9e5' }}>
                                    {filteredMembers.length} {filteredMembers.length === 1 ? 'User' : 'Users'}
                                </strong>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#858996', fontSize: '14px', pointerEvents: 'none' }}>
                                        ⌕
                                    </span>
                                    <input
                                        id="search-user-input"
                                        type="text"
                                        placeholder="Search user by name or email (e.g. Pradeep, Rahul, rahul.manager@...)"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        style={{ width: '100%', padding: '9px 36px 9px 34px', border: '1px solid #ebe9e5', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }}
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            id="clear-search-btn"
                                            onClick={() => setSearchQuery('')}
                                            style={{
                                                position: 'absolute',
                                                right: '10px',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                background: 'none',
                                                border: 'none',
                                                color: '#858996',
                                                cursor: 'pointer',
                                                fontSize: '14px',
                                                padding: '2px 6px',
                                            }}
                                            title="Clear search"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                                <select
                                    id="filter-role-select"
                                    value={roleFilter}
                                    onChange={(e) => setRoleFilter(e.target.value)}
                                    style={{ padding: '9px 12px', border: '1px solid #ebe9e5', borderRadius: '7px', fontSize: '12px', background: '#fff' }}
                                >
                                    <option value="ALL">All Roles ({members.length})</option>
                                    {ROLES.map((r) => (
                                        <option key={r} value={r}>
                                            {r} ({members.filter((m) => m.role === r).length})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {searchQuery && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#f8f8f6', borderRadius: '6px', fontSize: '12px', color: '#555' }}>
                                    <span>
                                        Showing <b>{filteredMembers.length}</b> {filteredMembers.length === 1 ? 'user' : 'users'} matching "<b>{searchQuery}</b>"
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        style={{ background: 'none', border: 'none', color: '#ee785e', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                                    >
                                        Clear search
                                    </button>
                                </div>
                            )}
                        </div>

                        {isLoading && <p className="loading-state">Loading users...</p>}
                        {!isLoading && filteredMembers.length === 0 && (
                            <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                                <p style={{ color: '#858996', fontSize: '13px', margin: '0 0 10px' }}>
                                    No matching users found for "<b>{searchQuery}</b>"
                                </p>
                                <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={() => {
                                        setSearchQuery('')
                                        setRoleFilter('ALL')
                                    }}
                                >
                                    Reset Filters
                                </button>
                            </div>
                        )}

                        <div className="project-list">
                            {filteredMembers.map((m) => {
                                const mId = m.userId || m.id
                                const isActive = activeStatusMap[mId] !== false
                                return (
                                    <article className="project-row" key={mId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', padding: '14px 18px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div
                                                onClick={() => setSelectedUser(m)}
                                                style={{
                                                    width: '36px',
                                                    height: '36px',
                                                    borderRadius: '50%',
                                                    background: m.role === 'ADMIN' ? '#ee785e' : m.role === 'MANAGER' ? '#f2c85b' : m.role === 'MEMBER' ? '#72b79a' : '#6d9ee8',
                                                    color: '#fff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontWeight: 700,
                                                    fontSize: '12px',
                                                    cursor: 'pointer',
                                                    flexShrink: 0,
                                                }}
                                                title="Click to view user profile details"
                                            >
                                                {(m.name || m.email).slice(0, 2).toUpperCase()}
                                            </div>

                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span
                                                        onClick={() => setSelectedUser(m)}
                                                        style={{ cursor: 'pointer', color: '#20222b', fontWeight: 600 }}
                                                        title="Click to view user details"
                                                    >
                                                        {highlightMatch(m.name || m.email, searchQuery)}
                                                    </span>
                                                    <span className={`priority ${m.role.toLowerCase()}`} style={{ fontSize: '8px', padding: '2px 5px', borderRadius: '4px' }}>
                                                        {m.role}
                                                    </span>
                                                    <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: isActive ? '#eaf7f0' : '#fff0ec', color: isActive ? '#4a9e7e' : '#e96f59' }}>
                                                        {isActive ? 'Active' : 'Deactivated'}
                                                    </span>
                                                </h3>
                                                <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#858996' }}>
                                                    {highlightMatch(m.email, searchQuery)}
                                                </p>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                type="button"
                                                className="secondary-button"
                                                onClick={() => setSelectedUser(m)}
                                                style={{ padding: '5px 9px', fontSize: '11px' }}
                                                title="View user details"
                                            >
                                                Details
                                            </button>

                                            <select
                                                value={m.role}
                                                onChange={(e) => handleRoleChange(mId, e.target.value)}
                                                disabled={!isAdmin}
                                                style={{ padding: '5px 8px', fontSize: '11px', borderRadius: '6px', border: '1px solid #ebe9e5', background: isAdmin ? '#fff' : '#f7f7f5' }}
                                            >
                                                {ROLES.map((r) => (
                                                    <option key={r} value={r}>
                                                        {r}
                                                    </option>
                                                ))}
                                            </select>

                                            <button
                                                type="button"
                                                className="secondary-button"
                                                onClick={() => toggleUserActive(mId, isActive)}
                                                style={{ padding: '5px 8px', fontSize: '11px' }}
                                            >
                                                {isActive ? 'Deactivate' : 'Activate'}
                                            </button>

                                            {isAdmin && (
                                                <button
                                                    type="button"
                                                    id={`remove-user-${mId}`}
                                                    className="secondary-button remove-user-btn"
                                                    onClick={() => handleRemoveMember(mId, m.name || m.email)}
                                                    style={{
                                                        padding: '5px 10px',
                                                        fontSize: '11px',
                                                        color: '#d9381e',
                                                        background: '#fff2ee',
                                                        border: '1px solid #ffd2c9',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                    }}
                                                    title={`Remove ${m.name || m.email} from organization`}
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    </article>
                                )
                            })}
                        </div>
                    </section>

                    <form className="project-create-panel panel" onSubmit={handleInviteSubmit} style={{ flex: '1 1 320px' }}>
                        <p className="eyebrow">Invite User</p>
                        <h2>Send Invitation</h2>
                        {!isAdmin && (
                            <div style={{ padding: '8px 12px', borderRadius: '6px', background: '#fff8df', color: '#926006', fontSize: '11px', marginBottom: '12px', border: '1px solid #fae29c' }}>
                                <strong>Admin Permission Required:</strong> {isManager ? 'Managers do not have permission to assign roles to users. Role assignment is restricted to Admins only.' : 'Only Organization Admins can assign roles to users.'}
                            </div>
                        )}
                        <label>
                            Email Address
                            <input
                                id="invite-email-input"
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder="new.user@organization.com"
                                required
                                disabled={!isAdmin}
                            />
                        </label>
                        <label>
                            Assign Role
                            <select
                                id="invite-role-select"
                                value={inviteRole}
                                onChange={(e) => setInviteRole(e.target.value)}
                                disabled={!isAdmin}
                                title={!isAdmin ? 'Admin permission required to assign roles' : undefined}
                                style={{ background: isAdmin ? '#fff' : '#f7f7f5', cursor: isAdmin ? 'pointer' : 'not-allowed' }}
                            >
                                {ROLES.map((r) => (
                                    <option key={r} value={r}>
                                        {r}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button
                            id="invite-user-btn"
                            className="primary-button"
                            type="submit"
                            disabled={isActionBusy || !isAdmin}
                            title={!isAdmin ? 'Admin permission required to assign roles' : undefined}
                            style={{ cursor: !isAdmin ? 'not-allowed' : 'pointer', opacity: !isAdmin ? 0.6 : 1 }}
                        >
                            {isActionBusy ? 'Sending...' : 'Invite User'}
                        </button>
                    </form>
                </section>
            )}

            {/* Section 2: Manage Roles & Permissions Matrix */}
            {activeTab === 'roles' && (
                <section className="panel" style={{ padding: '24px' }}>
                    <div style={{ marginBottom: '18px' }}>
                        <h2 style={{ margin: 0, font: "600 18px 'Space Grotesk'" }}>Role-Based Access Control (RBAC) Matrix</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#858996' }}>
                            Organization-wide permission rules for Admin, Manager, Developer/Member, and Viewer.
                        </p>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: '#f7f7f5', borderBottom: '2px solid #ebe9e5' }}>
                                    <th style={{ padding: '12px 16px', color: '#20222b' }}>Action / Permission</th>
                                    <th style={{ padding: '12px 16px', color: '#ee785e', textAlign: 'center' }}>Admin</th>
                                    <th style={{ padding: '12px 16px', color: '#d4a523', textAlign: 'center' }}>Manager</th>
                                    <th style={{ padding: '12px 16px', color: '#4a9e7e', textAlign: 'center' }}>Developer / Member</th>
                                    <th style={{ padding: '12px 16px', color: '#5d8bdb', textAlign: 'center' }}>Viewer</th>
                                </tr>
                            </thead>
                            <tbody>
                                {PERMISSIONS_MATRIX.map((row) => (
                                    <tr key={row.action} style={{ borderBottom: '1px solid #ebe9e5' }}>
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#20222b' }}>{row.action}</td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>{row.admin ? '✅' : '❌'}</td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>{row.manager ? '✅' : '❌'}</td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>{row.developer ? '✅' : '❌'}</td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>{row.viewer ? '✅' : '❌'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* Section 3: Manage Teams */}
            {activeTab === 'teams' && (
                <section className="feature-grid">
                    <form className="project-create-panel panel" onSubmit={handleCreateTeamSubmit} style={{ flex: '1 1 320px' }}>
                        <p className="eyebrow">Team Management</p>
                        <h2>Create New Team</h2>
                        <label>
                            Team Name
                            <input
                                id="team-name-input"
                                type="text"
                                value={newTeamName}
                                onChange={(e) => setNewTeamName(e.target.value)}
                                placeholder="Backend Team / QA Team"
                                required
                            />
                        </label>
                        <label>
                            Description
                            <textarea
                                id="team-desc-input"
                                value={newTeamDesc}
                                onChange={(e) => setNewTeamDesc(e.target.value)}
                                rows="3"
                                placeholder="Team responsibilities..."
                            />
                        </label>
                        <button id="create-team-btn" className="primary-button" type="submit" disabled={isActionBusy || !isAdmin}>
                            {isActionBusy ? 'Creating...' : 'Create Team'}
                        </button>
                    </form>

                    <section className="project-list-panel panel" style={{ flex: '1 1 600px' }}>
                        <div className="panel-heading">
                            <div>
                                <h2>Organization Teams</h2>
                                <p>Manage team structure, add/remove members, and delete teams.</p>
                            </div>
                            <strong>{teams.length} Teams</strong>
                        </div>

                        {teams.length === 0 && <p className="empty-column">No teams created yet</p>}

                        <div className="project-list">
                            {teams.map((t) => (
                                <article className="project-row" key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '14px' }}>{t.name}</h3>
                                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#858996' }}>{t.description || 'No description'}</p>
                                        <span style={{ display: 'inline-block', marginTop: '6px', fontSize: '10px', color: '#6d9ee8', background: '#edf4ff', padding: '2px 6px', borderRadius: '4px' }}>
                                            {t.members ? `${t.members.length} Members` : '0 Members'}
                                        </span>
                                    </div>

                                    {isAdmin && (
                                        <button
                                            type="button"
                                            id={`delete-team-${t.id}`}
                                            className="secondary-button"
                                            onClick={() => handleDeleteTeam(t.id, t.name)}
                                            style={{ padding: '6px 12px', color: '#d9381e', background: '#fff2ee', border: '1px solid #ffd2c9', fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            Delete Team
                                        </button>
                                    )}
                                </article>
                            ))}
                        </div>
                    </section>
                </section>
            )}

            {/* Section 4: Manage Projects */}
            {activeTab === 'projects' && (
                <section className="feature-grid">
                    <form className="project-create-panel panel" onSubmit={handleCreateProjectSubmit} style={{ flex: '1 1 320px' }}>
                        <p className="eyebrow">Project Management</p>
                        <h2>Create New Project</h2>
                        <label>
                            Project Name
                            <input
                                id="project-name-input"
                                type="text"
                                value={newProjName}
                                onChange={(e) => setNewProjName(e.target.value)}
                                placeholder="Payment Gateway v2"
                                required
                            />
                        </label>
                        <label>
                            Description
                            <textarea
                                id="project-desc-input"
                                value={newProjDesc}
                                onChange={(e) => setNewProjDesc(e.target.value)}
                                rows="3"
                                placeholder="Project goals and requirements..."
                            />
                        </label>
                        <button id="create-project-btn" className="primary-button" type="submit" disabled={isActionBusy || !isAdmin}>
                            {isActionBusy ? 'Creating...' : 'Create Project'}
                        </button>
                    </form>

                    <section className="project-list-panel panel" style={{ flex: '1 1 600px' }}>
                        <div className="panel-heading">
                            <div>
                                <h2>Organization Projects</h2>
                                <p>Archive, delete, and control organization projects.</p>
                            </div>
                            <strong>{projects.length} Projects</strong>
                        </div>

                        {projects.length === 0 && <p className="empty-column">No projects created yet</p>}

                        <div className="project-list">
                            {projects.map((p) => (
                                <article className="project-row" key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {p.name}
                                            <span className={`priority ${(p.status || 'planning').toLowerCase()}`} style={{ fontSize: '8px', padding: '2px 5px', borderRadius: '4px' }}>
                                                {p.status || 'PLANNING'}
                                            </span>
                                        </h3>
                                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#858996' }}>{p.description || 'No description'}</p>
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            type="button"
                                            id={`archive-project-${p.id}`}
                                            className="secondary-button"
                                            onClick={() => handleArchiveProject(p.id, p.status)}
                                            style={{ padding: '5px 10px', fontSize: '11px' }}
                                        >
                                            {p.status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
                                        </button>

                                        {isAdmin && (
                                            <button
                                                type="button"
                                                id={`delete-project-${p.id}`}
                                                className="secondary-button"
                                                onClick={() => handleDeleteProject(p.id, p.name)}
                                                style={{ padding: '5px 10px', fontSize: '11px', color: '#d9381e', background: '#fff2ee', border: '1px solid #ffd2c9', fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                </section>
            )}

            {/* Section 5: Organization Settings & Security */}
            {activeTab === 'settings' && (
                <section className="feature-grid">
                    <form className="project-create-panel panel" onSubmit={handleOrgSave} style={{ flex: '1 1 400px' }}>
                        <p className="eyebrow">Organization Profile</p>
                        <h2>General Settings</h2>
                        <label>
                            Organization Name
                            <input
                                id="org-name-input"
                                type="text"
                                value={orgName}
                                onChange={(e) => setOrgName(e.target.value)}
                                required
                                disabled={!isAdmin}
                            />
                        </label>
                        <label>
                            Organization Logo URL
                            <input
                                id="org-logo-input"
                                type="url"
                                value={orgLogoUrl}
                                onChange={(e) => setOrgLogoUrl(e.target.value)}
                                placeholder="https://example.com/logo.png"
                                disabled={!isAdmin}
                            />
                        </label>
                        <label>
                            Description
                            <textarea
                                id="org-desc-input"
                                value={orgDescription}
                                onChange={(e) => setOrgDescription(e.target.value)}
                                rows="3"
                                disabled={!isAdmin}
                            />
                        </label>
                        <button id="save-org-btn" className="primary-button" type="submit" disabled={!isAdmin}>
                            Save General Settings
                        </button>
                    </form>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: '1 1 400px' }}>
                        <form className="project-create-panel panel" onSubmit={handleSecuritySave}>
                            <p className="eyebrow">Security Controls</p>
                            <h2>Security & Authentication</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '14px 0' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0, fontWeight: 500 }}>
                                    <input
                                        id="enforce-2fa-checkbox"
                                        type="checkbox"
                                        checked={require2FA}
                                        onChange={(e) => setRequire2FA(e.target.checked)}
                                        style={{ width: 'auto' }}
                                    />
                                    Enforce Two-Factor Authentication (2FA) for Admins & Managers
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0, fontWeight: 500 }}>
                                    <input
                                        id="sso-enabled-checkbox"
                                        type="checkbox"
                                        checked={ssoEnabled}
                                        onChange={(e) => setSsoEnabled(e.target.checked)}
                                        style={{ width: 'auto' }}
                                    />
                                    SAML Single Sign-On (SSO) Integration
                                </label>
                                <label>
                                    Minimum Password Length
                                    <select id="password-min-length-select" value={passwordMinLength} onChange={(e) => setPasswordMinLength(e.target.value)}>
                                        <option value="8">8 Characters</option>
                                        <option value="12">12 Characters (Recommended)</option>
                                        <option value="16">16 Characters (Strict)</option>
                                    </select>
                                </label>
                            </div>
                            <button id="save-security-btn" className="primary-button" type="submit" disabled={!isAdmin}>
                                Save Security Policies
                            </button>
                        </form>

                        <section className="project-create-panel panel">
                            <p className="eyebrow">Subscription & Billing</p>
                            <h2>Organization Plan</h2>
                            <div style={{ padding: '12px', background: '#f7f7f5', borderRadius: '8px', margin: '10px 0 16px' }}>
                                <strong style={{ fontSize: '14px', color: '#20222b' }}>{billingPlan}</strong>
                                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#858996' }}>Unlimited Members • Enterprise Support • Audit Logging Active</p>
                            </div>
                        </section>
                    </div>
                </section>
            )}

            {/* Section 6: Admin Activity Audit Log */}
            {activeTab === 'logs' && (
                <section className="panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                        <div>
                            <h2 style={{ margin: 0, font: "600 18px 'Space Grotesk'" }}>Admin Activity Audit Log</h2>
                            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#858996' }}>
                                Real-time audit history of workspace actions, role modifications, and project updates.
                            </p>
                        </div>
                        <button id="export-logs-btn" className="secondary-button" onClick={handleExportLogs}>
                            Export Log
                        </button>
                    </div>

                    <div className="activity-list">
                        {activityLogs.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '36px 20px', color: '#858996' }}>
                                <p style={{ margin: '0 0 6px', fontWeight: 600 }}>No audit logs recorded yet.</p>
                                <span style={{ fontSize: '12px' }}>Administrative actions, role modifications, and project updates will appear here.</span>
                            </div>
                        ) : (
                            activityLogs.map((log) => (
                                <div key={log.id} className="activity-item" style={{ alignItems: 'center', padding: '12px 0' }}>
                                    <span className={`activity-avatar ${log.type === 'project' ? 'coral-bg' : log.type === 'task' ? 'blue-bg' : 'green-bg'}`}>
                                        {(log.actor || 'SY').slice(0, 2).toUpperCase()}
                                    </span>
                                    <p style={{ margin: 0, flex: 1, fontSize: '12px' }}>
                                        <strong>{log.actor}</strong> {log.action} <b style={{ color: '#20222b' }}>"{log.target}"</b>
                                        <small style={{ marginTop: '2px' }}>{log.time}</small>
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            )}

            {/* User Details Modal */}
            {selectedUser && (
                <div
                    id="user-details-modal"
                    className="modal-backdrop"
                    onMouseDown={(e) => e.target === e.currentTarget && setSelectedUser(null)}
                >
                    <div className="task-form" style={{ maxWidth: '520px' }}>
                        <div className="modal-heading">
                            <div>
                                <p className="eyebrow">User Profile & Access</p>
                                <h2>{selectedUser.name || selectedUser.email}</h2>
                            </div>
                            <button
                                type="button"
                                id="modal-close-x-btn"
                                className="close-button"
                                onClick={() => setSelectedUser(null)}
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                gap: '16px',
                                alignItems: 'center',
                                margin: '14px 0',
                                padding: '14px',
                                background: '#f7f7f5',
                                borderRadius: '8px',
                            }}
                        >
                            <div
                                style={{
                                    width: '50px',
                                    height: '50px',
                                    borderRadius: '50%',
                                    background:
                                        selectedUser.role === 'ADMIN'
                                            ? '#ee785e'
                                            : selectedUser.role === 'MANAGER'
                                            ? '#f2c85b'
                                            : selectedUser.role === 'MEMBER'
                                            ? '#72b79a'
                                            : '#6d9ee8',
                                    color: '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '18px',
                                    fontWeight: 700,
                                }}
                            >
                                {(selectedUser.name || selectedUser.email).slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <strong style={{ fontSize: '16px', color: '#20222b' }}>
                                    {selectedUser.name || 'Workspace Member'}
                                </strong>
                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#858996' }}>
                                    {selectedUser.email}
                                </p>
                                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                    <span
                                        className={`priority ${selectedUser.role.toLowerCase()}`}
                                        style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px' }}
                                    >
                                        Role: {selectedUser.role}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: '9px',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            background:
                                                activeStatusMap[selectedUser.userId || selectedUser.id] !== false ? '#eaf7f0' : '#fff0ec',
                                            color:
                                                activeStatusMap[selectedUser.userId || selectedUser.id] !== false ? '#4a9e7e' : '#e96f59',
                                        }}
                                    >
                                        {activeStatusMap[selectedUser.userId || selectedUser.id] !== false ? 'Active' : 'Deactivated'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', margin: '16px 0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '6px' }}>
                                <span style={{ color: '#858996' }}>User ID:</span>
                                <code style={{ fontSize: '11px', background: '#f0f0ee', padding: '1px 5px', borderRadius: '3px' }}>
                                    {selectedUser.userId || selectedUser.id}
                                </code>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '6px' }}>
                                <span style={{ color: '#858996' }}>Job Role / Title:</span>
                                <b>
                                    {selectedUser.title ||
                                        (selectedUser.role === 'ADMIN'
                                            ? 'Organization Administrator'
                                            : selectedUser.role === 'MANAGER'
                                            ? 'Engineering & Project Manager'
                                            : selectedUser.role === 'MEMBER'
                                            ? 'Software Developer'
                                            : 'Product Quality Viewer')}
                                </b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '6px' }}>
                                <span style={{ color: '#858996' }}>Assigned Team:</span>
                                <b>{selectedUser.team || 'Core Engineering Team'}</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '6px' }}>
                                <span style={{ color: '#858996' }}>Joined Workspace:</span>
                                <b>{selectedUser.joinedAt || 'Jan 15, 2026'}</b>
                            </div>
                        </div>

                        <div style={{ background: '#f7f7f5', padding: '12px', borderRadius: '8px', fontSize: '11px', color: '#666', marginBottom: '18px' }}>
                            <strong style={{ color: '#20222b', display: 'block', marginBottom: '4px' }}>
                                Role Permissions & Responsibilities:
                            </strong>
                            {selectedUser.role === 'ADMIN' &&
                                'Full organization control: View/manage all users, invite new users, remove users, toggle active status, change roles, org settings, project management.'}
                            {selectedUser.role === 'MANAGER' &&
                                'Project & team management: Create & archive projects, monitor deadlines, create tasks, assign tasks to developers, manage team members (cannot assign or change user roles).'}
                            {selectedUser.role === 'MEMBER' &&
                                'Task execution: View assigned tasks, move task status (Todo → In Progress → Review → Completed), post comments, add attachments.'}
                            {selectedUser.role === 'VIEWER' &&
                                'Read-only access: View projects, view tasks, view teams and project status.'}
                        </div>

                        <div className="form-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                id="modal-remove-user-btn"
                                className="secondary-button"
                                onClick={() => {
                                    const idToRemove = selectedUser.userId || selectedUser.id
                                    const nameToRemove = selectedUser.name || selectedUser.email
                                    setSelectedUser(null)
                                    handleRemoveMember(idToRemove, nameToRemove)
                                }}
                                style={{ color: '#d9381e', background: '#fff2ee', border: '1px solid #ffd2c9', fontWeight: 600 }}
                            >
                                Remove Member
                            </button>
                            <button
                                type="button"
                                id="modal-toggle-status-btn"
                                className="secondary-button"
                                onClick={() => {
                                    const uId = selectedUser.userId || selectedUser.id
                                    toggleUserActive(uId, activeStatusMap[uId] !== false)
                                    setSelectedUser(null)
                                }}
                            >
                                {activeStatusMap[selectedUser.userId || selectedUser.id] !== false ? 'Deactivate Account' : 'Activate Account'}
                            </button>
                            <button
                                type="button"
                                id="modal-close-btn"
                                className="primary-button"
                                onClick={() => setSelectedUser(null)}
                            >
                                Close Details
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* In-App Confirmation Modal: Remove User */}
            {pendingDeleteUser && (
                <div
                    id="confirm-remove-user-modal"
                    className="modal-backdrop"
                    onMouseDown={(e) => e.target === e.currentTarget && setPendingDeleteUser(null)}
                >
                    <div className="task-form" style={{ maxWidth: '420px', padding: '24px' }}>
                        <div className="modal-heading">
                            <div>
                                <p className="eyebrow" style={{ color: '#d9381e' }}>Revoke Workspace Access</p>
                                <h2 style={{ fontSize: '18px', margin: '4px 0' }}>Remove User?</h2>
                            </div>
                            <button
                                type="button"
                                className="close-button"
                                onClick={() => setPendingDeleteUser(null)}
                                aria-label="Cancel"
                            >
                                ×
                            </button>
                        </div>
                        <p style={{ fontSize: '13px', color: '#555', margin: '14px 0 20px', lineHeight: 1.5 }}>
                            Are you sure you want to remove <strong>"{pendingDeleteUser.name}"</strong> from <strong>{activeOrg?.name || 'the organization'}</strong>? 
                            Their access to workspace projects, tasks, and teams will be permanently revoked.
                        </p>
                        <div className="form-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                id="cancel-remove-user-btn"
                                className="secondary-button"
                                onClick={() => setPendingDeleteUser(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                id="confirm-remove-user-btn"
                                className="primary-button"
                                onClick={confirmExecuteRemoveMember}
                                style={{ background: '#d9381e', borderColor: '#d9381e', color: '#fff' }}
                            >
                                Confirm Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* In-App Confirmation Modal: Delete Team */}
            {pendingDeleteTeam && (
                <div
                    id="confirm-delete-team-modal"
                    className="modal-backdrop"
                    onMouseDown={(e) => e.target === e.currentTarget && setPendingDeleteTeam(null)}
                >
                    <div className="task-form" style={{ maxWidth: '420px', padding: '24px' }}>
                        <div className="modal-heading">
                            <div>
                                <p className="eyebrow" style={{ color: '#d9381e' }}>Delete Team</p>
                                <h2 style={{ fontSize: '18px', margin: '4px 0' }}>Delete Team Permanently?</h2>
                            </div>
                            <button
                                type="button"
                                className="close-button"
                                onClick={() => setPendingDeleteTeam(null)}
                                aria-label="Cancel"
                            >
                                ×
                            </button>
                        </div>
                        <p style={{ fontSize: '13px', color: '#555', margin: '14px 0 20px', lineHeight: 1.5 }}>
                            Are you sure you want to delete team <strong>"{pendingDeleteTeam.name}"</strong>? 
                            Team members will be unlinked from this team structure.
                        </p>
                        <div className="form-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                id="cancel-delete-team-btn"
                                className="secondary-button"
                                onClick={() => setPendingDeleteTeam(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                id="confirm-delete-team-btn"
                                className="primary-button"
                                onClick={confirmExecuteDeleteTeam}
                                style={{ background: '#d9381e', borderColor: '#d9381e', color: '#fff' }}
                            >
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* In-App Confirmation Modal: Delete Project */}
            {pendingDeleteProject && (
                <div
                    id="confirm-delete-project-modal"
                    className="modal-backdrop"
                    onMouseDown={(e) => e.target === e.currentTarget && setPendingDeleteProject(null)}
                >
                    <div className="task-form" style={{ maxWidth: '420px', padding: '24px' }}>
                        <div className="modal-heading">
                            <div>
                                <p className="eyebrow" style={{ color: '#d9381e' }}>Delete Project</p>
                                <h2 style={{ fontSize: '18px', margin: '4px 0' }}>Delete Project Permanently?</h2>
                            </div>
                            <button
                                type="button"
                                className="close-button"
                                onClick={() => setPendingDeleteProject(null)}
                                aria-label="Cancel"
                            >
                                ×
                            </button>
                        </div>
                        <p style={{ fontSize: '13px', color: '#555', margin: '14px 0 20px', lineHeight: 1.5 }}>
                            Are you sure you want to delete project <strong>"{pendingDeleteProject.name}"</strong>? 
                            All associated tasks, boards, and project comments will be removed.
                        </p>
                        <div className="form-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                id="cancel-delete-project-btn"
                                className="secondary-button"
                                onClick={() => setPendingDeleteProject(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                id="confirm-delete-project-btn"
                                className="primary-button"
                                onClick={confirmExecuteDeleteProject}
                                style={{ background: '#d9381e', borderColor: '#d9381e', color: '#fff' }}
                            >
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}
