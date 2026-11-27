import { useCallback, useEffect, useState } from 'react'
import {
    getOrganizations,
    getOrganizationMembers,
    updateOrganizationMemberRole,
    removeOrganizationMember,
    inviteOrganizationMember,
    updateOrganization,
    createOrganizationUser,
    getOrganizationAuditLogs,
} from '../services/organizationService.js'
import { getProjects, createProject, updateProject, addProjectMember } from '../services/projectService.js'
import { getTeams, createTeam, updateTeam, addTeamMember, removeTeamMember } from '../services/teamService.js'
import { getOverview } from '../services/analyticsService.js'
import { authenticatedRequest } from '../services/authService.js'
import { getUserInitials } from '../constants/avatarOptions.js'
import '../App.css'

const ROLES = ['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PERMISSIONS_MATRIX = [
    { action: 'Manage organization members', admin: true, manager: false, developer: false, viewer: false },
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
    const [members, setMembers] = useState([])
    const [projects, setProjects] = useState([])
    const [teams, setTeams] = useState([])
    const [overview, setOverview] = useState(null)
    const [activeTab, setActiveTab] = useState('users')
    
    // User search, filters & sort
    const [searchQuery, setSearchQuery] = useState('')
    const [roleFilter, setRoleFilter] = useState('ALL')
    const [userSort, setUserSort] = useState('NAME')
    const [selectedUser, setSelectedUser] = useState(null)

    // Create User directly form
    const [createUserName, setCreateUserName] = useState('')
    const [createUserEmail, setCreateUserEmail] = useState('')
    const [createUserPassword, setCreateUserPassword] = useState('')
    const [createUserRole, setCreateUserRole] = useState('MEMBER')
    const [createUserStatus, setCreateUserStatus] = useState('ACTIVE')

    // Org Settings form
    const [orgName, setOrgName] = useState('')
    const [orgDescription, setOrgDescription] = useState('')

    // Audit Logs state
    const [auditLogs, setAuditLogs] = useState([])
    const [auditTotal, setAuditTotal] = useState(0)
    const [auditOffset, setAuditOffset] = useState(0)
    const [auditSearch, setAuditSearch] = useState('')
    const [auditAction, setAuditAction] = useState('')
    const [auditLoading, setAuditLoading] = useState(false)

    // Team & Project editing state
    const [editingTeam, setEditingTeam] = useState(null)
    const [teamMemberToAdd, setTeamMemberToAdd] = useState('')
    const [editingProject, setEditingProject] = useState(null)
    const [projectManagerToAdd, setProjectManagerToAdd] = useState('')

    // In-app modal confirmation states
    const [pendingDeleteUser, setPendingDeleteUser] = useState(null)
    const [pendingDeleteTeam, setPendingDeleteTeam] = useState(null)
    const [pendingDeleteProject, setPendingDeleteProject] = useState(null)

    // Forms
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState('MEMBER')

    // New Team / New Project forms
    const [newTeamName, setNewTeamName] = useState('')
    const [newTeamDesc, setNewTeamDesc] = useState('')
    const [newProjName, setNewProjName] = useState('')
    const [newProjDesc, setNewProjDesc] = useState('')

    const [isLoading, setIsLoading] = useState(true)
    const [isActionBusy, setIsActionBusy] = useState(false)
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')

    useEffect(() => {
        getOrganizations()
            .then((orgs) => {
                const list = Array.isArray(orgs) ? orgs : []
                setOrganizations(list)
                if (list.length > 0) {
                    setOrganizationId(list[0].id)
                } else {
                    setIsLoading(false)
                }
            })
            .catch((err) => {
                setError(err.message)
                setIsLoading(false)
            })
    }, [])

    const loadAuditLogs = useCallback(async (orgId, nextOffset = 0) => {
        if (!orgId) return
        setAuditLoading(true)
        try {
            const res = await getOrganizationAuditLogs(orgId, {
                search: auditSearch.trim(),
                action: auditAction,
                limit: 20,
                offset: nextOffset,
            })
            setAuditLogs(res?.logs || [])
            setAuditTotal(Number(res?.total || 0))
            setAuditOffset(nextOffset)
        } catch (err) {
            setError(err.message)
        } finally {
            setAuditLoading(false)
        }
    }, [auditAction, auditSearch])

    useEffect(() => {
        if (!organizationId) return
        const selectedOrg = organizations.find((o) => o.id === organizationId)
        Promise.all([
            getOrganizationMembers(organizationId),
            getProjects(organizationId),
            getTeams(organizationId),
            getOverview(organizationId).catch(() => null),
        ])
            .then(([loadedMembers, loadedProjects, loadedTeams, loadedOverview]) => {
                const mList = Array.isArray(loadedMembers) ? [...loadedMembers] : []
                const pList = Array.isArray(loadedProjects) ? [...loadedProjects] : []
                const tList = Array.isArray(loadedTeams) ? [...loadedTeams] : []
                setOrgName(selectedOrg?.name || '')
                setOrgDescription(selectedOrg?.description || '')
                setMembers(mList)
                setProjects(pList)
                setTeams(tList)
                setOverview(loadedOverview)
            })
            .catch((err) => setError(err.message))
            .finally(() => setIsLoading(false))
    }, [organizationId, organizations])

    const activeOrg = organizations.find((organization) => organization.id === organizationId) || null
    const userRole = (activeOrg?.role || 'MEMBER').toUpperCase()
    const isAdmin = userRole === 'ADMIN'
    const isManager = userRole === 'MANAGER'

    // Member Management Actions
    async function handleRoleChange(targetUserId, newRole) {
        if (!isAdmin) {
            setError('Admin permission required: Only organization administrators can assign or change roles.')
            return
        }
        const target = members.find((m) => (m.userId || m.id) === targetUserId)
        if (target && target.role !== newRole && (newRole === 'ADMIN' || target.role === 'ADMIN')) {
            if (!window.confirm(`Are you sure you want to change ${target.name || target.email}'s role from ${target.role} to ${newRole}?`)) {
                return
            }
        }
        setError('')
        setSuccessMessage('')
        if (!uuidPattern.test(organizationId) || !uuidPattern.test(targetUserId)) {
            setError('A saved organization member is required to change a role.')
            return
        }
        try {
            await updateOrganizationMemberRole(organizationId, targetUserId, newRole)
            setMembers((current) =>
                current.map((m) => ((m.userId || m.id) === targetUserId ? { ...m, role: newRole } : m))
            )
            if (selectedUser && ((selectedUser.userId || selectedUser.id) === targetUserId)) {
                setSelectedUser((prev) => (prev ? { ...prev, role: newRole } : null))
            }
            setSuccessMessage(`Updated role of user to ${newRole}.`)
        } catch (err) {
            setError(err.message)
        }
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

        if (!uuidPattern.test(organizationId) || !uuidPattern.test(targetUserId)) {
            setError('A saved organization member is required for removal.')
            return
        }
        try {
            await removeOrganizationMember(organizationId, targetUserId)
            setMembers((current) => current.filter((m) => (m.userId || m.id) !== targetUserId))
            if (selectedUser && ((selectedUser.userId || selectedUser.id) === targetUserId)) {
                setSelectedUser(null)
            }
            setSuccessMessage(`User "${memberName}" was successfully removed from the organization.`)
        } catch (err) {
            setError(err.message)
        }
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

        if (!uuidPattern.test(organizationId)) {
            setError('Select a saved organization before inviting a user.')
            setIsActionBusy(false)
            return
        }
        try {
            await inviteOrganizationMember(organizationId, { email: inviteEmail, role: inviteRole })
            const refreshedMembers = await getOrganizationMembers(organizationId)
            setMembers(Array.isArray(refreshedMembers) ? refreshedMembers : [])
            setSuccessMessage(`Invitation created for ${inviteEmail} as ${inviteRole}.`)
            setInviteEmail('')
        } catch (err) {
            setError(err.message)
        } finally {
            setIsActionBusy(false)
        }
    }

    async function handleCreateUserSubmit(event) {
        event.preventDefault()
        if (!isAdmin) {
            setError('Admin permission required: Only organization administrators can create user accounts.')
            return
        }
        setIsActionBusy(true)
        setError('')
        setSuccessMessage('')
        try {
            await createOrganizationUser(organizationId, {
                name: createUserName,
                email: createUserEmail,
                password: createUserPassword,
                role: createUserRole,
                accountStatus: createUserStatus,
            })
            const refreshedMembers = await getOrganizationMembers(organizationId)
            setMembers(Array.isArray(refreshedMembers) ? refreshedMembers : [])
            setSuccessMessage(`User account created for ${createUserEmail} (${createUserRole}).`)
            setCreateUserName('')
            setCreateUserEmail('')
            setCreateUserPassword('')
            setCreateUserRole('MEMBER')
            setCreateUserStatus('ACTIVE')
        } catch (err) {
            setError(err.message)
        } finally {
            setIsActionBusy(false)
        }
    }

    async function handleSaveOrgSettings(event) {
        event.preventDefault()
        if (!isAdmin) {
            setError('Admin permission required to update workspace settings.')
            return
        }
        if (!window.confirm('Save changes to workspace organization settings?')) return
        setIsActionBusy(true)
        setError('')
        setSuccessMessage('')
        try {
            const updated = await updateOrganization(organizationId, {
                name: orgName,
                description: orgDescription,
            })
            setOrganizations((prev) => prev.map((o) => (o.id === organizationId ? { ...o, ...updated } : o)))
            setSuccessMessage('Workspace settings saved and persisted.')
        } catch (err) {
            setError(err.message)
        } finally {
            setIsActionBusy(false)
        }
    }

    async function handleSaveEditTeam(event) {
        event.preventDefault()
        if (!editingTeam) return
        setIsActionBusy(true)
        setError('')
        setSuccessMessage('')
        try {
            const updated = await updateTeam(editingTeam.id, {
                name: editingTeam.name,
                description: editingTeam.description,
            })
            setTeams((prev) => prev.map((t) => (t.id === editingTeam.id ? { ...t, ...updated } : t)))
            setSuccessMessage(`Team "${updated.name}" updated.`)
            setEditingTeam(null)
        } catch (err) {
            setError(err.message)
        } finally {
            setIsActionBusy(false)
        }
    }

    async function handleAddMemberToTeam(teamId) {
        if (!teamMemberToAdd) return
        setError('')
        setSuccessMessage('')
        try {
            await addTeamMember(teamId, teamMemberToAdd)
            const refreshedTeams = await getTeams(organizationId)
            setTeams(Array.isArray(refreshedTeams) ? refreshedTeams : [])
            const updatedTeam = refreshedTeams.find((t) => t.id === teamId)
            if (updatedTeam) setEditingTeam(updatedTeam)
            setTeamMemberToAdd('')
            setSuccessMessage('Member added to team.')
        } catch (err) {
            setError(err.message)
        }
    }

    async function handleRemoveMemberFromTeam(teamId, memberUserId) {
        setError('')
        setSuccessMessage('')
        try {
            await removeTeamMember(teamId, memberUserId)
            const refreshedTeams = await getTeams(organizationId)
            setTeams(Array.isArray(refreshedTeams) ? refreshedTeams : [])
            const updatedTeam = refreshedTeams.find((t) => t.id === teamId)
            if (updatedTeam) setEditingTeam(updatedTeam)
            setSuccessMessage('Member removed from team.')
        } catch (err) {
            setError(err.message)
        }
    }

    async function handleSaveEditProject(event) {
        event.preventDefault()
        if (!editingProject) return
        setIsActionBusy(true)
        setError('')
        setSuccessMessage('')
        try {
            const updated = await updateProject(editingProject.id, {
                name: editingProject.name,
                description: editingProject.description,
                status: editingProject.status,
                priority: editingProject.priority,
                teamId: editingProject.teamId || null,
                startDate: editingProject.startDate || null,
                dueDate: editingProject.dueDate || null,
            })
            if (projectManagerToAdd) {
                await addProjectMember(editingProject.id, projectManagerToAdd)
            }
            const refreshedProjects = await getProjects(organizationId)
            setProjects(Array.isArray(refreshedProjects) ? refreshedProjects : [])
            setSuccessMessage(`Project "${updated.name}" updated.`)
            setEditingProject(null)
            setProjectManagerToAdd('')
        } catch (err) {
            setError(err.message)
        } finally {
            setIsActionBusy(false)
        }
    }

    // Team Management Actions
    async function handleCreateTeamSubmit(event) {
        event.preventDefault()
        if (!newTeamName) return
        setIsActionBusy(true)
        setError('')
        setSuccessMessage('')

        try {
            const team = await createTeam({ name: newTeamName, description: newTeamDesc, organizationId })
            setTeams((prev) => [...prev, team])
            setSuccessMessage(`Team "${newTeamName.trim()}" created successfully.`)
            setNewTeamName('')
            setNewTeamDesc('')
        } catch (err) {
            setError(err.message)
        } finally {
            setIsActionBusy(false)
        }
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
        try {
            await authenticatedRequest(`/api/teams/${teamId}`, { method: 'DELETE' })
            setTeams((prev) => prev.filter((t) => t.id !== teamId))
            setSuccessMessage(`Team "${teamName}" deleted successfully.`)
        } catch (err) {
            setError(err.message)
        }
    }

    // Project Management Actions
    async function handleCreateProjectSubmit(event) {
        event.preventDefault()
        if (!newProjName) return
        setIsActionBusy(true)
        setError('')
        setSuccessMessage('')

        try {
            const proj = await createProject({ name: newProjName, description: newProjDesc, organizationId })
            setProjects((prev) => [...prev, proj])
            setSuccessMessage(`Project "${newProjName.trim()}" created successfully.`)
            setNewProjName('')
            setNewProjDesc('')
        } catch (err) {
            setError(err.message)
        } finally {
            setIsActionBusy(false)
        }
    }

    async function handleArchiveProject(projectId, currentStatus) {
        setError('')
        setSuccessMessage('')
        const nextStatus = currentStatus === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED'
        try {
            await authenticatedRequest(`/api/projects/${projectId}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: nextStatus }),
            })
            setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status: nextStatus } : p)))
            setSuccessMessage(`Project status updated to ${nextStatus}.`)
        } catch (err) {
            setError(err.message)
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
        try {
            await authenticatedRequest(`/api/projects/${projectId}`, { method: 'DELETE' })
            setProjects((prev) => prev.filter((p) => p.id !== projectId))
            setSuccessMessage(`Project "${projectName}" deleted successfully.`)
        } catch (err) {
            setError(err.message)
        }
    }

    const filteredMembers = (members || []).filter((m) => {
        const query = searchQuery.trim().toLowerCase()
        const name = (m.name || m.user?.name || '').toLowerCase()
        const email = (m.email || m.user?.email || '').toLowerCase()
        const role = (m.role || '').toLowerCase()

        const matchesQuery = !query || name.includes(query) || email.includes(query) || role.includes(query)
        const matchesRole = roleFilter === 'ALL' || m.role === roleFilter
        return matchesQuery && matchesRole
    }).sort((a, b) => {
        if (userSort === 'ROLE') return String(a.role || '').localeCompare(String(b.role || ''))
        if (userSort === 'JOINED') return new Date(b.joinedAt || 0) - new Date(a.joinedAt || 0)
        return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''))
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
                        <select value={organizationId} onChange={(e) => {
                            setIsLoading(true)
                            setError('')
                            setOrganizationId(e.target.value)
                        }}>
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
                        <strong style={{ fontSize: '26px', font: "700 26px 'Space Grotesk'", color: '#fff' }}>{overview?.userCounts?.total ?? members?.length ?? 0}</strong>
                        <small style={{ display: 'block', fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
                            {overview?.userCounts?.admins ?? members.filter((m) => m.role === 'ADMIN').length}A · {overview?.userCounts?.managers ?? members.filter((m) => m.role === 'MANAGER').length}M · {overview?.userCounts?.developers ?? members.filter((m) => m.role === 'MEMBER').length}D
                        </small>
                    </div>
                    <div style={{ background: '#292c38', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #6d9ee8' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#858996', textTransform: 'uppercase' }}>Projects</p>
                        <strong style={{ fontSize: '26px', font: "700 26px 'Space Grotesk'", color: '#fff' }}>{overview?.projects ?? projects?.length ?? 0}</strong>
                        <small style={{ display: 'block', fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
                            {overview?.activeProjects ?? projects.filter((p) => p.status === 'ACTIVE').length} active
                        </small>
                    </div>
                    <div style={{ background: '#292c38', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #f2c85b' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#858996', textTransform: 'uppercase' }}>Teams</p>
                        <strong style={{ fontSize: '26px', font: "700 26px 'Space Grotesk'", color: '#fff' }}>{overview?.totalTeams ?? teams?.length ?? 0}</strong>
                    </div>
                    <div style={{ background: '#292c38', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #72b79a' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#858996', textTransform: 'uppercase' }}>Pending / Active Tasks</p>
                        <strong style={{ fontSize: '26px', font: "700 26px 'Space Grotesk'", color: '#fff' }}>
                            {overview ? ((overview.pendingTasks || 0) + (overview.inProgressTasks || 0) + (overview.tasksUnderReview || 0)) : (projects?.reduce((acc, p) => acc + (p.tasksSummary?.inProgress || 0) + (p.tasksSummary?.todo || 0) + (p.tasksSummary?.review || 0), 0) || 0)}
                        </strong>
                    </div>
                    <div style={{ background: '#292c38', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #72b79a' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#858996', textTransform: 'uppercase' }}>Completed Tasks</p>
                        <strong style={{ fontSize: '26px', font: "700 26px 'Space Grotesk'", color: '#fff' }}>{overview?.completedTasks ?? (projects?.reduce((acc, p) => acc + (p.tasksSummary?.completed || 0), 0) || 0)}</strong>
                    </div>
                    <div style={{ background: '#292c38', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #ee785e' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#858996', textTransform: 'uppercase' }}>Overdue Tasks</p>
                        <strong style={{ fontSize: '26px', font: "700 26px 'Space Grotesk'", color: '#e96f59' }}>{overview?.overdueTasks ?? 0}</strong>
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
                            onClick={() => {
                                setActiveTab(tab.id)
                                if (tab.id === 'logs' && organizationId && isAdmin) {
                                    loadAuditLogs(organizationId, 0)
                                }
                            }}
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
                                <select
                                    id="sort-user-select"
                                    aria-label="Sort users"
                                    value={userSort}
                                    onChange={(e) => setUserSort(e.target.value)}
                                    style={{ padding: '9px 12px', border: '1px solid #ebe9e5', borderRadius: '7px', fontSize: '12px', background: '#fff' }}
                                >
                                    <option value="NAME">Sort: Name</option>
                                    <option value="ROLE">Sort: Role</option>
                                    <option value="JOINED">Sort: Recently Joined</option>
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
                                                {getUserInitials(m.name || m.email, 'MB')}
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

                    <form className="project-create-panel panel" onSubmit={handleCreateUserSubmit} style={{ flex: '1 1 320px' }}>
                        <p className="eyebrow">Direct Provisioning</p>
                        <h2>Create User Account</h2>
                        <label>
                            Full Name
                            <input
                                id="create-user-name-input"
                                type="text"
                                value={createUserName}
                                onChange={(e) => setCreateUserName(e.target.value)}
                                placeholder="Alex Morgan"
                                required
                                disabled={!isAdmin}
                            />
                        </label>
                        <label>
                            Email Address
                            <input
                                id="create-user-email-input"
                                type="email"
                                value={createUserEmail}
                                onChange={(e) => setCreateUserEmail(e.target.value)}
                                placeholder="alex@organization.com"
                                required
                                disabled={!isAdmin}
                            />
                        </label>
                        <label>
                            Password (min 8 characters)
                            <input
                                id="create-user-password-input"
                                type="password"
                                value={createUserPassword}
                                onChange={(e) => setCreateUserPassword(e.target.value)}
                                placeholder="••••••••"
                                minLength={8}
                                required
                                disabled={!isAdmin}
                            />
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <label>
                                Role
                                <select value={createUserRole} onChange={(e) => setCreateUserRole(e.target.value)} disabled={!isAdmin}>
                                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </label>
                            <label>
                                Status
                                <select value={createUserStatus} onChange={(e) => setCreateUserStatus(e.target.value)} disabled={!isAdmin}>
                                    <option value="ACTIVE">ACTIVE</option>
                                    <option value="INACTIVE">INACTIVE</option>
                                    <option value="SUSPENDED">SUSPENDED</option>
                                </select>
                            </label>
                        </div>
                        <button
                            id="create-user-btn"
                            className="primary-button"
                            type="submit"
                            disabled={isActionBusy || !isAdmin}
                            style={{ cursor: !isAdmin ? 'not-allowed' : 'pointer', opacity: !isAdmin ? 0.6 : 1 }}
                        >
                            {isActionBusy ? 'Creating...' : 'Create User'}
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
                            Workspace roles are scoped to this organization. System Admin privileges are managed separately.
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
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                type="button"
                                                className="secondary-button"
                                                onClick={() => {
                                                    setTeamMemberToAdd('')
                                                    setEditingTeam({ ...t })
                                                }}
                                                style={{ padding: '6px 12px', fontSize: '11px' }}
                                            >
                                                Edit &amp; Members
                                            </button>
                                            <button
                                                type="button"
                                                id={`delete-team-${t.id}`}
                                                className="secondary-button"
                                                onClick={() => handleDeleteTeam(t.id, t.name)}
                                                style={{ padding: '6px 12px', color: '#d9381e', background: '#fff2ee', border: '1px solid #ffd2c9', fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                Delete Team
                                            </button>
                                        </div>
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
                                        {isAdmin && (
                                            <button
                                                type="button"
                                                className="secondary-button"
                                                onClick={() => {
                                                    setProjectManagerToAdd('')
                                                    setEditingProject({
                                                        ...p,
                                                        startDate: p.startDate ? new Date(p.startDate).toISOString().slice(0, 10) : '',
                                                        dueDate: p.dueDate ? new Date(p.dueDate).toISOString().slice(0, 10) : '',
                                                        teamId: p.teamId || '',
                                                    })
                                                }}
                                                style={{ padding: '5px 10px', fontSize: '11px' }}
                                            >
                                                Edit
                                            </button>
                                        )}
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
                <section className="panel" style={{ padding: '24px', maxWidth: '700px' }}>
                    <p className="eyebrow">Workspace Settings</p>
                    <h2>Organization Profile &amp; Configuration</h2>
                    <p style={{ color: '#64748b', fontSize: '13px', lineHeight: 1.6, marginBottom: '20px' }}>
                        Update your organization&apos;s workspace name and description. Changes are persisted in the database and recorded in audit logs.
                    </p>
                    <form onSubmit={handleSaveOrgSettings} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <label>
                            Workspace Name
                            <input
                                id="org-settings-name-input"
                                type="text"
                                value={orgName}
                                onChange={(e) => setOrgName(e.target.value)}
                                minLength={2}
                                required
                                disabled={!isAdmin}
                            />
                        </label>
                        <label>
                            Workspace Description
                            <textarea
                                id="org-settings-desc-input"
                                rows="3"
                                value={orgDescription}
                                onChange={(e) => setOrgDescription(e.target.value)}
                                placeholder="Describe your organization workspace..."
                                disabled={!isAdmin}
                            />
                        </label>
                        <div>
                            <button
                                id="save-org-settings-btn"
                                type="submit"
                                className="primary-button"
                                disabled={isActionBusy || !isAdmin}
                            >
                                {isActionBusy ? 'Saving...' : 'Save Workspace Settings'}
                            </button>
                        </div>
                    </form>
                </section>
            )}

            {/* Section 6: Admin Activity Audit Log */}
            {activeTab === 'logs' && (
                <section className="panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                        <div>
                            <p className="eyebrow">Security &amp; Compliance</p>
                            <h2 style={{ margin: 0 }}>Organization Activity Audit Logs</h2>
                        </div>
                        <strong>{auditTotal} events</strong>
                    </div>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault()
                            loadAuditLogs(organizationId, 0)
                        }}
                        style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}
                    >
                        <input
                            type="search"
                            value={auditSearch}
                            onChange={(e) => setAuditSearch(e.target.value)}
                            placeholder="Search actor, action, resource..."
                            style={{ flex: 1, minWidth: '200px', padding: '8px 12px', border: '1px solid #ebe9e5', borderRadius: '6px' }}
                        />
                        <select
                            value={auditAction}
                            onChange={(e) => setAuditAction(e.target.value)}
                            style={{ padding: '8px 12px', border: '1px solid #ebe9e5', borderRadius: '6px', background: '#fff' }}
                        >
                            <option value="">All Actions</option>
                            <option value="USER_CREATED">User Created</option>
                            <option value="ORGANIZATION_MEMBER_ROLE_CHANGED">Role Changed</option>
                            <option value="ORGANIZATION_MEMBER_REMOVED">Member Removed</option>
                            <option value="PROJECT_CREATED">Project Created</option>
                            <option value="PROJECT_UPDATED">Project Updated</option>
                            <option value="PROJECT_ARCHIVED">Project Archived</option>
                            <option value="PROJECT_DELETED">Project Deleted</option>
                            <option value="TEAM_CREATED">Team Created</option>
                            <option value="TEAM_MEMBER_ADDED">Team Member Added</option>
                            <option value="WORKSPACE_SETTINGS_UPDATED">Workspace Settings Updated</option>
                        </select>
                        <button type="submit" className="primary-button" disabled={auditLoading}>
                            {auditLoading ? 'Loading...' : 'Filter'}
                        </button>
                    </form>
                    {auditLogs.length === 0 ? (
                        <p className="empty-column">No audit logs found for this organization.</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ background: '#f7f7f5', borderBottom: '2px solid #ebe9e5' }}>
                                        <th style={{ padding: '10px 12px' }}>Timestamp</th>
                                        <th style={{ padding: '10px 12px' }}>Actor</th>
                                        <th style={{ padding: '10px 12px' }}>Action</th>
                                        <th style={{ padding: '10px 12px' }}>Resource</th>
                                        <th style={{ padding: '10px 12px' }}>Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditLogs.map((log) => (
                                        <tr key={log.id} style={{ borderBottom: '1px solid #ebe9e5' }}>
                                            <td style={{ padding: '10px 12px', color: '#64748b' }}>{new Date(log.createdAt).toLocaleString()}</td>
                                            <td style={{ padding: '10px 12px' }}>{log.actorName || log.actorEmail || 'System'}</td>
                                            <td style={{ padding: '10px 12px', fontWeight: 600 }}>{log.action}</td>
                                            <td style={{ padding: '10px 12px', color: '#475569' }}>{log.resourceType}{log.resourceId ? ` (${String(log.resourceId).slice(0, 8)}…)` : ''}</td>
                                            <td style={{ padding: '10px 12px' }}>{log.result}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', fontSize: '12px' }}>
                        <span>Showing {auditTotal === 0 ? 0 : auditOffset + 1}–{Math.min(auditOffset + auditLogs.length, auditTotal)} of {auditTotal}</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="button" className="secondary-button" disabled={auditOffset === 0 || auditLoading} onClick={() => loadAuditLogs(organizationId, Math.max(0, auditOffset - 20))}>Previous</button>
                            <button type="button" className="secondary-button" disabled={auditOffset + 20 >= auditTotal || auditLoading} onClick={() => loadAuditLogs(organizationId, auditOffset + 20)}>Next</button>
                        </div>
                    </div>
                </section>
            )}

            {/* Edit Team & Members Modal */}
            {editingTeam && (
                <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditingTeam(null)}>
                    <form className="task-form" style={{ maxWidth: '520px' }} onSubmit={handleSaveEditTeam}>
                        <div className="modal-heading">
                            <div>
                                <p className="eyebrow">Team Management</p>
                                <h2>Edit Team &amp; Members</h2>
                            </div>
                            <button type="button" className="close-button" onClick={() => setEditingTeam(null)}>×</button>
                        </div>
                        <label>
                            Team Name
                            <input type="text" value={editingTeam.name || ''} onChange={(e) => setEditingTeam((p) => ({ ...p, name: e.target.value }))} required />
                        </label>
                        <label>
                            Description
                            <textarea rows="2" value={editingTeam.description || ''} onChange={(e) => setEditingTeam((p) => ({ ...p, description: e.target.value }))} />
                        </label>
                        <div style={{ margin: '12px 0', padding: '12px', background: '#f7f7f5', borderRadius: '8px' }}>
                            <strong style={{ fontSize: '12px', display: 'block', marginBottom: '8px' }}>Team Members ({editingTeam.members?.length || 0})</strong>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                <select value={teamMemberToAdd} onChange={(e) => setTeamMemberToAdd(e.target.value)} style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid #ddd' }}>
                                    <option value="">Select member to add...</option>
                                    {members
                                        .filter((m) => !(editingTeam.members || []).some((tm) => (tm.userId || tm.user?.id) === (m.userId || m.id)))
                                        .map((m) => (
                                            <option key={m.userId || m.id} value={m.userId || m.id}>{m.name || m.email} ({m.role})</option>
                                        ))}
                                </select>
                                <button type="button" className="secondary-button" onClick={() => handleAddMemberToTeam(editingTeam.id)} disabled={!teamMemberToAdd}>Add</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                                {(editingTeam.members || []).map((tm) => {
                                    const uid = tm.userId || tm.user?.id
                                    return (
                                        <div key={uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', background: '#fff', padding: '6px 10px', borderRadius: '6px' }}>
                                            <span>{tm.user?.name || tm.user?.email || uid} ({tm.user?.role || 'MEMBER'})</span>
                                            <button type="button" onClick={() => handleRemoveMemberFromTeam(editingTeam.id, uid)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                        <div className="form-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button type="button" className="secondary-button" onClick={() => setEditingTeam(null)}>Cancel</button>
                            <button type="submit" className="primary-button" disabled={isActionBusy}>{isActionBusy ? 'Saving...' : 'Save Team'}</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Edit Project Modal */}
            {editingProject && (
                <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditingProject(null)}>
                    <form className="task-form" style={{ maxWidth: '520px' }} onSubmit={handleSaveEditProject}>
                        <div className="modal-heading">
                            <div>
                                <p className="eyebrow">Project Management</p>
                                <h2>Edit Project</h2>
                            </div>
                            <button type="button" className="close-button" onClick={() => setEditingProject(null)}>×</button>
                        </div>
                        <label>
                            Project Name
                            <input type="text" value={editingProject.name || ''} onChange={(e) => setEditingProject((p) => ({ ...p, name: e.target.value }))} required />
                        </label>
                        <label>
                            Description
                            <textarea rows="2" value={editingProject.description || ''} onChange={(e) => setEditingProject((p) => ({ ...p, description: e.target.value }))} />
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <label>
                                Status
                                <select value={editingProject.status || 'PLANNING'} onChange={(e) => setEditingProject((p) => ({ ...p, status: e.target.value }))}>
                                    <option value="PLANNING">PLANNING</option>
                                    <option value="ACTIVE">ACTIVE</option>
                                    <option value="ON_HOLD">ON_HOLD</option>
                                    <option value="COMPLETED">COMPLETED</option>
                                    <option value="ARCHIVED">ARCHIVED</option>
                                </select>
                            </label>
                            <label>
                                Priority
                                <select value={editingProject.priority || 'MEDIUM'} onChange={(e) => setEditingProject((p) => ({ ...p, priority: e.target.value }))}>
                                    <option value="LOW">LOW</option>
                                    <option value="MEDIUM">MEDIUM</option>
                                    <option value="HIGH">HIGH</option>
                                    <option value="URGENT">URGENT</option>
                                </select>
                            </label>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <label>
                                Start Date
                                <input type="date" value={editingProject.startDate || ''} onChange={(e) => setEditingProject((p) => ({ ...p, startDate: e.target.value }))} />
                            </label>
                            <label>
                                Deadline
                                <input type="date" value={editingProject.dueDate || ''} onChange={(e) => setEditingProject((p) => ({ ...p, dueDate: e.target.value }))} />
                            </label>
                        </div>
                        <label>
                            Assigned Team
                            <select value={editingProject.teamId || ''} onChange={(e) => setEditingProject((p) => ({ ...p, teamId: e.target.value }))}>
                                <option value="">No Team Assigned</option>
                                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </label>
                        <label>
                            Assign Manager / Project Member
                            <select value={projectManagerToAdd} onChange={(e) => setProjectManagerToAdd(e.target.value)}>
                                <option value="">Keep current members</option>
                                {members.map((m) => <option key={m.userId || m.id} value={m.userId || m.id}>{m.name || m.email} ({m.role})</option>)}
                            </select>
                        </label>
                        <div className="form-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button type="button" className="secondary-button" onClick={() => setEditingProject(null)}>Cancel</button>
                            <button type="submit" className="primary-button" disabled={isActionBusy}>{isActionBusy ? 'Saving...' : 'Save Project'}</button>
                        </div>
                    </form>
                </div>
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
                                {getUserInitials(selectedUser.name || selectedUser.email, 'MB')}
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
                                <b>{selectedUser.team || 'Not assigned'}</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '6px' }}>
                                <span style={{ color: '#858996' }}>Joined Workspace:</span>
                                <b>{selectedUser.joinedAt ? new Date(selectedUser.joinedAt).toLocaleDateString() : 'Not available'}</b>
                            </div>
                        </div>

                        <div style={{ background: '#f7f7f5', padding: '12px', borderRadius: '8px', fontSize: '11px', color: '#666', marginBottom: '18px' }}>
                            <strong style={{ color: '#20222b', display: 'block', marginBottom: '4px' }}>
                                Role Permissions & Responsibilities:
                            </strong>
                            {selectedUser.role === 'ADMIN' &&
                                'Workspace administration: manage organization members, invitations, roles, teams, and projects. System-wide account controls are reserved for System Admins.'}
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
