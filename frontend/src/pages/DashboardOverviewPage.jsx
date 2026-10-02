import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTask as createTaskRequest, getTasks, updateTaskStatus, updateTaskDetails, deleteTask } from '../services/taskService.js'
import { getSocket } from '../services/socketService.js'
import { getOrganizations, getOrganizationMembers } from '../services/organizationService.js'
import { getProjects } from '../services/projectService.js'
import { getCurrentUser } from '../services/authService.js'
import { isTaskAssignedToUser } from './TasksPage.jsx'
import '../App.css'

const columns = ['Todo', 'In progress', 'Review', 'Done']
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

export function normalizeStatus(status) {
    if (!status) return 'Todo'
    const s = String(status).trim().toUpperCase().replace(/[\s-]+/g, '_')
    if (s === 'TODO' || s === 'PLANNING' || s === 'BACKLOG') return 'Todo'
    if (s === 'IN_PROGRESS' || s === 'INPROGRESS' || s === 'ACTIVE') return 'In progress'
    if (s === 'IN_REVIEW' || s === 'INREVIEW' || s === 'REVIEW') return 'Review'
    if (s === 'DONE' || s === 'COMPLETED' || s === 'FINISHED') return 'Done'
    return status
}

export default function DashboardOverviewPage() {
    const navigate = useNavigate()
    const [tasks, setTasks] = useState(() => {
        try {
            const cached = JSON.parse(localStorage.getItem('workflowx_cached_tasks') || '[]')
            return Array.isArray(cached) ? cached.map((t) => ({ ...t, status: normalizeStatus(t.status) })) : []
        } catch {
            return []
        }
    })
    const [organizations, setOrganizations] = useState([])
    const [organizationId, setOrganizationId] = useState('')
    const [projects, setProjects] = useState([])
    const [members, setMembers] = useState([])
    const [currentUser, setCurrentUser] = useState(null)

    // Filters and Search
    const [filter, setFilter] = useState('All tasks')
    const [projectFilter, setProjectFilter] = useState('ALL')
    const [searchQuery, setSearchQuery] = useState('')
    const [onlyMyTasks, setOnlyMyTasks] = useState(false)

    // Modals
    const [showTaskForm, setShowTaskForm] = useState(false)
    const [activeTask, setActiveTask] = useState(null)
    const [isCreating, setIsCreating] = useState(false)

    // Form inputs for new task modal
    const [newTitle, setNewTitle] = useState('')
    const [newProject, setNewProject] = useState('General')
    const [newPriority, setNewPriority] = useState('High')
    const [newAssignee, setNewAssignee] = useState('')
    const [newDueDate, setNewDueDate] = useState('')

    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')

    // Drag and Drop state
    const [draggedTaskId, setDraggedTaskId] = useState(null)
    const [dragOverColumn, setDragOverColumn] = useState(null)

    // Initial Data Fetching
    useEffect(() => {
        setIsLoading(true)
        getCurrentUser().then(setCurrentUser).catch(() => null)

        getTasks()
            .then((loadedTasks) => {
                const list = Array.isArray(loadedTasks) ? loadedTasks : []
                setTasks(list.map((t) => ({ ...t, status: normalizeStatus(t.status) })))
            })
            .catch(() => setError('Unable to load tasks right now. Please refresh.'))
            .finally(() => setIsLoading(false))

        getOrganizations()
            .then(async (orgs) => {
                const orgList = Array.isArray(orgs) ? orgs : []
                setOrganizations(orgList)
                if (orgList.length > 0) {
                    const orgId = orgList[0].id
                    setOrganizationId(orgId)
                    try {
                        const [pList, mList] = await Promise.all([
                            getProjects(orgId).catch(() => []),
                            getOrganizationMembers(orgId).catch(() => []),
                        ])
                        const safeProjects = Array.isArray(pList) ? pList : []
                        const safeMembers = Array.isArray(mList) ? mList : []
                        setProjects(safeProjects)
                        setMembers(safeMembers)
                        if (safeProjects.length > 0) {
                            setNewProject(safeProjects[0].name)
                        }
                    } catch {
                        // fallback
                    }
                }
            })
            .catch(() => null)

        // Realtime Socket.IO synchronization
        const socket = getSocket()
        if (socket) {
            function handleTaskCreated(newTask) {
                if (!newTask) return
                const normalized = { ...newTask, status: normalizeStatus(newTask.status) }
                setTasks((prev) => [normalized, ...prev.filter((t) => t.id !== normalized.id)])
            }
            function handleTaskUpdated(updatedTask) {
                if (!updatedTask) return
                const normalized = { ...updatedTask, status: normalizeStatus(updatedTask.status) }
                setTasks((prev) => prev.map((t) => (t.id === normalized.id ? { ...t, ...normalized } : t)))
                if (activeTask && activeTask.id === normalized.id) {
                    setActiveTask((prev) => ({ ...prev, ...normalized }))
                }
            }
            function handleTaskDeleted(payload) {
                const delId = payload?.id || payload?.taskId
                setTasks((prev) => prev.filter((t) => t.id !== delId && String(t.id) !== String(delId)))
                if (activeTask && (activeTask.id === delId || String(activeTask.id) === String(delId))) {
                    setActiveTask(null)
                }
            }

            socket.on('task:created', handleTaskCreated)
            socket.on('task:updated', handleTaskUpdated)
            socket.on('task:deleted', handleTaskDeleted)

            return () => {
                socket.off('task:created', handleTaskCreated)
                socket.off('task:updated', handleTaskUpdated)
                socket.off('task:deleted', handleTaskDeleted)
            }
        }
    }, [activeTask])

    const activeOrg = organizations.find((o) => o.id === organizationId) || organizations[0]
    const currentMembership = useMemo(() => {
        if (!currentUser || !members) return null
        return members.find((m) => m.email === currentUser.email || m.userId === currentUser.id)
    }, [currentUser, members])
    const storedRole = (typeof window !== 'undefined' ? localStorage.getItem('workflowx_registered_role') || '' : '').toUpperCase()
    const userRole = (currentMembership?.role || activeOrg?.role || currentUser?.role || storedRole || 'MEMBER').toUpperCase()
    const isManager = userRole === 'MANAGER' || userRole === 'ADMIN'
    const isDeveloper = !isManager
    const canCreateDirectTask = isManager

    // Filtered tasks memo
    const visibleTasks = useMemo(() => {
        return tasks.filter((task) => {
            if (task.isSuggestion && task.approvalStatus === 'PENDING') return false
            if (task.approvalStatus === 'REJECTED') return false

            // Strict Privacy: Developers only see tasks assigned to them
            if (isDeveloper && !isTaskAssignedToUser(task, currentUser)) {
                return false
            }

            const taskStatus = normalizeStatus(task.status)
            const matchesStatus = filter === 'All tasks' || taskStatus === normalizeStatus(filter)
            const matchesProject = projectFilter === 'ALL' || (task.project || '').toLowerCase().includes(projectFilter.toLowerCase())
            const matchesSearch = !searchQuery.trim() || (task.title || '').toLowerCase().includes(searchQuery.toLowerCase().trim()) || (task.assignee || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
            const matchesOnlyMy = !onlyMyTasks || isTaskAssignedToUser(task, currentUser)

            return matchesStatus && matchesProject && matchesSearch && matchesOnlyMy
        })
    }, [filter, projectFilter, searchQuery, onlyMyTasks, currentUser, tasks, isDeveloper])

    // Statistics memo
    const baseTasks = useMemo(() => {
        if (isDeveloper) {
            return tasks.filter((t) => isTaskAssignedToUser(t, currentUser) && (!t.isSuggestion || t.approvalStatus === 'APPROVED') && t.approvalStatus !== 'REJECTED')
        }
        return tasks.filter((t) => (!t.isSuggestion || t.approvalStatus === 'APPROVED') && t.approvalStatus !== 'REJECTED')
    }, [tasks, isDeveloper, currentUser])

    const myAssignedTasksCount = useMemo(
        () => tasks.filter((t) => isTaskAssignedToUser(t, currentUser) && (!t.isSuggestion || t.approvalStatus === 'APPROVED')).length,
        [tasks, currentUser]
    )
    const completedTasksCount = useMemo(
        () => baseTasks.filter((t) => normalizeStatus(t.status) === 'Done').length,
        [baseTasks]
    )
    const inProgressTasksCount = useMemo(
        () => baseTasks.filter((t) => normalizeStatus(t.status) === 'In progress').length,
        [baseTasks]
    )
    const openTasksCount = useMemo(
        () => baseTasks.filter((t) => normalizeStatus(t.status) !== 'Done').length,
        [baseTasks]
    )
    const completionRate = useMemo(() => {
        return baseTasks.length > 0 ? Math.round((completedTasksCount / baseTasks.length) * 100) : 0
    }, [baseTasks, completedTasksCount])

    // HTML5 Drag-and-Drop Drop Handler
    async function handleDropOnColumn(targetColumn) {
        if (!draggedTaskId) return
        const currentTask = tasks.find((t) => t.id === draggedTaskId)
        if (!currentTask || currentTask.status === targetColumn) {
            setDraggedTaskId(null)
            setDragOverColumn(null)
            return
        }

        // Optimistic UI update
        setTasks((prev) =>
            prev.map((t) => (t.id === draggedTaskId ? { ...t, status: targetColumn } : t))
        )
        if (activeTask && activeTask.id === draggedTaskId) {
            setActiveTask((prev) => ({ ...prev, status: targetColumn }))
        }

        const taskId = draggedTaskId
        setDraggedTaskId(null)
        setDragOverColumn(null)
        setSuccessMessage(`Moved "${currentTask.title}" to ${targetColumn}.`)

        try {
            await updateTaskStatus(taskId, targetColumn)
        } catch {
            // Rollback on failure
            setTasks((prev) =>
                prev.map((t) => (t.id === taskId ? { ...t, status: currentTask.status } : t))
            )
        }
    }

    // Quick status change helper
    async function handleStatusChange(taskId, nextStatus) {
        setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t))
        )
        if (activeTask && activeTask.id === taskId) {
            setActiveTask((prev) => ({ ...prev, status: nextStatus }))
        }
        setSuccessMessage(`Task updated to ${nextStatus}.`)
        try {
            await updateTaskStatus(taskId, nextStatus)
        } catch {
            // silent rollback
        }
    }

    // Delete task handler
    async function handleDeleteTask(taskId, e) {
        if (e) e.stopPropagation()
        const target = tasks.find((t) => t.id === taskId || String(t.id) === String(taskId))
        if (!window.confirm(`Delete "${target?.title || 'this task'}" permanently?`)) return
        try {
            await deleteTask(taskId)
            setTasks((prev) => {
                const next = prev.filter((t) => t.id !== taskId && String(t.id) !== String(taskId))
                try {
                    localStorage.setItem('workflowx_cached_tasks', JSON.stringify(next))
                } catch {
                    // ignore
                }
                return next
            })
            if (activeTask && (activeTask.id === taskId || String(activeTask.id) === String(taskId))) {
                setActiveTask(null)
            }
            setSuccessMessage('Task deleted successfully.')
        } catch (err) {
            setError(err.message || 'Failed to delete task')
        }
    }

    // Create Task Handler
    async function handleCreateTask(e) {
        e.preventDefault()
        if (!newTitle.trim()) return
        setIsCreating(true)
        setError('')
        try {
            const task = await createTaskRequest({
                title: newTitle.trim(),
                priority: newPriority,
                project: newProject || 'General',
                assignee: newAssignee || 'Unassigned',
                due: newDueDate ? new Date(newDueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Next week',
                status: 'Todo',
            })
            const normalized = { ...task, status: normalizeStatus(task.status) }
            setTasks((currentTasks) => {
                const updated = [normalized, ...currentTasks.filter((t) => t.id !== normalized.id && String(t.id) !== String(normalized.id))]
                try {
                    localStorage.setItem('workflowx_cached_tasks', JSON.stringify(updated))
                } catch {
                    // ignore
                }
                return updated
            })
            setShowTaskForm(false)
            setNewTitle('')
            setNewDueDate('')
            setSuccessMessage(`✓ Task "${task.title}" created successfully!`)
        } catch (err) {
            setError(err.message || 'Failed to create task. Please try again.')
        } finally {
            setIsCreating(false)
        }
    }

    const nextStatusMap = {
        'Todo': 'In progress',
        'In progress': 'Review',
        'Review': 'Done',
    }

    const greetingName = currentUser?.name || currentUser?.email?.split('@')[0] || 'Team'

    return (
        <main className="feature-page">
            {/* Header: Personalized Greeting & Primary Action */}
            <section className="page-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <p className="eyebrow" style={{ margin: 0 }}>Command Center</p>
                        <span style={{ fontSize: '10px', background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                            {userRole}
                        </span>
                    </div>
                    <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 6px', color: '#0f172a' }}>
                        Good day, {greetingName} <span className="wave">✦</span>
                    </h1>
                    <p className="heading-subtitle" style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
                        Here is what is happening across your workspace initiatives today.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                        className="secondary-button"
                        onClick={() => navigate('/tasks?filter=mine')}
                        style={{ padding: '9px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <span>📋</span> My Tasks ({myAssignedTasksCount})
                    </button>
                    {canCreateDirectTask ? (
                        <button
                            className="primary-button"
                            onClick={() => setShowTaskForm(true)}
                            style={{ padding: '9px 18px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <span>+</span> New Task
                        </button>
                    ) : (
                        <button
                            className="primary-button"
                            onClick={() => navigate('/tasks')}
                            style={{ padding: '9px 18px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', background: '#2563eb' }}
                        >
                            <span>💡</span> Propose Task
                        </button>
                    )}
                </div>
            </section>

            {/* Notification & Alerts */}
            {error && <p className="service-error" role="alert" style={{ marginBottom: '16px' }}>{error}</p>}
            {successMessage && (
                <p className="service-success" role="status" style={{ color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>✓ {successMessage}</span>
                    <button type="button" onClick={() => setSuccessMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15803d', fontSize: '14px' }}>✕</button>
                </p>
            )}

            {/* Interactive Stats Grid with Click-Through Routing */}
            <section className="stats-grid" aria-label="Workspace statistics" style={{ marginBottom: '18px' }}>
                <div
                    className="stat-card"
                    style={{
                        cursor: isDeveloper ? 'default' : 'pointer',
                        transition: 'all 0.2s ease',
                        border: (isDeveloper || onlyMyTasks) ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: (isDeveloper || onlyMyTasks) ? '#eff6ff' : '#fff',
                        boxShadow: (isDeveloper || onlyMyTasks) ? '0 8px 16px -4px rgba(37, 99, 235, 0.2)' : '0 1px 3px rgba(0,0,0,0.05)',
                    }}
                    onClick={() => { if (!isDeveloper) setOnlyMyTasks(!onlyMyTasks) }}
                    title={isDeveloper ? "Tasks assigned to you" : "Click to toggle board filter for tasks assigned to you"}
                >
                    <span className="stat-icon purple" style={{ background: '#ede9fe', color: '#6d28d9' }}>🎯</span>
                    <div>
                        <p style={{ color: '#6d28d9' }}>Assigned to Me</p>
                        <strong style={{ color: '#6d28d9' }}>{myAssignedTasksCount}</strong>
                        <small className="neutral" style={{ color: '#7c3aed' }}>
                            {isDeveloper ? 'Your active board scope' : (onlyMyTasks ? '✓ Showing My Tasks' : 'Click to filter board ➔')}
                        </small>
                    </div>
                </div>

                <div
                    className="stat-card"
                    style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                    onClick={() => navigate('/projects')}
                    title="Click to view all projects"
                >
                    <span className="stat-icon coral">▣</span>
                    <div>
                        <p>Active projects</p>
                        <strong>{projects.length}</strong>
                        <small className="neutral">
                            {projects.length === 1 ? '1 active initiative' : `${projects.length} active initiatives`} ➔
                        </small>
                    </div>
                </div>

                <div
                    className="stat-card"
                    style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                    onClick={() => navigate('/tasks?status=Done')}
                    title="Click to filter completed tasks on Signboard"
                >
                    <span className="stat-icon yellow" style={{ background: '#d1fae5', color: '#059669' }}>✓</span>
                    <div>
                        <p style={{ color: '#047857' }}>Tasks completed</p>
                        <strong style={{ color: '#047857' }}>{completedTasksCount}</strong>
                        <small className={completedTasksCount > 0 ? 'positive' : 'neutral'}>
                            {tasks.length > 0 ? `${completionRate}% delivered ➔` : '0 completed ➔'}
                        </small>
                    </div>
                </div>

                <div
                    className="stat-card"
                    style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                    onClick={() => navigate('/tasks?status=In progress')}
                    title="Click to view in-progress tasks"
                >
                    <span className="stat-icon blue" style={{ background: '#fef3c7', color: '#d97706' }}>⚡</span>
                    <div>
                        <p style={{ color: '#b45309' }}>In Progress</p>
                        <strong>{inProgressTasksCount}</strong>
                        <small className="neutral" style={{ color: '#d97706' }}>
                            {inProgressTasksCount === 1 ? '1 active in sprint ➔' : `${inProgressTasksCount} active in sprint ➔`}
                        </small>
                    </div>
                </div>

                <div
                    className="stat-card"
                    style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                    onClick={() => navigate('/members')}
                    title="Click to manage team members and roles"
                >
                    <span className="stat-icon green">👥</span>
                    <div>
                        <p>Team members</p>
                        <strong>{members.length}</strong>
                        <small className="neutral">
                            {members.length === 1 ? '1 active member ➔' : `${members.length} active members ➔`}
                        </small>
                    </div>
                </div>
            </section>

            {/* Sprint Completion Progress Bar */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '220px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#1e293b' }}>
                        Workspace Sprint Progress:
                    </span>
                    <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                            style={{
                                width: `${completionRate}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                                borderRadius: '4px',
                                transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                            }}
                        />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#059669', minWidth: '38px', textAlign: 'right' }}>
                        {completionRate}%
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '12px', color: '#64748b' }}>
                    <span>Total Tasks: <b>{tasks.length}</b></span>
                    <span>Remaining: <b>{openTasksCount}</b></span>
                    <button
                        type="button"
                        onClick={() => navigate('/analytics')}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: '12px', cursor: 'pointer', padding: 0 }}
                    >
                        View Burndown ➔
                    </button>
                </div>
            </div>

            {/* Quick Workspace Navigation Launchpad */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 16px', marginBottom: '22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    🚀 Quick Launchpad:
                </span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        type="button"
                        onClick={() => navigate('/tasks')}
                        style={{ padding: '5px 11px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#1e293b', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        <span>📋</span> Signboard
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/projects')}
                        style={{ padding: '5px 11px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#1e293b', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        <span>📁</span> Projects
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/teams')}
                        style={{ padding: '5px 11px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#1e293b', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        <span>👥</span> Teams
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/members')}
                        style={{ padding: '5px 11px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#1e293b', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        <span>🏢</span> Directory
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/analytics')}
                        style={{ padding: '5px 11px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#1e293b', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        <span>📊</span> Analytics
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/notifications')}
                        style={{ padding: '5px 11px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#1e293b', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        <span>🔔</span> Alerts
                    </button>
                </div>
            </div>

            {/* Main Content Grid: Workspace Tasks & Recent Activity */}
            <section className="workspace-grid">
                <div className="board-panel panel" style={{ borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                    <div className="panel-heading" style={{ paddingBottom: '14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Workspace Tasks</h2>
                            <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                                Drag cards across columns to update workflow status or quick-advance.
                            </p>
                        </div>
                        <button
                            className="text-button"
                            onClick={() => navigate('/tasks')}
                            style={{ fontSize: '12.5px', fontWeight: 700, color: '#ee785e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                        >
                            Open Full Signboard <span>→</span>
                        </button>
                    </div>

                    {/* Toolbar: Status Filter Tabs, Search & Project Filter */}
                    <div className="task-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', margin: '14px 0 16px' }}>
                        <div className="filter-tabs">
                            {['All tasks', 'Todo', 'In progress', 'Review', 'Done'].map((item) => (
                                <button
                                    key={item}
                                    className={filter === item ? 'selected' : ''}
                                    onClick={() => setFilter(item)}
                                >
                                    {item}
                                </button>
                            ))}
                            {isDeveloper ? (
                                <div
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        borderRadius: '6px',
                                        border: '1px solid #bfdbfe',
                                        background: '#eff6ff',
                                        color: '#1d4ed8',
                                        fontWeight: 700,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                    }}
                                    title="Your overview is scoped exclusively to tasks assigned to you"
                                >
                                    <span>🎯</span> Assigned to You ({baseTasks.length})
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    className={onlyMyTasks ? 'selected' : ''}
                                    onClick={() => setOnlyMyTasks(!onlyMyTasks)}
                                    style={{
                                        border: onlyMyTasks ? '1px solid #2563eb' : '1px solid #cbd5e1',
                                        background: onlyMyTasks ? '#eff6ff' : '#fff',
                                        color: onlyMyTasks ? '#1d4ed8' : '#374151',
                                        fontWeight: onlyMyTasks ? 700 : '500',
                                    }}
                                >
                                    👤 {onlyMyTasks ? `✓ My Tasks (${myAssignedTasksCount})` : `My Tasks (${myAssignedTasksCount})`}
                                </button>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {/* Search Input */}
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <span style={{ position: 'absolute', left: '8px', fontSize: '12px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search tasks..."
                                    style={{ padding: '6px 24px 6px 26px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', width: '160px', outline: 'none' }}
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        style={{ position: 'absolute', right: '6px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '11px', padding: 0 }}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            {/* Project Filter */}
                            <select
                                value={projectFilter}
                                onChange={(e) => setProjectFilter(e.target.value)}
                                style={{ padding: '6px 10px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
                            >
                                <option value="ALL">All Projects</option>
                                {projects.map((p) => (
                                    <option key={p.id || p.name} value={p.name}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {isLoading && <p className="loading-state">Loading workspace tasks...</p>}

                    {/* Interactive Drag & Drop Columns */}
                    <div className="kanban" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: '12px', alignItems: 'start' }}>
                        {columns.map((column) => {
                            const colTasks = visibleTasks.filter((task) => normalizeStatus(task.status) === column)
                            const isDragOver = dragOverColumn === column

                            return (
                                <div
                                    key={column}
                                    className={`kanban-column ${isDragOver ? 'drag-over' : ''}`}
                                    onDragOver={(e) => {
                                        e.preventDefault()
                                        if (dragOverColumn !== column) setDragOverColumn(column)
                                    }}
                                    onDragLeave={() => {
                                        if (dragOverColumn === column) setDragOverColumn(null)
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault()
                                        handleDropOnColumn(column)
                                    }}
                                    style={{
                                        background: isDragOver ? 'rgba(238, 120, 94, 0.08)' : '#f8fafc',
                                        border: isDragOver ? '2px dashed #ee785e' : '1px solid #e2e8f0',
                                        borderRadius: '10px',
                                        transition: 'all 0.2s ease',
                                        padding: '10px',
                                        minHeight: '340px',
                                    }}
                                >
                                    <div className="column-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <span style={{ fontWeight: 700, fontSize: '12px', color: '#334155' }}>
                                            {column === 'Todo' ? '◌ TODO' : column === 'In progress' ? '⚡ IN PROGRESS' : column === 'Review' ? '◎ IN REVIEW' : '✓ DONE'}
                                        </span>
                                        <b style={{ background: '#e2e8f0', color: '#475569', padding: '1px 6px', borderRadius: '10px', fontSize: '11px' }}>
                                            {colTasks.length}
                                        </b>
                                    </div>

                                    {colTasks.map((task) => {
                                        const isDragging = draggedTaskId === task.id
                                        const priority = (task.priority || 'medium').toLowerCase()
                                        const nextStatus = nextStatusMap[task.status]

                                        return (
                                            <article
                                                key={task.id}
                                                draggable
                                                onDragStart={() => setDraggedTaskId(task.id)}
                                                onDragEnd={() => {
                                                    setDraggedTaskId(null)
                                                    setDragOverColumn(null)
                                                }}
                                                onClick={() => setActiveTask(task)}
                                                className={`task-card ${isDragging ? 'is-dragging' : ''}`}
                                                style={{
                                                    cursor: 'grab',
                                                    opacity: isDragging ? 0.4 : 1,
                                                    background: '#ffffff',
                                                    border: '1px solid #e2e8f0',
                                                    borderRadius: '8px',
                                                    padding: '10px 12px',
                                                    marginBottom: '8px',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                                    transition: 'all 0.15s ease',
                                                }}
                                                title="Click to view details or drag across columns"
                                            >
                                                <div className="task-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                    <span className={`priority ${priority}`} style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px' }}>
                                                        {task.priority || 'Medium'}
                                                    </span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {canCreateDirectTask && (
                                                            <button
                                                                type="button"
                                                                className="card-quick-delete"
                                                                onClick={(e) => handleDeleteTask(task.id, e)}
                                                                title="Delete task"
                                                                style={{
                                                                    background: 'transparent',
                                                                    border: 'none',
                                                                    color: '#94a3b8',
                                                                    cursor: 'pointer',
                                                                    fontSize: '13px',
                                                                    lineHeight: 1,
                                                                    padding: '2px 4px',
                                                                    borderRadius: '4px',
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                    e.currentTarget.style.color = '#ef4444'
                                                                    e.currentTarget.style.background = '#fef2f2'
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    e.currentTarget.style.color = '#94a3b8'
                                                                    e.currentTarget.style.background = 'transparent'
                                                                }}
                                                            >
                                                                ✕
                                                            </button>
                                                        )}
                                                        <span style={{ fontSize: '11px', color: '#94a3b8', cursor: 'grab' }}>⠿</span>
                                                    </div>
                                                </div>

                                                <h3 style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 600, color: '#0f172a', lineHeight: '1.35' }}>
                                                    {task.title}
                                                </h3>

                                                <p className="task-project" style={{ margin: '0 0 8px', fontSize: '11px', color: '#64748b' }}>
                                                    📁 {task.project || 'General'}
                                                </p>

                                                <div className="task-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid #f1f5f9', fontSize: '10.5px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        <span className="mini-avatar" style={{ fontSize: '9.5px', padding: '2px 5px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '4px', fontWeight: 700 }}>
                                                            {task.assignee ? task.assignee.slice(0, 2).toUpperCase() : 'ME'}
                                                        </span>
                                                        <span style={{ color: '#94a3b8' }}>{task.due || 'Next week'}</span>
                                                    </div>

                                                    {nextStatus && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handleStatusChange(task.id, nextStatus)
                                                            }}
                                                            style={{
                                                                background: '#f8fafc',
                                                                border: '1px solid #e2e8f0',
                                                                borderRadius: '4px',
                                                                padding: '1px 5px',
                                                                fontSize: '10px',
                                                                cursor: 'pointer',
                                                                color: '#475569',
                                                                fontWeight: 600,
                                                            }}
                                                            title={`Advance to ${nextStatus}`}
                                                        >
                                                            ➔
                                                        </button>
                                                    )}
                                                </div>
                                            </article>
                                        )
                                    })}

                                    {!isLoading && colTasks.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '28px 10px', color: '#94a3b8', border: '1px dashed #cbd5e1', borderRadius: '8px', fontSize: '11.5px' }}>
                                            Drop {column.toLowerCase()} tasks here
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Sidebar Panel: Live Recent Activity Feed */}
                <aside className="activity-panel panel" style={{ borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                    <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>Recent Activity</h2>
                            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>Latest updates from your team.</p>
                        </div>
                        <button
                            type="button"
                            className="icon-button"
                            onClick={() => navigate('/analytics')}
                            title="View Analytics"
                            style={{ cursor: 'pointer' }}
                        >
                            📊
                        </button>
                    </div>

                    <div className="activity-list" style={{ marginTop: '12px' }}>
                        {tasks.length > 0 ? (
                            tasks.slice(0, 5).map((task) => (
                                <div
                                    key={task.id}
                                    className="activity-item"
                                    style={{ cursor: 'pointer', padding: '10px 12px', borderRadius: '8px', transition: 'background 0.15s ease' }}
                                    onClick={() => setActiveTask(task)}
                                    title="Click to view task details"
                                >
                                    <span className="activity-avatar coral-bg" style={{ fontSize: '10.5px', fontWeight: 700 }}>
                                        {task.assignee ? task.assignee.slice(0, 2).toUpperCase() : 'TK'}
                                    </span>
                                    <p style={{ margin: 0, fontSize: '12px', lineHeight: '1.4' }}>
                                        <strong>{task.assignee || 'Member'}</strong> updated <b>{task.title}</b> to{' '}
                                        <span style={{ fontWeight: 600, color: task.status === 'Done' ? '#059669' : '#2563eb' }}>
                                            {task.status}
                                        </span>
                                        <small style={{ display: 'block', color: '#94a3b8', fontSize: '10.5px', marginTop: '2px' }}>
                                            Project: {task.project || 'General'} • Due: {task.due || 'Next week'}
                                        </small>
                                    </p>
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#6b7280' }}>
                                <p style={{ fontSize: '13px', margin: 0, fontWeight: 600 }}>No recent activity yet</p>
                                <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>Updates will appear here as your team creates and manages tasks.</p>
                            </div>
                        )}
                    </div>

                    <button
                        className="activity-footer"
                        onClick={() => navigate('/analytics')}
                        style={{ width: '100%', marginTop: '14px', padding: '10px', fontSize: '12px', fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', cursor: 'pointer' }}
                    >
                        View Full Activity & Analytics <span>→</span>
                    </button>
                </aside>
            </section>

            {/* Quick Task Detail Modal (From Overview Page) */}
            {activeTask && (
                <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setActiveTask(null)}>
                    <div className="task-form" style={{ width: 'min(100%, 540px)' }}>
                        <div className="modal-heading" style={{ marginBottom: '14px' }}>
                            <div>
                                <span className={`priority ${(activeTask.priority || 'medium').toLowerCase()}`} style={{ fontSize: '9px', padding: '2px 8px', borderRadius: '4px' }}>
                                    {activeTask.priority || 'Medium'} Priority
                                </span>
                                <h2 style={{ margin: '6px 0 0', fontSize: '18px' }}>{activeTask.title}</h2>
                                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                                    Project: <b>{activeTask.project || 'General'}</b> • Assignee: <b>{activeTask.assignee || 'Unassigned'}</b>
                                </p>
                            </div>
                            <button type="button" className="close-button" onClick={() => setActiveTask(null)}>×</button>
                        </div>

                        {/* Status advancement buttons */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                            <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: '8px', letterSpacing: '0.5px' }}>
                                Change Execution Stage
                            </strong>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {columns.map((st) => (
                                    <button
                                        key={st}
                                        type="button"
                                        onClick={() => handleStatusChange(activeTask.id, st)}
                                        style={{
                                            padding: '6px 12px',
                                            fontSize: '11.5px',
                                            fontWeight: activeTask.status === st ? '700' : '500',
                                            background: activeTask.status === st ? '#ee785e' : '#ffffff',
                                            color: activeTask.status === st ? '#ffffff' : '#374151',
                                            border: activeTask.status === st ? '1px solid #ee785e' : '1px solid #cbd5e1',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {st === 'Done' ? '✓ DONE' : st === 'Review' ? '◎ REVIEW' : st === 'In progress' ? '⚡ IN PROGRESS' : '◌ TODO'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="form-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {canCreateDirectTask ? (
                                <button
                                    type="button"
                                    onClick={(e) => handleDeleteTask(activeTask.id, e)}
                                    style={{ padding: '6px 12px', fontSize: '11.5px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                >
                                    🗑 Delete Task
                                </button>
                            ) : <div />}
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => navigate(`/tasks?taskId=${activeTask.id}`)}
                                    className="primary-button"
                                    style={{ padding: '6px 14px', fontSize: '11.5px' }}
                                >
                                    Open Full Task Details ➔
                                </button>
                                <button type="button" className="secondary-button" onClick={() => setActiveTask(null)}>
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Full-Featured Task Creation */}
            {showTaskForm && (
                <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowTaskForm(false)}>
                    <form className="task-form" onSubmit={handleCreateTask} style={{ width: 'min(100%, 520px)' }}>
                        <div className="modal-heading">
                            <div>
                                <p className="eyebrow" style={{ color: '#ee785e' }}>Quick Add</p>
                                <h2 style={{ margin: '4px 0 0', fontSize: '18px' }}>Create New Task</h2>
                            </div>
                            <button type="button" className="close-button" onClick={() => setShowTaskForm(false)} aria-label="Close">×</button>
                        </div>

                        <div className="task-field-group" style={{ marginBottom: '14px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                Task Title <span style={{ color: '#ee785e' }}>*</span>
                            </label>
                            <input
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                required
                                placeholder="e.g. Set up OAuth2 Authentication"
                                autoFocus
                                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                            <div className="task-field-group">
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                    Project Workspace
                                </label>
                                <select
                                    value={newProject}
                                    onChange={(e) => setNewProject(e.target.value)}
                                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                                >
                                    <option value="General">General Workspace</option>
                                    {projects.map((p) => (
                                        <option key={p.id || p.name} value={p.name}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="task-field-group">
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                    Priority Level
                                </label>
                                <select
                                    value={newPriority}
                                    onChange={(e) => setNewPriority(e.target.value)}
                                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                                >
                                    {PRIORITIES.map((p) => (
                                        <option key={p} value={p}>
                                            {p === 'Critical' ? '🔥 Critical' : p === 'High' ? '⚡ High' : p === 'Medium' ? '● Medium' : '○ Low'}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '18px' }}>
                            <div className="task-field-group">
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                    Assignee
                                </label>
                                <select
                                    value={newAssignee}
                                    onChange={(e) => setNewAssignee(e.target.value)}
                                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                                >
                                    <option value="">-- Unassigned --</option>
                                    {currentUser && !members.some((m) => m.email === currentUser.email) && (
                                        <option value={currentUser.email}>
                                            {currentUser.name || currentUser.email} (Me • {currentUser.email})
                                        </option>
                                    )}
                                    {members.map((m) => (
                                        <option key={m.userId || m.id || m.email} value={m.email || m.name}>
                                            {m.name || m.email} ({m.role || 'Member'} • {m.email})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="task-field-group">
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                    Due Date
                                </label>
                                <input
                                    type="date"
                                    value={newDueDate}
                                    min={new Date().toISOString().split('T')[0]}
                                    onChange={(e) => setNewDueDate(e.target.value)}
                                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                                />
                            </div>
                        </div>

                        <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button type="button" className="secondary-button" onClick={() => setShowTaskForm(false)}>
                                Cancel
                            </button>
                            <button className="primary-button" type="submit" disabled={isCreating}>
                                {isCreating ? 'Creating Task...' : '✓ Create Task'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </main>
    )
}
