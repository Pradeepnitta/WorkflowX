import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
    getProjects,
    createProject,
    updateProject,
    deleteProject,
    getProjectMembers,
    addProjectMember,
    removeProjectMember,
} from '../services/projectService.js'
import { getOrganizations, getOrganizationMembers } from '../services/organizationService.js'
import { getTasks } from '../services/taskService.js'
import { getSocket } from '../services/socketService.js'
import '../App.css'

const AVAILABLE_TEAMS = ['Frontend Team', 'Backend Team', 'QA Team', 'DevOps Team', 'Product & Design']

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

function getStatusBadgeStyle(status) {
    switch (status) {
        case 'ACTIVE':
            return { background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }
        case 'PLANNING':
            return { background: '#eef2ff', color: '#3730a3', border: '1px solid #c7d2fe' }
        case 'ON_HOLD':
            return { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }
        case 'COMPLETED':
            return { background: '#f0fdfa', color: '#115e59', border: '1px solid #99f6e4' }
        case 'ARCHIVED':
            return { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }
        default:
            return { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }
    }
}

function getPriorityBadgeStyle(priority) {
    switch (priority) {
        case 'URGENT':
            return { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }
        case 'HIGH':
            return { background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }
        case 'MEDIUM':
            return { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }
        case 'LOW':
            return { background: '#f9fafb', color: '#4b5563', border: '1px solid #e5e7eb' }
        default:
            return { background: '#f9fafb', color: '#4b5563', border: '1px solid #e5e7eb' }
    }
}

export default function ProjectsPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const initialQuery = searchParams.get('search') || searchParams.get('team') || ''
    const [organizations, setOrganizations] = useState([])
    const [organizationId, setOrganizationId] = useState('')
    const [projects, setProjects] = useState([])
    const [orgMembers, setOrgMembers] = useState([])
    const [allTasks, setAllTasks] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [toastMessage, setToastMessage] = useState('')
    const [error, setError] = useState('')

    // Filters and View Mode
    const [searchQuery, setSearchQuery] = useState(initialQuery)

    useEffect(() => {
        const q = searchParams.get('search') || searchParams.get('team')
        if (q !== null && q !== undefined) {
            setSearchQuery(q)
        }
    }, [searchParams])
    const [statusFilter, setStatusFilter] = useState('ALL')
    const [priorityFilter, setPriorityFilter] = useState('ALL')
    const [viewMode, setViewMode] = useState('grid') // 'grid' | 'table'

    // Modals state
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [editingProject, setEditingProject] = useState(null)
    const [detailProject, setDetailProject] = useState(null)
    const [projectToDelete, setProjectToDelete] = useState(null)

    // Form inputs for Create
    const [newProjectName, setNewProjectName] = useState('')
    const [newProjectKey, setNewProjectKey] = useState('')
    const [newProjectDescription, setNewProjectDescription] = useState('')
    const [newProjectStatus, setNewProjectStatus] = useState('PLANNING')
    const [newProjectPriority, setNewProjectPriority] = useState('MEDIUM')
    const [newProjectDueDate, setNewProjectDueDate] = useState('')
    const [newProjectLead, setNewProjectLead] = useState('')
    const [newProjectTeams, setNewProjectTeams] = useState(['Frontend Team'])
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Form inputs for Member Addition inside Detail Modal
    const [selectedMemberToAdd, setSelectedMemberToAdd] = useState('')

    function showToast(message) {
        setToastMessage(message)
        setTimeout(() => setToastMessage(''), 4000)
    }

    // Load initial organizations
    useEffect(() => {
        setIsLoading(true)
        getOrganizations()
            .then((loadedOrganizations) => {
                const orgs = Array.isArray(loadedOrganizations) ? loadedOrganizations : []
                setOrganizations(orgs)
                if (orgs.length > 0) {
                    setOrganizationId(orgs[0].id)
                } else {
                    setProjects([])
                }
            })
            .catch(() => {
                setProjects([])
            })
            .finally(() => setIsLoading(false))
    }, [])

    // Load projects, members, and all tasks when organization changes
    useEffect(() => {
        if (!organizationId) {
            setProjects([])
            return
        }

        Promise.all([
            getProjects(organizationId).catch(() => []),
            getOrganizationMembers(organizationId).catch(() => []),
            getTasks().catch(() => []),
        ])
            .then(([loadedProjects, loadedMembers, loadedTasks]) => {
                const pList = Array.isArray(loadedProjects) ? loadedProjects : []
                const tList = Array.isArray(loadedTasks) ? loadedTasks : []

                setAllTasks(tList)
                setOrgMembers(Array.isArray(loadedMembers) ? loadedMembers : [])

                const enriched = pList.map((p, idx) => {
                    return {
                        id: p.id || `proj-${idx}`,
                        name: p.name,
                        key: p.key || (p.name ? p.name.slice(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, '') : `PRJ-${idx + 1}`),
                        description: p.description || '',
                        status: p.status || 'ACTIVE',
                        priority: p.priority || 'MEDIUM',
                        dueDate: p.dueDate ? new Date(p.dueDate).toISOString().slice(0, 10) : '',
                        lead: p.lead || (p.createdBy?.name || 'Unassigned'),
                        teams: p.teams && p.teams.length > 0 ? p.teams : ['Frontend Team'],
                        members: p.members || [],
                        tasksSummary: p.tasksSummary || { total: 0, completed: 0, inProgress: 0, review: 0, todo: 0 },
                    }
                })

                setProjects(enriched)
            })
            .catch(() => {
                setProjects([])
            })
    }, [organizationId])

    // Real-time Socket.IO Listeners for Projects and Tasks
    useEffect(() => {
        const socket = getSocket()
        if (!socket) return

        function handleProjectCreated(newProj) {
            if (!newProj) return
            setProjects((prev) => {
                if (prev.some((p) => p.id === newProj.id)) return prev
                const normalized = {
                    id: newProj.id,
                    name: newProj.name,
                    key: newProj.key || (newProj.name ? newProj.name.slice(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, '') : 'PROJ'),
                    description: newProj.description || '',
                    status: newProj.status || 'ACTIVE',
                    priority: newProj.priority || 'MEDIUM',
                    dueDate: newProj.dueDate ? new Date(newProj.dueDate).toISOString().slice(0, 10) : '',
                    lead: newProj.lead || 'Unassigned',
                    teams: newProj.teams && newProj.teams.length > 0 ? newProj.teams : ['Frontend Team'],
                    members: newProj.members || [],
                    tasksSummary: { total: 0, completed: 0, inProgress: 0, review: 0, todo: 0 },
                }
                return [normalized, ...prev]
            })
        }

        function handleProjectUpdated(updatedProj) {
            if (!updatedProj?.id) return
            setProjects((prev) =>
                prev.map((p) => (p.id === updatedProj.id ? { ...p, ...updatedProj } : p))
            )
            setDetailProject((prev) => (prev && prev.id === updatedProj.id ? { ...prev, ...updatedProj } : prev))
        }

        function handleProjectDeleted(payload) {
            const delId = payload?.id || payload?.projectId
            if (!delId) return
            setProjects((prev) => prev.filter((p) => p.id !== delId && String(p.id) !== String(delId)))
            setDetailProject((prev) => (prev && (prev.id === delId || String(prev.id) === String(delId)) ? null : prev))
        }

        function handleTaskCreated(newTask) {
            if (newTask) setAllTasks((prev) => [newTask, ...prev.filter((t) => t.id !== newTask.id)])
        }

        function handleTaskUpdated(updatedTask) {
            if (updatedTask) setAllTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? { ...t, ...updatedTask } : t)))
        }

        function handleTaskDeleted(payload) {
            const delId = payload?.id || payload?.taskId
            if (delId) setAllTasks((prev) => prev.filter((t) => t.id !== delId && String(t.id) !== String(delId)))
        }

        socket.on('project:created', handleProjectCreated)
        socket.on('project:updated', handleProjectUpdated)
        socket.on('project:deleted', handleProjectDeleted)
        socket.on('task:created', handleTaskCreated)
        socket.on('task:updated', handleTaskUpdated)
        socket.on('task:deleted', handleTaskDeleted)

        return () => {
            socket.off('project:created', handleProjectCreated)
            socket.off('project:updated', handleProjectUpdated)
            socket.off('project:deleted', handleProjectDeleted)
            socket.off('task:created', handleTaskCreated)
            socket.off('task:updated', handleTaskUpdated)
            socket.off('task:deleted', handleTaskDeleted)
        }
    }, [])

    // Real-time task breakdown map grouped by project name
    const projectTasksMap = useMemo(() => {
        const map = {}
        allTasks.forEach((task) => {
            const pName = (task.project || '').trim().toLowerCase()
            if (!pName) return
            if (!map[pName]) {
                map[pName] = { total: 0, completed: 0, inProgress: 0, review: 0, todo: 0 }
            }
            map[pName].total++
            const status = (task.status || '').toLowerCase()
            if (status === 'done' || status === 'completed') {
                map[pName].completed++
            } else if (status === 'in progress' || status === 'in_progress') {
                map[pName].inProgress++
            } else if (status === 'review' || status === 'in_review') {
                map[pName].review++
            } else {
                map[pName].todo++
            }
        })
        return map
    }, [allTasks])

    // Enrich projects with live task metrics
    const enrichedProjects = useMemo(() => {
        return projects.map((p) => {
            const pKey = (p.name || '').trim().toLowerCase()
            const liveSummary = projectTasksMap[pKey] || p.tasksSummary || { total: 0, completed: 0, inProgress: 0, review: 0, todo: 0 }
            return {
                ...p,
                tasksSummary: liveSummary,
            }
        })
    }, [projects, projectTasksMap])

    // Filter projects based on search query, status tab, and priority dropdown
    const filteredProjects = useMemo(() => {
        return enrichedProjects.filter((p) => {
            const query = searchQuery.trim().toLowerCase()
            const matchesQuery =
                !query ||
                p.name.toLowerCase().includes(query) ||
                (p.key && p.key.toLowerCase().includes(query)) ||
                (p.description && p.description.toLowerCase().includes(query)) ||
                (p.lead && p.lead.toLowerCase().includes(query)) ||
                (p.teams && p.teams.some((t) => t.toLowerCase().includes(query)))

            const matchesStatus =
                statusFilter === 'ALL' || p.status.toUpperCase() === statusFilter.toUpperCase()

            const matchesPriority =
                priorityFilter === 'ALL' || p.priority.toUpperCase() === priorityFilter.toUpperCase()

            return matchesQuery && matchesStatus && matchesPriority
        })
    }, [enrichedProjects, searchQuery, statusFilter, priorityFilter])

    // Metric KPI Computations
    const metrics = useMemo(() => {
        const total = enrichedProjects.length
        const active = enrichedProjects.filter((p) => p.status === 'ACTIVE').length
        const urgent = enrichedProjects.filter((p) => p.priority === 'URGENT' || p.priority === 'HIGH').length
        const completed = enrichedProjects.filter((p) => p.status === 'COMPLETED').length

        let totalProgressSum = 0
        let count = 0
        enrichedProjects.forEach((p) => {
            if (p.tasksSummary?.total > 0) {
                totalProgressSum += Math.round((p.tasksSummary.completed / p.tasksSummary.total) * 100)
                count++
            }
        })
        const avgProgress = count > 0 ? Math.round(totalProgressSum / count) : 0

        return { total, active, urgent, completed, avgProgress }
    }, [enrichedProjects])

    // Status counts for tabs
    const statusCounts = useMemo(() => {
        return {
            ALL: enrichedProjects.length,
            ACTIVE: enrichedProjects.filter((p) => p.status === 'ACTIVE').length,
            PLANNING: enrichedProjects.filter((p) => p.status === 'PLANNING').length,
            ON_HOLD: enrichedProjects.filter((p) => p.status === 'ON_HOLD').length,
            COMPLETED: enrichedProjects.filter((p) => p.status === 'COMPLETED').length,
            ARCHIVED: enrichedProjects.filter((p) => p.status === 'ARCHIVED').length,
        }
    }, [enrichedProjects])

    // Handler: Open Project Details & fetch latest assigned members
    async function openProjectDetails(project) {
        setDetailProject(project)
        if (!project.id || String(project.id).startsWith('proj-')) return
        try {
            const members = await getProjectMembers(project.id)
            if (Array.isArray(members)) {
                const normalized = members.map((m) => ({
                    id: m.id || m.userId,
                    name: m.name || m.user?.name || m.email || m.user?.email || 'Member',
                    email: m.email || m.user?.email || '',
                    role: m.role || 'MEMBER',
                }))
                setDetailProject((prev) => (prev && prev.id === project.id ? { ...prev, members: normalized } : prev))
                setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, members: normalized } : p)))
            }
        } catch {
            // Keep existing state
        }
    }

    // Handler: Create Project
    async function handleCreateProject(e) {
        e.preventDefault()
        if (!newProjectName.trim()) return

        setIsSubmitting(true)
        setError('')

        const generatedKey = newProjectKey.trim() || newProjectName.trim().slice(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PROJ'

        try {
            const effectiveOrgId = organizationId && organizationId !== 'org-default' ? organizationId : undefined
            const created = await createProject({
                name: newProjectName.trim(),
                description: newProjectDescription.trim() || 'No description provided.',
                organizationId: effectiveOrgId,
                priority: newProjectPriority,
                status: newProjectStatus,
                dueDate: newProjectDueDate || null,
            })

            if (created?.organizationId && (!organizationId || organizationId === 'org-default')) {
                setOrganizationId(created.organizationId)
            }

            const realId = created?.id || `proj-${Date.now()}`
            const realProject = {
                id: realId,
                name: created?.name || newProjectName.trim(),
                key: generatedKey,
                description: created?.description || newProjectDescription.trim() || 'No description provided.',
                status: created?.status || newProjectStatus,
                priority: created?.priority || newProjectPriority,
                dueDate: created?.dueDate ? new Date(created.dueDate).toISOString().slice(0, 10) : (newProjectDueDate || ''),
                lead: newProjectLead || 'Unassigned',
                teams: newProjectTeams.length > 0 ? newProjectTeams : ['Frontend Team'],
                members: [],
                tasksSummary: { total: 0, completed: 0, inProgress: 0, review: 0, todo: 0 },
            }

            // If a lead was chosen and is an org member, automatically assign them
            const leadMember = orgMembers.find((m) => (m.name || m.email) === newProjectLead || m.userId === newProjectLead)
            if (leadMember && realId && !String(realId).startsWith('proj-')) {
                await addProjectMember(realId, leadMember.userId).catch(() => null)
                realProject.members = [{
                    id: leadMember.userId,
                    name: leadMember.name || leadMember.email,
                    email: leadMember.email,
                    role: 'LEAD',
                }]
            }

            setProjects((prev) => [realProject, ...prev.filter((p) => p.id !== realProject.id)])
            showToast(`Project "${realProject.name}" created successfully!`)
            setShowCreateModal(false)

            // Reset form
            setNewProjectName('')
            setNewProjectKey('')
            setNewProjectDescription('')
            setNewProjectStatus('PLANNING')
            setNewProjectPriority('MEDIUM')
            setNewProjectDueDate('')
            setNewProjectLead('')
            setNewProjectTeams(['Frontend Team'])
        } catch (err) {
            setError(err.message || 'Failed to create project')
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handler: Update Project
    async function handleUpdateProject(e) {
        e.preventDefault()
        if (!editingProject) return

        setIsSubmitting(true)
        setError('')
        try {
            if (!String(editingProject.id).startsWith('proj-')) {
                await updateProject(editingProject.id, {
                    name: editingProject.name,
                    description: editingProject.description,
                    status: editingProject.status,
                    priority: editingProject.priority,
                    dueDate: editingProject.dueDate || null,
                })
            }

            setProjects((prev) =>
                prev.map((p) => (p.id === editingProject.id ? { ...p, ...editingProject } : p))
            )
            if (detailProject && detailProject.id === editingProject.id) {
                setDetailProject((prev) => ({ ...prev, ...editingProject }))
            }
            showToast(`Project "${editingProject.name}" updated successfully!`)
            setEditingProject(null)
        } catch (err) {
            setError(err.message || 'Failed to update project')
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handler: Toggle Archive
    async function handleToggleArchive(project) {
        const nextStatus = project.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED'
        const updated = { ...project, status: nextStatus }

        try {
            if (!String(project.id).startsWith('proj-')) {
                await updateProject(project.id, { status: nextStatus })
            }
            setProjects((prev) => prev.map((p) => (p.id === project.id ? updated : p)))
            if (detailProject && detailProject.id === project.id) {
                setDetailProject(updated)
            }
            showToast(nextStatus === 'ARCHIVED' ? `Project "${project.name}" archived.` : `Project "${project.name}" restored to Active!`)
        } catch (err) {
            setError(err.message || 'Failed to update project status')
        }
    }

    // Handler: Confirm & Execute Delete Project
    async function confirmExecuteDeleteProject() {
        if (!projectToDelete) return
        const targetId = projectToDelete.id
        const targetName = projectToDelete.name

        try {
            if (!String(targetId).startsWith('proj-')) {
                await deleteProject(targetId)
            }
            setProjects((prev) => prev.filter((p) => p.id !== targetId))
            if (detailProject && detailProject.id === targetId) {
                setDetailProject(null)
            }
            showToast(`Project "${targetName}" deleted successfully.`)
            setProjectToDelete(null)
        } catch (err) {
            setError(err.message || 'Failed to delete project')
        }
    }

    // Handler: Add Member to Project (inside Detail Modal)
    async function handleAddMemberToDetailProject() {
        if (!detailProject || !selectedMemberToAdd) return

        const memberObj = orgMembers.find((m) => m.userId === selectedMemberToAdd) || {
            userId: selectedMemberToAdd,
            name: selectedMemberToAdd.includes('@') ? selectedMemberToAdd.split('@')[0] : selectedMemberToAdd,
            email: selectedMemberToAdd.includes('@') ? selectedMemberToAdd : '',
            role: 'DEVELOPER',
        }

        const newMember = {
            id: memberObj.userId,
            name: memberObj.name || memberObj.email,
            email: memberObj.email,
            role: memberObj.role || 'MEMBER',
        }

        try {
            if (!String(detailProject.id).startsWith('proj-')) {
                await addProjectMember(detailProject.id, newMember.id)
            }
            const updatedMembers = [...(detailProject.members || []).filter((m) => m.id !== newMember.id), newMember]
            const updatedProject = { ...detailProject, members: updatedMembers }

            setDetailProject(updatedProject)
            setProjects((prev) => prev.map((p) => (p.id === detailProject.id ? updatedProject : p)))
            showToast(`Added ${newMember.name} to ${detailProject.name}!`)
            setSelectedMemberToAdd('')
        } catch (err) {
            setError(err.message || 'Failed to add member to project')
        }
    }

    // Handler: Remove Member from Project
    async function handleRemoveMemberFromDetailProject(memberId) {
        if (!detailProject) return

        try {
            if (!String(detailProject.id).startsWith('proj-')) {
                await removeProjectMember(detailProject.id, memberId)
            }
            const updatedMembers = (detailProject.members || []).filter((m) => m.id !== memberId && m.userId !== memberId)
            const updatedProject = { ...detailProject, members: updatedMembers }

            setDetailProject(updatedProject)
            setProjects((prev) => prev.map((p) => (p.id === detailProject.id ? updatedProject : p)))
            showToast('Member removed from project.')
        } catch (err) {
            setError(err.message || 'Failed to remove member from project')
        }
    }

    // Navigation: View Tasks in Kanban
    function navigateToTasks(projectName) {
        navigate(`/tasks?project=${encodeURIComponent(projectName)}`)
    }

    const activeOrg = organizations.find((o) => o.id === organizationId)
    const storedRole = (localStorage.getItem('workflowx_registered_role') || '').toUpperCase()
    const userRole = (activeOrg?.role || storedRole || 'MEMBER').toUpperCase()
    const canManageProjects = userRole === 'ADMIN' || userRole === 'MANAGER'

    return (
        <main className="feature-page" style={{ paddingBottom: '60px' }}>
            {/* Toast Feedback Banner */}
            {toastMessage && (
                <div
                    id="projects-toast-notification"
                    style={{
                        position: 'fixed',
                        bottom: '24px',
                        right: '24px',
                        background: '#10b981',
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
                    <span>✓</span> {toastMessage}
                </div>
            )}

            {/* Feature Heading */}
            <div className="feature-heading">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <p className="eyebrow" style={{ margin: 0 }}>Workspace • Portfolio</p>
                        <span
                            style={{
                                fontSize: '10px',
                                background: userRole === 'ADMIN' ? '#fee2e2' : userRole === 'MANAGER' ? '#e0e7ff' : '#f0fdf4',
                                color: userRole === 'ADMIN' ? '#b91c1c' : userRole === 'MANAGER' ? '#4338ca' : '#15803d',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontWeight: 700,
                            }}
                        >
                            Role: {userRole}
                        </span>
                    </div>
                    <h1>Projects & Initiatives</h1>
                    <p className="heading-subtitle">
                        Plan milestones, assign teams, track task completion, and coordinate cross-functional delivery.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {organizations.length > 0 && (
                        <label className="organization-select" style={{ margin: 0 }}>
                            <select
                                id="projects-org-select"
                                value={organizationId}
                                onChange={(e) => setOrganizationId(e.target.value)}
                            >
                                {organizations.map((org) => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </select>
                        </label>
                    )}
                    {canManageProjects && (
                        <button
                            id="open-create-project-btn"
                            className="primary-button"
                            type="button"
                            onClick={() => setShowCreateModal(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <span>+</span> Create Project
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>⚠️ {error}</span>
                    <button type="button" onClick={() => setError('')} style={{ background: 'transparent', border: 'none', color: '#b91c1c', cursor: 'pointer', fontWeight: 700 }}>✕</button>
                </div>
            )}

            {/* KPI Metrics Strip (Clickable filters) */}
            <section
                className="stats-grid"
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                    gap: '16px',
                    marginBottom: '24px',
                }}
            >
                <div
                    className="stat-card"
                    style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #ebe9e5', cursor: 'pointer', transition: 'transform 0.15s ease' }}
                    onClick={() => {
                        setStatusFilter('ALL')
                        setPriorityFilter('ALL')
                    }}
                    title="Click to view all projects"
                >
                    <span className="stat-icon blue" style={{ background: '#eff6ff', color: '#2563eb' }}>📁</span>
                    <div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Total Projects</p>
                        <strong style={{ fontSize: '24px', color: '#111827' }}>{metrics.total}</strong>
                        <small className="neutral" style={{ display: 'block', fontSize: '11px', color: '#9ca3af' }}>Click to view all</small>
                    </div>
                </div>

                <div
                    className="stat-card"
                    style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #ebe9e5', cursor: 'pointer', transition: 'transform 0.15s ease' }}
                    onClick={() => setStatusFilter('ACTIVE')}
                    title="Click to filter by Active projects"
                >
                    <span className="stat-icon green" style={{ background: '#ecfdf5', color: '#059669' }}>⚡</span>
                    <div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Active Projects</p>
                        <strong style={{ fontSize: '24px', color: '#059669' }}>{metrics.active}</strong>
                        <small className="positive" style={{ display: 'block', fontSize: '11px', color: '#059669' }}>Filter Active ➔</small>
                    </div>
                </div>

                <div
                    className="stat-card"
                    style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #ebe9e5', cursor: 'pointer', transition: 'transform 0.15s ease' }}
                    onClick={() => setPriorityFilter('URGENT')}
                    title="Click to filter by Urgent priority"
                >
                    <span className="stat-icon coral" style={{ background: '#fef2f2', color: '#dc2626' }}>🔥</span>
                    <div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Urgent / High</p>
                        <strong style={{ fontSize: '24px', color: '#dc2626' }}>{metrics.urgent}</strong>
                        <small className="neutral" style={{ display: 'block', fontSize: '11px', color: '#dc2626' }}>Filter Urgent ➔</small>
                    </div>
                </div>

                <div
                    className="stat-card"
                    style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #ebe9e5' }}
                >
                    <span className="stat-icon yellow" style={{ background: '#fffbeb', color: '#d97706' }}>🎯</span>
                    <div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Milestone Progress</p>
                        <strong style={{ fontSize: '24px', color: '#111827' }}>{metrics.avgProgress}%</strong>
                        <div style={{ width: '100%', height: '4px', background: '#e5e7eb', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                            <div style={{ width: `${metrics.avgProgress}%`, height: '100%', background: '#10b981', borderRadius: '2px', transition: 'width 0.4s ease' }} />
                        </div>
                    </div>
                </div>
            </section>

            {/* Filter, Search & Controls Toolbar */}
            <section
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '14px',
                    background: '#fff',
                    padding: '12px 20px',
                    borderRadius: '10px',
                    border: '1px solid #ebe9e5',
                    marginBottom: '20px',
                }}
            >
                {/* Status Tabs */}
                <div className="filter-tabs" style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
                    {[
                        { key: 'ALL', label: 'All Projects' },
                        { key: 'ACTIVE', label: 'Active' },
                        { key: 'PLANNING', label: 'Planning' },
                        { key: 'ON_HOLD', label: 'On Hold' },
                        { key: 'COMPLETED', label: 'Completed' },
                        { key: 'ARCHIVED', label: 'Archived' },
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            id={`filter-status-${tab.key.toLowerCase()}`}
                            type="button"
                            className={statusFilter === tab.key ? 'selected' : ''}
                            onClick={() => setStatusFilter(tab.key)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <span>{tab.label}</span>
                            <span
                                style={{
                                    fontSize: '10px',
                                    padding: '1px 6px',
                                    borderRadius: '10px',
                                    background: statusFilter === tab.key ? '#fff' : '#f3f4f6',
                                    color: statusFilter === tab.key ? '#1f2937' : '#6b7280',
                                    fontWeight: 700,
                                }}
                            >
                                {statusCounts[tab.key] || 0}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Right controls: Search, Priority, View Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                        <input
                            id="project-search-input"
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name, key, team, lead..."
                            style={{
                                padding: '7px 12px 7px 28px',
                                fontSize: '12px',
                                borderRadius: '6px',
                                border: '1px solid #d1d5db',
                                width: '230px',
                                outline: 'none',
                            }}
                        />
                        <span style={{ position: 'absolute', left: '9px', top: '8px', color: '#9ca3af', fontSize: '12px' }}>
                            🔍
                        </span>
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                style={{ position: 'absolute', right: '8px', top: '6px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '11px' }}
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Priority Selector */}
                    <select
                        id="project-priority-filter"
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value)}
                        style={{
                            padding: '7px 10px',
                            fontSize: '12px',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            background: '#fff',
                        }}
                    >
                        <option value="ALL">All Priorities</option>
                        <option value="URGENT">Urgent Priority</option>
                        <option value="HIGH">High Priority</option>
                        <option value="MEDIUM">Medium Priority</option>
                        <option value="LOW">Low Priority</option>
                    </select>

                    {/* View Mode Toggle */}
                    <div style={{ display: 'flex', background: '#f3f4f6', padding: '2px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                        <button
                            id="toggle-grid-view-btn"
                            type="button"
                            onClick={() => setViewMode('grid')}
                            style={{
                                padding: '5px 10px',
                                border: 'none',
                                borderRadius: '4px',
                                background: viewMode === 'grid' ? '#fff' : 'transparent',
                                color: viewMode === 'grid' ? '#111827' : '#6b7280',
                                fontWeight: viewMode === 'grid' ? 600 : 'normal',
                                cursor: 'pointer',
                                fontSize: '12px',
                                boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                            }}
                            title="Grid Card View"
                        >
                            ⊞ Cards
                        </button>
                        <button
                            id="toggle-table-view-btn"
                            type="button"
                            onClick={() => setViewMode('table')}
                            style={{
                                padding: '5px 10px',
                                border: 'none',
                                borderRadius: '4px',
                                background: viewMode === 'table' ? '#fff' : 'transparent',
                                color: viewMode === 'table' ? '#111827' : '#6b7280',
                                fontWeight: viewMode === 'table' ? 600 : 'normal',
                                cursor: 'pointer',
                                fontSize: '12px',
                                boxShadow: viewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                            }}
                            title="Table List View"
                        >
                            ≡ Table
                        </button>
                    </div>
                </div>
            </section>

            {/* Projects Content Area */}
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                    <p>Loading projects & portfolios...</p>
                </div>
            ) : filteredProjects.length === 0 ? (
                <div
                    style={{
                        background: '#fff',
                        border: '1px dashed #d1d5db',
                        borderRadius: '12px',
                        padding: '60px 20px',
                        textAlign: 'center',
                    }}
                >
                    <div style={{ fontSize: '36px', marginBottom: '12px' }}>📂</div>
                    <h3 style={{ margin: '0 0 6px', color: '#111827' }}>No projects found</h3>
                    <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: '13px' }}>
                        {searchQuery
                            ? `No projects matched "${searchQuery}". Try clearing search or filters.`
                            : 'No projects match your selected filters. Create your first initiative!'}
                    </p>
                    <button
                        type="button"
                        className="primary-button"
                        onClick={() => {
                            setSearchQuery('')
                            setStatusFilter('ALL')
                            setPriorityFilter('ALL')
                        }}
                    >
                        Reset Filters
                    </button>
                </div>
            ) : viewMode === 'grid' ? (
                /* GRID CARD VIEW */
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                        gap: '20px',
                    }}
                >
                    {filteredProjects.map((project) => {
                        const progressPct =
                            project.tasksSummary?.total > 0
                                ? Math.round((project.tasksSummary.completed / project.tasksSummary.total) * 100)
                                : 0

                        return (
                            <article
                                key={project.id}
                                id={`project-card-${project.id}`}
                                style={{
                                    background: '#fff',
                                    borderRadius: '12px',
                                    border: '1px solid #e5e7eb',
                                    padding: '20px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    position: 'relative',
                                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                }}
                            >
                                {/* Top Header: Key, Status & Priority */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span
                                                style={{
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    background: '#f3f4f6',
                                                    color: '#374151',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    letterSpacing: '0.5px',
                                                }}
                                            >
                                                {project.key || 'PROJ'}
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    ...getStatusBadgeStyle(project.status),
                                                }}
                                            >
                                                ● {project.status}
                                            </span>
                                        </div>

                                        <span
                                            style={{
                                                fontSize: '10px',
                                                fontWeight: 700,
                                                padding: '2px 7px',
                                                borderRadius: '6px',
                                                ...getPriorityBadgeStyle(project.priority),
                                            }}
                                        >
                                            {project.priority}
                                        </span>
                                    </div>

                                    {/* Project Title & Description */}
                                    <h3
                                        style={{
                                            margin: '0 0 6px',
                                            fontSize: '16px',
                                            fontWeight: 700,
                                            color: '#111827',
                                            cursor: 'pointer',
                                        }}
                                        onClick={() => openProjectDetails(project)}
                                        title="Click to view full details"
                                    >
                                        {highlightMatch(project.name, searchQuery)}
                                    </h3>
                                    <p
                                        style={{
                                            margin: '0 0 16px',
                                            fontSize: '12px',
                                            color: '#4b5563',
                                            lineHeight: '1.5',
                                            minHeight: '36px',
                                        }}
                                    >
                                        {highlightMatch(project.description || 'No description provided.', searchQuery)}
                                    </p>

                                    {/* Associated Teams Badges */}
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                                        {(project.teams || ['Frontend Team']).map((team, tIdx) => (
                                            <span
                                                key={tIdx}
                                                style={{
                                                    fontSize: '11px',
                                                    background: '#f8fafc',
                                                    color: '#334155',
                                                    border: '1px solid #e2e8f0',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                }}
                                            >
                                                👥 {highlightMatch(team, searchQuery)}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Progress Bar & Task Delivery Breakdown */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginBottom: '5px' }}>
                                            <span>
                                                Delivery Progress ({project.tasksSummary?.completed || 0}/{project.tasksSummary?.total || 0} tasks)
                                            </span>
                                            <strong style={{ color: '#111827' }}>{progressPct}%</strong>
                                        </div>
                                        <div style={{ width: '100%', height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div
                                                style={{
                                                    width: `${progressPct}%`,
                                                    height: '100%',
                                                    background: progressPct === 100 ? '#10b981' : progressPct > 50 ? '#3b82f6' : '#f59e0b',
                                                    borderRadius: '3px',
                                                    transition: 'width 0.3s ease',
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Metadata: Lead, Members & Deadline */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            paddingTop: '12px',
                                            borderTop: '1px solid #f3f4f6',
                                            marginBottom: '16px',
                                            fontSize: '11px',
                                            color: '#6b7280',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '12px' }}>👤</span>
                                            <span>Lead: <b>{highlightMatch(project.lead || 'Unassigned', searchQuery)}</b></span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span>📅</span>
                                            <span>Due: <b>{project.dueDate || 'Flexible'}</b></span>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons Footer */}
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        paddingTop: '12px',
                                        borderTop: '1px solid #f3f4f6',
                                        gap: '6px',
                                    }}
                                >
                                    <button
                                        id={`view-tasks-${project.id}`}
                                        type="button"
                                        onClick={() => navigateToTasks(project.name)}
                                        style={{
                                            background: '#f0fdf4',
                                            color: '#15803d',
                                            border: '1px solid #bbf7d0',
                                            borderRadius: '6px',
                                            padding: '6px 12px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                        }}
                                        title={`Open Signboard filtered by ${project.name}`}
                                    >
                                        <span>📋</span> Tasks ➔
                                    </button>

                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            id={`view-project-${project.id}`}
                                            type="button"
                                            onClick={() => openProjectDetails(project)}
                                            style={{
                                                background: '#f8fafc',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '6px',
                                                padding: '6px 9px',
                                                fontSize: '11px',
                                                color: '#334155',
                                                cursor: 'pointer',
                                                fontWeight: 500,
                                            }}
                                            title="View members & detailed overview"
                                        >
                                            Details
                                        </button>

                                        {canManageProjects && (
                                            <>
                                                <button
                                                    id={`edit-project-${project.id}`}
                                                    type="button"
                                                    onClick={() => setEditingProject(project)}
                                                    style={{
                                                        background: '#f8fafc',
                                                        border: '1px solid #cbd5e1',
                                                        borderRadius: '6px',
                                                        padding: '6px 9px',
                                                        fontSize: '11px',
                                                        color: '#334155',
                                                        cursor: 'pointer',
                                                        fontWeight: 500,
                                                    }}
                                                    title="Edit Project Details"
                                                >
                                                    Edit
                                                </button>

                                                <button
                                                    id={`archive-project-${project.id}`}
                                                    type="button"
                                                    onClick={() => handleToggleArchive(project)}
                                                    style={{
                                                        background: '#f8fafc',
                                                        border: '1px solid #cbd5e1',
                                                        borderRadius: '6px',
                                                        padding: '6px 9px',
                                                        fontSize: '11px',
                                                        color: '#64748b',
                                                        cursor: 'pointer',
                                                    }}
                                                    title={project.status === 'ARCHIVED' ? 'Restore Project' : 'Archive Project'}
                                                >
                                                    {project.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
                                                </button>

                                                <button
                                                    id={`delete-project-${project.id}`}
                                                    type="button"
                                                    onClick={() => setProjectToDelete(project)}
                                                    style={{
                                                        background: '#fef2f2',
                                                        border: '1px solid #fecaca',
                                                        borderRadius: '6px',
                                                        padding: '6px 9px',
                                                        fontSize: '11px',
                                                        color: '#dc2626',
                                                        cursor: 'pointer',
                                                        fontWeight: 600,
                                                    }}
                                                    title="Delete Project"
                                                >
                                                    ✕
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </article>
                        )
                    })}
                </div>
            ) : (
                /* TABLE / LIST VIEW */
                <section
                    className="panel"
                    style={{
                        background: '#fff',
                        borderRadius: '12px',
                        border: '1px solid #e5e7eb',
                        overflow: 'hidden',
                    }}
                >
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '12px 18px' }}>Project</th>
                                    <th style={{ padding: '12px 14px' }}>Key</th>
                                    <th style={{ padding: '12px 14px' }}>Status</th>
                                    <th style={{ padding: '12px 14px' }}>Priority</th>
                                    <th style={{ padding: '12px 14px' }}>Progress</th>
                                    <th style={{ padding: '12px 14px' }}>Teams</th>
                                    <th style={{ padding: '12px 14px' }}>Deadline</th>
                                    <th style={{ padding: '12px 18px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProjects.map((project) => {
                                    const progressPct =
                                        project.tasksSummary?.total > 0
                                            ? Math.round((project.tasksSummary.completed / project.tasksSummary.total) * 100)
                                            : 0

                                    return (
                                        <tr key={project.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '14px 18px' }}>
                                                <strong
                                                    style={{ display: 'block', color: '#111827', cursor: 'pointer' }}
                                                    onClick={() => openProjectDetails(project)}
                                                >
                                                    {highlightMatch(project.name, searchQuery)}
                                                </strong>
                                                <small style={{ color: '#6b7280', fontSize: '11px' }}>
                                                    Lead: {highlightMatch(project.lead || 'Unassigned', searchQuery)}
                                                </small>
                                            </td>

                                            <td style={{ padding: '14px 14px' }}>
                                                <span style={{ fontSize: '11px', fontWeight: 700, background: '#f3f4f6', color: '#374151', padding: '2px 6px', borderRadius: '4px' }}>
                                                    {project.key || 'PROJ'}
                                                </span>
                                            </td>

                                            <td style={{ padding: '14px 14px' }}>
                                                <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', ...getStatusBadgeStyle(project.status) }}>
                                                    ● {project.status}
                                                </span>
                                            </td>

                                            <td style={{ padding: '14px 14px' }}>
                                                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', ...getPriorityBadgeStyle(project.priority) }}>
                                                    {project.priority}
                                                </span>
                                            </td>

                                            <td style={{ padding: '14px 14px', width: '130px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ flex: 1, height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{ width: `${progressPct}%`, height: '100%', background: '#10b981' }} />
                                                    </div>
                                                    <span style={{ fontSize: '11px', color: '#4b5563', fontWeight: 600 }}>{progressPct}%</span>
                                                </div>
                                            </td>

                                            <td style={{ padding: '14px 14px' }}>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {(project.teams || []).slice(0, 2).map((t, idx) => (
                                                        <span key={idx} style={{ fontSize: '10px', background: '#f8fafc', padding: '1px 5px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                            {t}
                                                        </span>
                                                    ))}
                                                    {(project.teams?.length || 0) > 2 && (
                                                        <span style={{ fontSize: '10px', color: '#6b7280' }}>+{project.teams.length - 2}</span>
                                                    )}
                                                </div>
                                            </td>

                                            <td style={{ padding: '14px 14px', color: '#4b5563', fontSize: '12px' }}>
                                                {project.dueDate || 'Flexible'}
                                            </td>

                                            <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => navigateToTasks(project.name)}
                                                        style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                                                        title="Open in Kanban Signboard"
                                                    >
                                                        Tasks
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => openProjectDetails(project)}
                                                        style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}
                                                    >
                                                        Details
                                                    </button>
                                                    {canManageProjects && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingProject(project)}
                                                                style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setProjectToDelete(project)}
                                                                style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', color: '#dc2626', cursor: 'pointer' }}
                                                            >
                                                                ✕
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* MODAL 1: CREATE PROJECT MODAL */}
            {showCreateModal && (
                <div
                    id="create-project-modal"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '16px',
                    }}
                    onClick={() => setShowCreateModal(false)}
                >
                    <div
                        style={{
                            background: '#fff',
                            borderRadius: '12px',
                            maxWidth: '560px',
                            width: '100%',
                            padding: '28px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                            <div>
                                <p className="eyebrow" style={{ margin: 0 }}>Initiative Setup</p>
                                <h2 style={{ margin: '4px 0 0', fontSize: '20px', color: '#111827' }}>Create New Project</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#6b7280' }}
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                    Project Name *
                                    <input
                                        id="new-project-name-input"
                                        type="text"
                                        required
                                        value={newProjectName}
                                        onChange={(e) => setNewProjectName(e.target.value)}
                                        placeholder="e.g. NextGen Web Portal"
                                        style={{ width: '100%', padding: '8px 12px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                    />
                                </label>

                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                    Key (Prefix)
                                    <input
                                        id="new-project-key-input"
                                        type="text"
                                        value={newProjectKey}
                                        onChange={(e) => setNewProjectKey(e.target.value.toUpperCase())}
                                        placeholder="e.g. PORTAL"
                                        maxLength={8}
                                        style={{ width: '100%', padding: '8px 12px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                    />
                                </label>
                            </div>

                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                Description
                                <textarea
                                    id="new-project-desc-input"
                                    rows={3}
                                    value={newProjectDescription}
                                    onChange={(e) => setNewProjectDescription(e.target.value)}
                                    placeholder="What is the mission, milestone, and success criteria for this project?"
                                    style={{ width: '100%', padding: '8px 12px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db', resize: 'vertical' }}
                                />
                            </label>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                    Status
                                    <select
                                        id="new-project-status-select"
                                        value={newProjectStatus}
                                        onChange={(e) => setNewProjectStatus(e.target.value)}
                                        style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff' }}
                                    >
                                        <option value="PLANNING">Planning</option>
                                        <option value="ACTIVE">Active</option>
                                        <option value="ON_HOLD">On Hold</option>
                                        <option value="COMPLETED">Completed</option>
                                    </select>
                                </label>

                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                    Priority
                                    <select
                                        id="new-project-priority-select"
                                        value={newProjectPriority}
                                        onChange={(e) => setNewProjectPriority(e.target.value)}
                                        style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff' }}
                                    >
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                        <option value="URGENT">Urgent</option>
                                    </select>
                                </label>

                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                    Deadline / Due
                                    <input
                                        id="new-project-duedate-input"
                                        type="date"
                                        value={newProjectDueDate}
                                        min={new Date().toISOString().split('T')[0]}
                                        onChange={(e) => setNewProjectDueDate(e.target.value)}
                                        style={{ width: '100%', padding: '7px 8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                    />
                                </label>
                            </div>

                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                Project Lead / Manager
                                <select
                                    id="new-project-lead-select"
                                    value={newProjectLead}
                                    onChange={(e) => setNewProjectLead(e.target.value)}
                                    style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff' }}
                                >
                                    <option value="">Select Project Lead...</option>
                                    {orgMembers.map((m) => (
                                        <option key={m.userId} value={m.name || m.email}>
                                            {m.name || m.email} ({m.role})
                                        </option>
                                    ))}
                                    <option value="Rahul Sharma">Rahul Sharma (Manager)</option>
                                    <option value="Pradeep Kumar">Pradeep Kumar (Developer)</option>
                                    <option value="Sneha Patel">Sneha Patel (DevOps)</option>
                                    <option value="Anil Verma">Anil Verma (Designer)</option>
                                </select>
                            </label>

                            <div>
                                <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                    Associated Teams
                                </p>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {AVAILABLE_TEAMS.map((teamName) => {
                                        const isSelected = newProjectTeams.includes(teamName)
                                        return (
                                            <button
                                                key={teamName}
                                                type="button"
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setNewProjectTeams(newProjectTeams.filter((t) => t !== teamName))
                                                    } else {
                                                        setNewProjectTeams([...newProjectTeams, teamName])
                                                    }
                                                }}
                                                style={{
                                                    padding: '4px 10px',
                                                    fontSize: '11px',
                                                    borderRadius: '6px',
                                                    border: isSelected ? '1px solid #2563eb' : '1px solid #d1d5db',
                                                    background: isSelected ? '#eff6ff' : '#fff',
                                                    color: isSelected ? '#1d4ed8' : '#374151',
                                                    fontWeight: isSelected ? 600 : 'normal',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {isSelected ? '✓ ' : '+ '} {teamName}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    id="submit-create-project-btn"
                                    type="submit"
                                    className="primary-button"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? 'Creating...' : 'Create Project'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: EDIT PROJECT MODAL */}
            {editingProject && (
                <div
                    id="edit-project-modal"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '16px',
                    }}
                    onClick={() => setEditingProject(null)}
                >
                    <div
                        style={{
                            background: '#fff',
                            borderRadius: '12px',
                            maxWidth: '560px',
                            width: '100%',
                            padding: '28px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                            <div>
                                <p className="eyebrow" style={{ margin: 0 }}>Update Project</p>
                                <h2 style={{ margin: '4px 0 0', fontSize: '20px', color: '#111827' }}>
                                    Edit: {editingProject.name}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingProject(null)}
                                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#6b7280' }}
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleUpdateProject} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                Project Name
                                <input
                                    id="edit-project-name-input"
                                    type="text"
                                    required
                                    value={editingProject.name}
                                    onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                />
                            </label>

                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                Description
                                <textarea
                                    id="edit-project-desc-input"
                                    rows={3}
                                    value={editingProject.description || ''}
                                    onChange={(e) => setEditingProject({ ...editingProject, description: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db', resize: 'vertical' }}
                                />
                            </label>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                    Status
                                    <select
                                        id="edit-project-status-select"
                                        value={editingProject.status}
                                        onChange={(e) => setEditingProject({ ...editingProject, status: e.target.value })}
                                        style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff' }}
                                    >
                                        <option value="PLANNING">Planning</option>
                                        <option value="ACTIVE">Active</option>
                                        <option value="ON_HOLD">On Hold</option>
                                        <option value="COMPLETED">Completed</option>
                                        <option value="ARCHIVED">Archived</option>
                                    </select>
                                </label>

                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                    Priority
                                    <select
                                        id="edit-project-priority-select"
                                        value={editingProject.priority}
                                        onChange={(e) => setEditingProject({ ...editingProject, priority: e.target.value })}
                                        style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff' }}
                                    >
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                        <option value="URGENT">Urgent</option>
                                    </select>
                                </label>

                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                    Deadline
                                    <input
                                        id="edit-project-duedate-input"
                                        type="date"
                                        value={editingProject.dueDate || ''}
                                        min={new Date().toISOString().split('T')[0]}
                                        onChange={(e) => setEditingProject({ ...editingProject, dueDate: e.target.value })}
                                        style={{ width: '100%', padding: '7px 8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                    />
                                </label>
                            </div>

                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                Project Lead
                                <select
                                    id="edit-project-lead-select"
                                    value={editingProject.lead || ''}
                                    onChange={(e) => setEditingProject({ ...editingProject, lead: e.target.value })}
                                    style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff' }}
                                >
                                    <option value="">Unassigned</option>
                                    {orgMembers.map((m) => (
                                        <option key={m.userId} value={m.name || m.email}>
                                            {m.name || m.email} ({m.role})
                                        </option>
                                    ))}
                                    <option value="Rahul Sharma">Rahul Sharma (Manager)</option>
                                    <option value="Pradeep Kumar">Pradeep Kumar (Developer)</option>
                                    <option value="Sneha Patel">Sneha Patel (DevOps)</option>
                                    <option value="Anil Verma">Anil Verma (Designer)</option>
                                </select>
                            </label>

                            <div>
                                <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                    Associated Teams
                                </p>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {AVAILABLE_TEAMS.map((teamName) => {
                                        const currentTeams = editingProject.teams || []
                                        const isSelected = currentTeams.includes(teamName)
                                        return (
                                            <button
                                                key={teamName}
                                                type="button"
                                                onClick={() => {
                                                    const updatedTeams = isSelected
                                                        ? currentTeams.filter((t) => t !== teamName)
                                                        : [...currentTeams, teamName]
                                                    setEditingProject({ ...editingProject, teams: updatedTeams })
                                                }}
                                                style={{
                                                    padding: '4px 10px',
                                                    fontSize: '11px',
                                                    borderRadius: '6px',
                                                    border: isSelected ? '1px solid #2563eb' : '1px solid #d1d5db',
                                                    background: isSelected ? '#eff6ff' : '#fff',
                                                    color: isSelected ? '#1d4ed8' : '#374151',
                                                    fontWeight: isSelected ? 600 : 'normal',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {isSelected ? '✓ ' : '+ '} {teamName}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                                <button
                                    type="button"
                                    onClick={() => setEditingProject(null)}
                                    style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    id="save-edit-project-btn"
                                    type="submit"
                                    className="primary-button"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 3: PROJECT DETAILS & MEMBER/TEAM MANAGEMENT MODAL */}
            {detailProject && (
                <div
                    id="project-details-modal"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '16px',
                    }}
                    onClick={() => setDetailProject(null)}
                >
                    <div
                        style={{
                            background: '#fff',
                            borderRadius: '12px',
                            maxWidth: '680px',
                            width: '100%',
                            padding: '28px',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, background: '#f3f4f6', color: '#374151', padding: '2px 8px', borderRadius: '6px' }}>
                                        {detailProject.key || 'PROJ'}
                                    </span>
                                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', ...getStatusBadgeStyle(detailProject.status) }}>
                                        ● {detailProject.status}
                                    </span>
                                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', ...getPriorityBadgeStyle(detailProject.priority) }}>
                                        {detailProject.priority}
                                    </span>
                                </div>
                                <h2 style={{ margin: 0, fontSize: '22px', color: '#111827' }}>
                                    {detailProject.name}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDetailProject(null)}
                                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#6b7280' }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Description */}
                        <p style={{ fontSize: '13px', color: '#4b5563', lineHeight: '1.6', marginBottom: '20px' }}>
                            {detailProject.description || 'No description provided for this project.'}
                        </p>

                        {/* Quick Stats Grid */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: '10px',
                                background: '#f8fafc',
                                padding: '14px',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                marginBottom: '20px',
                                textAlign: 'center',
                            }}
                        >
                            <div>
                                <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Tasks</span>
                                <strong style={{ display: 'block', fontSize: '18px', color: '#0f172a' }}>{detailProject.tasksSummary?.total || 0}</strong>
                            </div>
                            <div>
                                <span style={{ fontSize: '10px', color: '#059669', textTransform: 'uppercase', fontWeight: 600 }}>Completed</span>
                                <strong style={{ display: 'block', fontSize: '18px', color: '#059669' }}>{detailProject.tasksSummary?.completed || 0}</strong>
                            </div>
                            <div>
                                <span style={{ fontSize: '10px', color: '#2563eb', textTransform: 'uppercase', fontWeight: 600 }}>In Progress</span>
                                <strong style={{ display: 'block', fontSize: '18px', color: '#2563eb' }}>{detailProject.tasksSummary?.inProgress || 0}</strong>
                            </div>
                            <div>
                                <span style={{ fontSize: '10px', color: '#d97706', textTransform: 'uppercase', fontWeight: 600 }}>Todo / Backlog</span>
                                <strong style={{ display: 'block', fontSize: '18px', color: '#d97706' }}>{detailProject.tasksSummary?.todo || 0}</strong>
                            </div>
                        </div>

                        {/* Lead and Due Date info */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '20px', fontSize: '12px', color: '#374151' }}>
                            <div>
                                <span style={{ color: '#6b7280' }}>Project Lead: </span>
                                <strong>{detailProject.lead || 'Unassigned'}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#6b7280' }}>Target Deadline: </span>
                                <strong>{detailProject.dueDate || 'Flexible'}</strong>
                            </div>
                        </div>

                        {/* Assigned Teams */}
                        <div style={{ marginBottom: '20px' }}>
                            <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#374151' }}>Associated Teams</h4>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {(detailProject.teams || ['Frontend Team']).map((t, idx) => (
                                    <span key={idx} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500 }}>
                                        👥 {t}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Members Management Section */}
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h4 style={{ margin: 0, fontSize: '13px', color: '#374151' }}>
                                    Assigned Project Members ({detailProject.members?.length || 0})
                                </h4>
                            </div>

                            {/* Member addition inline form */}
                            {canManageProjects && (
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                    <select
                                        id="add-member-to-project-select"
                                        value={selectedMemberToAdd}
                                        onChange={(e) => setSelectedMemberToAdd(e.target.value)}
                                        style={{ flex: 1, padding: '7px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff' }}
                                    >
                                        <option value="">Select organization member to assign...</option>
                                        {orgMembers.map((m) => (
                                            <option key={m.userId} value={m.userId}>
                                                {m.name || m.email} ({m.role})
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        id="add-project-member-btn"
                                        type="button"
                                        onClick={handleAddMemberToDetailProject}
                                        disabled={!selectedMemberToAdd}
                                        style={{
                                            background: selectedMemberToAdd ? '#2563eb' : '#9ca3af',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '6px',
                                            padding: '7px 14px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            cursor: selectedMemberToAdd ? 'pointer' : 'not-allowed',
                                        }}
                                    >
                                        + Add to Project
                                    </button>
                                </div>
                            )}

                            {/* Assigned members list */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                                {(detailProject.members || []).length === 0 ? (
                                    <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '6px', textAlign: 'center', color: '#6b7280', fontSize: '12px', border: '1px dashed #e5e7eb' }}>
                                        No individual members assigned yet. Use the dropdown above to assign team members.
                                    </div>
                                ) : (
                                    (detailProject.members || []).map((member) => (
                                        <div
                                            key={member.id}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '8px 12px',
                                                background: '#f9fafb',
                                                borderRadius: '6px',
                                                border: '1px solid #e5e7eb',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div
                                                    style={{
                                                        width: '28px',
                                                        height: '28px',
                                                        borderRadius: '50%',
                                                        background: '#3b82f6',
                                                        color: '#fff',
                                                        display: 'grid',
                                                        placeItems: 'center',
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {member.name ? member.name.charAt(0).toUpperCase() : 'U'}
                                                </div>
                                                <div>
                                                    <strong style={{ fontSize: '12px', color: '#111827', display: 'block' }}>{member.name}</strong>
                                                    <small style={{ fontSize: '11px', color: '#6b7280' }}>{member.email || member.role || 'Member'}</small>
                                                </div>
                                            </div>

                                            {canManageProjects && (
                                                <button
                                                    id={`remove-project-member-${member.id}`}
                                                    type="button"
                                                    onClick={() => handleRemoveMemberFromDetailProject(member.id)}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: '#dc2626',
                                                        fontSize: '11px',
                                                        cursor: 'pointer',
                                                        fontWeight: 600,
                                                    }}
                                                    title="Remove member from this project"
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Modal Footer Actions */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                            <button
                                id="modal-open-tasks-btn"
                                type="button"
                                className="primary-button"
                                onClick={() => {
                                    setDetailProject(null)
                                    navigateToTasks(detailProject.name)
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <span>📋</span> Open in Signboard ➔
                            </button>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                {canManageProjects && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingProject(detailProject)
                                            setDetailProject(null)
                                        }}
                                        style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '12px' }}
                                    >
                                        Edit Details
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setDetailProject(null)}
                                    style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#f3f4f6', cursor: 'pointer', fontSize: '12px' }}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 4: CONFIRM DELETE MODAL */}
            {projectToDelete && (
                <div
                    id="confirm-delete-project-modal"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1100,
                        padding: '16px',
                    }}
                    onClick={() => setProjectToDelete(null)}
                >
                    <div
                        style={{
                            background: '#fff',
                            borderRadius: '12px',
                            maxWidth: '440px',
                            width: '100%',
                            padding: '24px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                            textAlign: 'center',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '50%',
                                background: '#fee2e2',
                                color: '#dc2626',
                                display: 'grid',
                                placeItems: 'center',
                                fontSize: '20px',
                                margin: '0 auto 14px',
                            }}
                        >
                            ⚠️
                        </div>
                        <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: '#111827' }}>
                            Delete Project?
                        </h3>
                        <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#4b5563', lineHeight: '1.5' }}>
                            Are you sure you want to permanently delete <b>"{projectToDelete.name}"</b>?
                            All associated tasks, milestones, and member assignments will be removed.
                        </p>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button
                                id="cancel-delete-project-btn"
                                type="button"
                                onClick={() => setProjectToDelete(null)}
                                style={{
                                    padding: '8px 18px',
                                    borderRadius: '6px',
                                    border: '1px solid #d1d5db',
                                    background: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                id="confirm-delete-project-btn"
                                type="button"
                                onClick={confirmExecuteDeleteProject}
                                style={{
                                    padding: '8px 18px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: '#dc2626',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                }}
                            >
                                Yes, Delete Project
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}
