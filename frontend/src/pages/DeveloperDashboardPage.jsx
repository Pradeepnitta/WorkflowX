import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getOrganizations, getOrganizationMembers } from '../services/organizationService.js'
import { getCurrentUser } from '../services/authService.js'
import { getNotifications } from '../services/notificationService.js'
import {
    createProjectTaskComment,
    getProjectTaskAttachments,
    getProjectTaskComments,
    getProjectTaskReviews,
    getProjectTasks,
    getProjects,
    deleteProjectTaskComment,
    submitProjectTaskForReview,
    updateProjectTaskComment,
    updateProjectTask,
} from '../services/projectService.js'
import { getSocket } from '../services/socketService.js'
import { getTeams } from '../services/teamService.js'
import '../App.css'
import './DeveloperDashboardPage.css'

const TASK_COLUMNS = [
    { status: 'TODO', label: 'To Do' },
    { status: 'IN_PROGRESS', label: 'In Progress' },
    { status: 'IN_REVIEW', label: 'Under Review' },
    { status: 'COMPLETED', label: 'Completed' },
]

function formatDate(value) {
    if (!value) return 'No deadline'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'No deadline' : date.toLocaleDateString()
}

function isOverdue(task) {
    if (!task.dueDate || task.status === 'COMPLETED') return false
    const deadline = new Date(task.dueDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return !Number.isNaN(deadline.getTime()) && deadline < today
}

function statusLabel(status) {
    return TASK_COLUMNS.find((column) => column.status === status)?.label || String(status || '').replaceAll('_', ' ')
}

function priorityLabel(priority) {
    const normalized = String(priority || '').toUpperCase()
    if (normalized === 'URGENT' || normalized === 'CRITICAL') return 'Critical'
    return normalized ? `${normalized[0]}${normalized.slice(1).toLowerCase()}` : 'Medium'
}

async function fetchDeveloperWorkspace(organizationId) {
    const [projectsResult, teamsResult, membersResult, notificationsResult] = await Promise.allSettled([
        getProjects(organizationId),
        getTeams(organizationId),
        getOrganizationMembers(organizationId),
        getNotifications(),
    ])
    if (projectsResult.status === 'rejected') throw projectsResult.reason

    const projects = (Array.isArray(projectsResult.value) ? projectsResult.value : [])
        .filter((project) => project.isMember)
    const taskResults = await Promise.allSettled(projects.map((project) => getProjectTasks(project.id)))
    const tasks = taskResults.flatMap((result, index) => {
        if (result.status !== 'fulfilled') return []
        const project = projects[index]
        return (Array.isArray(result.value) ? result.value : []).map((task) => ({
            ...task,
            projectName: project.name,
        }))
    })
    const errors = [
        [teamsResult, 'Unable to load your teams.'],
        [membersResult, 'Unable to load workspace members.'],
        [notificationsResult, 'Unable to load recent notifications.'],
        ...taskResults.map((result) => [result, 'Unable to load tasks for one of your projects.']),
    ]
        .filter(([result]) => result.status === 'rejected')
        .map(([result, fallback]) => `${fallback} ${result.reason?.message || ''}`.trim())

    return {
        projects,
        teams: teamsResult.status === 'fulfilled' && Array.isArray(teamsResult.value) ? teamsResult.value : [],
        members: membersResult.status === 'fulfilled' && Array.isArray(membersResult.value) ? membersResult.value : [],
        tasks,
        notifications: notificationsResult.status === 'fulfilled'
            ? Array.isArray(notificationsResult.value)
                ? notificationsResult.value
                : Array.isArray(notificationsResult.value?.data) ? notificationsResult.value.data : []
            : [],
        errors,
    }
}

export default function DeveloperDashboardPage({ view = 'overview' }) {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const requestedTaskId = searchParams.get('taskId')
    const [organizations, setOrganizations] = useState([])
    const [organizationId, setOrganizationId] = useState('')
    const [user, setUser] = useState(null)
    const [projects, setProjects] = useState([])
    const [teams, setTeams] = useState([])
    const [members, setMembers] = useState([])
    const [tasks, setTasks] = useState([])
    const [notifications, setNotifications] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selectedTask, setSelectedTask] = useState(null)
    const [detailsLoading, setDetailsLoading] = useState(false)
    const [comments, setComments] = useState([])
    const [attachments, setAttachments] = useState([])
    const [reviewHistory, setReviewHistory] = useState([])
    const [commentDraft, setCommentDraft] = useState('')
    const [editingCommentId, setEditingCommentId] = useState(null)
    const [commentEditDraft, setCommentEditDraft] = useState('')
    const [progressDraft, setProgressDraft] = useState(0)
    const [submissionDetails, setSubmissionDetails] = useState('')
    const [savingAction, setSavingAction] = useState(false)
    const [taskSearch, setTaskSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('ALL')
    const [priorityFilter, setPriorityFilter] = useState('ALL')
    const [dueDateSort, setDueDateSort] = useState('ASC')
    const [taskLayout] = useState(() => localStorage.getItem('workflowx_default_view') === 'list' ? 'list' : 'kanban')
    const [calendarViewUnavailable] = useState(() => localStorage.getItem('workflowx_default_view') === 'calendar')

    useEffect(() => {
        let current = true
        Promise.all([getOrganizations(), getCurrentUser()])
            .then(([loadedOrganizations, currentUser]) => {
                if (!current) return
                const developerOrganizations = (Array.isArray(loadedOrganizations) ? loadedOrganizations : [])
                    .filter((organization) => String(organization.role || '').toUpperCase() === 'MEMBER')
                setOrganizations(developerOrganizations)
                setUser(currentUser)
                if (developerOrganizations.length > 0) {
                    setOrganizationId(developerOrganizations[0].id)
                } else {
                    setLoading(false)
                }
            })
            .catch((requestError) => {
                if (current) {
                    setError(requestError.message || 'Unable to load your account.')
                    setLoading(false)
                }
            })
        return () => {
            current = false
        }
    }, [])

    useEffect(() => {
        if (!organizationId) return
        let current = true
        fetchDeveloperWorkspace(organizationId)
            .then((data) => {
                if (!current) return
                setProjects(data.projects)
                setTeams(data.teams)
                setMembers(data.members)
                setTasks(data.tasks)
                setNotifications(data.notifications)
                setError(data.errors.join(' '))
            })
            .catch((requestError) => {
                if (current) setError(requestError.message || 'Unable to load your developer workspace.')
            })
            .finally(() => {
                if (current) setLoading(false)
            })
        return () => {
            current = false
        }
    }, [organizationId])

    const activeOrganization = organizations.find((organization) => organization.id === organizationId)
    const assignedTasks = useMemo(
        () => tasks.filter((task) => String(task.assigneeId) === String(user?.id)),
        [tasks, user?.id]
    )
    const requestedTaskMissing = Boolean(requestedTaskId)
        && !loading
        && !error
        && !assignedTasks.some((task) => String(task.id) === String(requestedTaskId))
    const pendingTasks = assignedTasks.filter((task) => task.status !== 'COMPLETED')
    const overdueTasks = assignedTasks.filter(isOverdue)
    const upcomingDeadlines = useMemo(
        () => pendingTasks
            .filter((task) => task.dueDate && !isOverdue(task))
            .sort((left, right) => new Date(left.dueDate) - new Date(right.dueDate))
            .slice(0, 6),
        [pendingTasks]
    )
    const submissions = assignedTasks.filter((task) =>
        task.status === 'IN_REVIEW' || task.status === 'COMPLETED' || task.review
    )
    const completedThisWeek = assignedTasks.filter((task) => {
        if (task.status !== 'COMPLETED' || !task.completedAt) return false
        const completedAt = new Date(task.completedAt)
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        return completedAt >= weekAgo
    }).length
    const completedThisMonth = assignedTasks.filter((task) => {
        if (task.status !== 'COMPLETED' || !task.completedAt) return false
        const completedAt = new Date(task.completedAt)
        const now = new Date()
        return completedAt.getFullYear() === now.getFullYear()
            && completedAt.getMonth() === now.getMonth()
    }).length
    const taskCounts = Object.fromEntries(TASK_COLUMNS.map(({ status }) => [
        status,
        assignedTasks.filter((task) => task.status === status).length,
    ]))
    const filteredTasks = useMemo(() => {
        const query = taskSearch.trim().toLowerCase()
        return assignedTasks
            .filter((task) => statusFilter === 'ALL' || task.status === statusFilter)
            .filter((task) => priorityFilter === 'ALL' || String(task.priority || '').toUpperCase() === priorityFilter)
            .filter((task) => !query || [
                task.title,
                task.description,
                task.projectName,
            ].some((value) => String(value || '').toLowerCase().includes(query)))
            .sort((left, right) => {
                const leftDate = left.dueDate ? new Date(left.dueDate).getTime() : Number.POSITIVE_INFINITY
                const rightDate = right.dueDate ? new Date(right.dueDate).getTime() : Number.POSITIVE_INFINITY
                const byDate = dueDateSort === 'ASC' ? leftDate - rightDate : rightDate - leftDate
                return Number.isNaN(byDate) || byDate === 0
                    ? String(left.title || '').localeCompare(String(right.title || ''))
                    : byDate
            })
    }, [assignedTasks, dueDateSort, priorityFilter, statusFilter, taskSearch])
    const completedCount = taskCounts.COMPLETED || 0
    const completionRate = assignedTasks.length
        ? Math.round((completedCount / assignedTasks.length) * 100)
        : 0
    const recentActivity = notifications.slice(0, 6)

    const viewHeadings = {
        overview: ['Developer Dashboard', 'Your assigned work, project updates, and upcoming deadlines.'],
        tasks: ['My Tasks', 'Work assigned to you across your project memberships.'],
        projects: ['My Projects', 'Projects where you are an authorized member.'],
        team: ['My Team', 'Teams you belong to and the people you work with.'],
        submissions: ['Task Submissions', 'Track pending reviews, feedback, and completed submissions.'],
        performance: ['My Performance', 'Personal work statistics calculated from your assigned tasks.'],
    }
    const [pageTitle, pageSubtitle] = viewHeadings[view] || viewHeadings.overview

    function managerNameForId(userId) {
        const manager = members.find((member) => String(member.userId) === String(userId))
        return manager?.name || manager?.email || 'Project manager'
    }

    function teamNameFor(workItem) {
        const project = projects.find((item) => String(item.id) === String(workItem.projectId))
        const teamId = workItem.teamId || project?.teamId
        return teams.find((team) => String(team.id) === String(teamId))?.name || 'Not assigned'
    }

    const openTask = useCallback(async (task) => {
        setSelectedTask(task)
        setProgressDraft(Number(task.progress || 0))
        setCommentDraft('')
        setEditingCommentId(null)
        setSubmissionDetails('')
        setDetailsLoading(true)
        setError('')
        setComments([])
        setAttachments([])
        setReviewHistory([])
        try {
            const [commentsResult, attachmentsResult, reviewsResult] = await Promise.allSettled([
                getProjectTaskComments(task.id),
                getProjectTaskAttachments(task.id),
                getProjectTaskReviews(task.id),
            ])
            if (commentsResult.status === 'fulfilled') {
                setComments(Array.isArray(commentsResult.value) ? commentsResult.value : [])
            }
            if (attachmentsResult.status === 'fulfilled') {
                setAttachments(Array.isArray(attachmentsResult.value) ? attachmentsResult.value : [])
            }
            if (reviewsResult.status === 'fulfilled') {
                setReviewHistory(Array.isArray(reviewsResult.value) ? reviewsResult.value : [])
            }
            const failures = [
                [commentsResult, 'comments'],
                [attachmentsResult, 'attachments'],
                [reviewsResult, 'review history'],
            ]
                .filter(([result]) => result.status === 'rejected')
                .map(([result, label]) => `Unable to load ${label}: ${result.reason?.message || 'request failed'}`)
            if (failures.length > 0) setError(failures.join(' '))
        } finally {
            setDetailsLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!requestedTaskId || loading) return
        const task = assignedTasks.find((item) => String(item.id) === String(requestedTaskId))
        if (!task) return
        // A taskId query parameter represents an explicit navigation action that opens the details modal.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        openTask(task)
        setSearchParams((current) => {
            const next = new URLSearchParams(current)
            next.delete('taskId')
            return next
        }, { replace: true })
    }, [assignedTasks, loading, openTask, requestedTaskId, setSearchParams])

    useEffect(() => {
        const socket = getSocket()
        if (!socket || !user?.id) return

        function handleTaskCreated(task) {
            if (!task?.id || String(task.assigneeId) !== String(user.id)) return
            const projectName = projects.find((project) => String(project.id) === String(task.projectId))?.name || task.projectName
            setTasks((current) => [
                { ...task, projectName },
                ...current.filter((item) => String(item.id) !== String(task.id)),
            ])
        }

        function handleTaskUpdated(task) {
            if (!task?.id) return
            const existing = tasks.find((item) => String(item.id) === String(task.id))
            if (String(task.assigneeId) !== String(user.id)) {
                setTasks((current) => current.filter((item) => String(item.id) !== String(task.id)))
                setSelectedTask((current) => current && String(current.id) === String(task.id) ? null : current)
                return
            }
            const projectName = task.projectName
                || existing?.projectName
                || projects.find((project) => String(project.id) === String(task.projectId))?.name
            const updatedTask = { ...existing, ...task, projectName }
            setTasks((current) => current.some((item) => String(item.id) === String(task.id))
                ? current.map((item) => String(item.id) === String(task.id) ? updatedTask : item)
                : [updatedTask, ...current])
            if (
                selectedTask
                && String(selectedTask.id) === String(task.id)
                && selectedTask.status === 'IN_REVIEW'
                && task.status !== 'IN_REVIEW'
            ) {
                getProjectTaskReviews(task.id)
                    .then((reviews) => setReviewHistory(Array.isArray(reviews) ? reviews : []))
                    .catch((requestError) => setError(requestError.message || 'Unable to refresh review history.'))
            }
            setSelectedTask((current) => current && String(current.id) === String(task.id)
                ? { ...current, ...updatedTask }
                : current)
        }

        function handleTaskDeleted(payload) {
            const taskId = payload?.id || payload?.taskId
            if (!taskId) return
            setTasks((current) => current.filter((item) => String(item.id) !== String(taskId)))
            setSelectedTask((current) => current && String(current.id) === String(taskId) ? null : current)
        }

        function handleCommentCreated(payload) {
            if (!selectedTask || String(payload?.taskId) !== String(selectedTask.id) || !payload.comment) return
            setComments((current) => current.some((comment) => String(comment.id) === String(payload.comment.id))
                ? current
                : [...current, payload.comment])
        }

        socket.on('task:created', handleTaskCreated)
        socket.on('task:updated', handleTaskUpdated)
        socket.on('task:deleted', handleTaskDeleted)
        socket.on('comment:created', handleCommentCreated)
        return () => {
            socket.off('task:created', handleTaskCreated)
            socket.off('task:updated', handleTaskUpdated)
            socket.off('task:deleted', handleTaskDeleted)
            socket.off('comment:created', handleCommentCreated)
        }
    }, [projects, selectedTask, tasks, user?.id])

    function replaceTask(updatedTask) {
        setTasks((current) => current.map((task) =>
            String(task.id) === String(updatedTask.id)
                ? { ...task, ...updatedTask, projectName: task.projectName }
                : task
        ))
        setSelectedTask((current) => current && String(current.id) === String(updatedTask.id)
            ? { ...current, ...updatedTask, projectName: current.projectName }
            : current)
    }

    async function startTask(task) {
        setSavingAction(true)
        setError('')
        try {
            const updated = await updateProjectTask(task.id, { status: 'IN_PROGRESS' })
            replaceTask(updated)
        } catch (requestError) {
            setError(requestError.message || 'Unable to start this task.')
        } finally {
            setSavingAction(false)
        }
    }

    async function saveProgress() {
        if (!selectedTask) return
        setSavingAction(true)
        setError('')
        try {
            const updated = await updateProjectTask(selectedTask.id, { progress: Number(progressDraft) })
            replaceTask(updated)
        } catch (requestError) {
            setError(requestError.message || 'Unable to update task progress.')
        } finally {
            setSavingAction(false)
        }
    }

    async function submitTask(event) {
        event.preventDefault()
        if (!selectedTask || !submissionDetails.trim()) return
        setSavingAction(true)
        setError('')
        try {
            const updated = await submitProjectTaskForReview(selectedTask.id, submissionDetails.trim())
            const review = {
                status: 'PENDING',
                submittedAt: new Date().toISOString(),
                submissionDetails: submissionDetails.trim(),
                submittedById: user?.id,
                submitterName: user?.name,
            }
            replaceTask({ ...updated, review })
            setReviewHistory((current) => [{
                id: `pending-${updated.id}`,
                ...review,
            }, ...current.filter((item) => item.status !== 'PENDING')])
            setSubmissionDetails('')
        } catch (requestError) {
            setError(requestError.message || 'Unable to submit this task for review.')
        } finally {
            setSavingAction(false)
        }
    }

    async function postComment(event) {
        event.preventDefault()
        if (!selectedTask || !commentDraft.trim()) return
        setSavingAction(true)
        setError('')
        try {
            const comment = await createProjectTaskComment(selectedTask.id, commentDraft.trim())
            setComments((current) => [...current, comment])
            setCommentDraft('')
        } catch (requestError) {
            setError(requestError.message || 'Unable to add your comment.')
        } finally {
            setSavingAction(false)
        }
    }

    async function saveCommentEdit(event, commentId) {
        event.preventDefault()
        if (!commentEditDraft.trim()) return
        setSavingAction(true)
        setError('')
        try {
            const updated = await updateProjectTaskComment(commentId, commentEditDraft.trim())
            setComments((current) => current.map((comment) => String(comment.id) === String(commentId) ? updated : comment))
            setEditingCommentId(null)
            setCommentEditDraft('')
        } catch (requestError) {
            setError(requestError.message || 'Unable to update this comment.')
        } finally {
            setSavingAction(false)
        }
    }

    async function removeComment(commentId) {
        if (!window.confirm('Delete your comment?')) return
        setSavingAction(true)
        setError('')
        try {
            await deleteProjectTaskComment(commentId)
            setComments((current) => current.filter((comment) => String(comment.id) !== String(commentId)))
        } catch (requestError) {
            setError(requestError.message || 'Unable to delete this comment.')
        } finally {
            setSavingAction(false)
        }
    }

    function managerName(task) {
        return managerNameForId(task.createdById)
    }

    function taskCard(task) {
        return (
            <button className="developer-task-card" key={task.id} type="button" onClick={() => openTask(task)}>
                <span className={`developer-status status-${String(task.status).toLowerCase()}`}>{statusLabel(task.status)}</span>
                <strong>{task.title}</strong>
                <span className="developer-task-project">{task.projectName} · {priorityLabel(task.priority)}</span>
                <span className="developer-progress-track">
                    <span style={{ width: `${Math.min(100, Number(task.progress || 0))}%` }} />
                </span>
                <span className="developer-task-meta">
                    <span>{Number(task.progress || 0)}% complete</span>
                    <span className={isOverdue(task) ? 'developer-overdue' : ''}>{formatDate(task.dueDate)}</span>
                </span>
            </button>
        )
    }

    if (!loading && organizations.length === 0) {
        return (
            <main className="feature-page">
                <section className="panel developer-empty">
                    <h1>Developer workspace unavailable</h1>
                    <p>This account does not have a Developer or Team Member role in an available workspace.</p>
                </section>
            </main>
        )
    }

    return (
        <main className="feature-page developer-dashboard">
            <header className="feature-heading">
                <div>
                    <p className="eyebrow">Developer workspace</p>
                    <h1>{view === 'overview' ? `Welcome back${user?.name ? `, ${user.name}` : ''}!` : pageTitle}</h1>
                    <p className="heading-subtitle">{pageSubtitle}</p>
                </div>
                {organizations.length > 1 && (
                    <label className="developer-workspace-select">
                        Workspace
                        <select value={organizationId} onChange={(event) => {
                            setLoading(true)
                            setError('')
                            setOrganizationId(event.target.value)
                        }}>
                            {organizations.map((organization) => (
                                <option key={organization.id} value={organization.id}>{organization.name}</option>
                            ))}
                        </select>
                    </label>
                )}
            </header>

            {(error || requestedTaskMissing) && <p className="service-error" role="alert">{error || 'That assigned task could not be found in your workspace.'}</p>}
            {loading && <p className="loading-state">Loading your assigned work…</p>}
            {!loading && !activeOrganization && (
                <section className="panel developer-empty">
                    <h2>No developer workspace available</h2>
                    <p>Join a workspace as a Developer to see assigned projects and tasks.</p>
                </section>
            )}

            {!loading && activeOrganization && (
                <>
                    {view === 'overview' && (
                        <>
                            <section className="developer-stat-grid" aria-label="My task summary">
                                {[
                                    ['Assigned tasks', assignedTasks.length],
                                    ['To Do', taskCounts.TODO],
                                    ['In Progress', taskCounts.IN_PROGRESS],
                                    ['Under Review', taskCounts.IN_REVIEW],
                                    ['Completed', completedCount],
                                    ['Overdue', overdueTasks.length],
                                ].map(([label, count]) => (
                                    <article className="developer-stat-card" key={label}>
                                        <span>{label}</span><strong>{count}</strong>
                                    </article>
                                ))}
                            </section>
                            <div className="developer-overview-grid">
                                <section className="panel developer-section">
                                    <div className="developer-section-heading">
                                        <div><h2>My Tasks</h2><p>Your next assigned tasks.</p></div>
                                        <button className="text-button" type="button" onClick={() => navigate('/developer/tasks')}>View all</button>
                                    </div>
                                    {assignedTasks.length === 0
                                        ? <p className="developer-empty-copy">No tasks are currently assigned to you.</p>
                                        : <div className="developer-task-list">{assignedTasks.slice(0, 4).map(taskCard)}</div>}
                                </section>
                                <section className="panel developer-section">
                                    <div className="developer-section-heading">
                                        <div><h2>Upcoming deadlines</h2><p>Open tasks ordered by due date.</p></div>
                                    </div>
                                    {upcomingDeadlines.length === 0
                                        ? <p className="developer-empty-copy">No upcoming deadlines.</p>
                                        : <div className="developer-deadline-list">
                                            {upcomingDeadlines.map((task) => (
                                                <button className="developer-deadline-row" key={task.id} type="button" onClick={() => openTask(task)}>
                                                    <span className={isOverdue(task) ? 'developer-overdue' : ''}>{formatDate(task.dueDate)}</span>
                                                    <strong>{task.title}</strong><small>{task.projectName}</small>
                                                </button>
                                            ))}
                                        </div>}
                                </section>
                                <section className="panel developer-section">
                                    <div className="developer-section-heading">
                                        <div><h2>My Projects</h2><p>Projects where you are a member.</p></div>
                                        <button className="text-button" type="button" onClick={() => navigate('/developer/projects')}>View all</button>
                                    </div>
                                    {projects.length === 0
                                        ? <p className="developer-empty-copy">You are not a member of any projects yet.</p>
                                        : <div className="developer-project-list">
                                            {projects.slice(0, 4).map((project) => (
                                                <article className="developer-project-row" key={project.id}>
                                                    <div><strong>{project.name}</strong><small>{project.description || 'No description'} · {project.status}</small></div>
                                                    <b>{project.tasksSummary?.total
                                                        ? Math.round(project.tasksSummary.completed / project.tasksSummary.total * 100)
                                                        : 0}%</b>
                                                </article>
                                            ))}
                                        </div>}
                                </section>
                                <section className="panel developer-section">
                                    <div className="developer-section-heading">
                                        <div><h2>Recent activity</h2><p>Task and workspace updates for your account.</p></div>
                                    </div>
                                    {recentActivity.length === 0
                                        ? <p className="developer-empty-copy">No recent notifications.</p>
                                        : <div className="developer-activity-list">
                                            {recentActivity.map((item) => (
                                                <article className="developer-activity-row" key={item.id}>
                                                    <span className="developer-activity-dot" />
                                                    <div><strong>{item.message}</strong><small>{formatDate(item.createdAt)}</small></div>
                                                </article>
                                            ))}
                                        </div>}
                                </section>
                            </div>
                        </>
                    )}

                    {view === 'tasks' && (
                        <>
                            <div className="developer-task-filters" aria-label="Filter and sort tasks">
                                <input
                                    type="search"
                                    aria-label="Search tasks"
                                    placeholder="Search title, description, or project"
                                    value={taskSearch}
                                    onChange={(event) => setTaskSearch(event.target.value)}
                                />
                                <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                                    <option value="ALL">All statuses</option>
                                    {TASK_COLUMNS.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
                                </select>
                                <select aria-label="Filter by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                                    <option value="ALL">All priorities</option>
                                    <option value="URGENT">Critical</option>
                                    <option value="HIGH">High</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="LOW">Low</option>
                                </select>
                                <select aria-label="Sort by due date" value={dueDateSort} onChange={(event) => setDueDateSort(event.target.value)}>
                                    <option value="ASC">Due date: soonest first</option>
                                    <option value="DESC">Due date: latest first</option>
                                </select>
                            </div>
                            {calendarViewUnavailable && (
                                <p className="service-error" role="status">Calendar view is not available yet. Showing your tasks in Kanban view.</p>
                            )}
                            {taskLayout === 'list' ? (
                                <div className="developer-task-table-wrap">
                                    <div className="developer-task-table" role="table" aria-label="My assigned tasks">
                                        <div className="developer-task-table-row is-header" role="row">
                                            <span role="columnheader">Task</span><span role="columnheader">Project</span>
                                            <span role="columnheader">Status</span><span role="columnheader">Priority</span>
                                            <span role="columnheader">Due date</span><span role="columnheader">Progress</span>
                                        </div>
                                        {filteredTasks.map((task) => (
                                            <button className="developer-task-table-row" key={task.id} type="button" role="row" onClick={() => openTask(task)}>
                                                <strong role="cell">{task.title}</strong><span role="cell">{task.projectName}</span>
                                                <span role="cell">{statusLabel(task.status)}</span><span role="cell">{priorityLabel(task.priority)}</span>
                                                <span role="cell" className={isOverdue(task) ? 'developer-overdue' : ''}>{formatDate(task.dueDate)}</span>
                                                <span role="cell">{Number(task.progress || 0)}%</span>
                                            </button>
                                        ))}
                                    </div>
                                    {filteredTasks.length === 0 && <p className="developer-empty-copy">No tasks match your filters.</p>}
                                </div>
                            ) : (
                                <div className="developer-kanban" aria-label="My tasks by status">
                                    {TASK_COLUMNS
                                        .filter((column) => statusFilter === 'ALL' || statusFilter === column.status)
                                        .map((column) => {
                                            const columnTasks = filteredTasks.filter((task) => task.status === column.status)
                                            return (
                                                <section className="panel developer-kanban-column" key={column.status}>
                                                    <div className="developer-section-heading">
                                                        <h2>{column.label}</h2><span>{columnTasks.length}</span>
                                                    </div>
                                                    {columnTasks.length === 0
                                                        ? <p className="developer-empty-copy">No matching tasks</p>
                                                        : <div className="developer-task-list">{columnTasks.map(taskCard)}</div>}
                                                </section>
                                            )
                                        })}
                                </div>
                            )}
                        </>
                    )}

                    {view === 'projects' && (
                        <section className="developer-project-grid">
                            {projects.length === 0
                                ? <div className="panel developer-empty-copy">You are not a member of any projects yet.</div>
                                : projects.map((project) => {
                                    const total = Number(project.tasksSummary?.total || 0)
                                    const complete = Number(project.tasksSummary?.completed || 0)
                                    const progress = total ? Math.round(complete / total * 100) : 0
                                    return (
                                        <article className="panel developer-project-card" key={project.id}>
                                            <div className="developer-section-heading">
                                                <div><h2>{project.name}</h2><p>{project.description || 'No description provided.'}</p></div>
                                                <span className={`developer-status status-${String(project.status).toLowerCase()}`}>{String(project.status || 'ACTIVE').replaceAll('_', ' ')}</span>
                                            </div>
                                            <div className="developer-project-meta">
                                                <span>Priority <b>{priorityLabel(project.priority)}</b></span>
                                                <span>Deadline <b>{formatDate(project.dueDate)}</b></span>
                                                <span>Tasks <b>{complete} / {total} completed</b></span>
                                                <span>Manager <b>{managerNameForId(project.createdById)}</b></span>
                                                <span>Team <b>{teamNameFor(project)}</b></span>
                                            </div>
                                            <div className="developer-progress-track"><span style={{ width: `${progress}%` }} /></div>
                                            <small>{progress}% complete</small>
                                            <div className="developer-project-task-list">
                                                <strong>Your assigned tasks</strong>
                                                {assignedTasks.filter((task) => String(task.projectId) === String(project.id)).length === 0
                                                    ? <p className="developer-empty-copy">No tasks assigned to you in this project.</p>
                                                    : assignedTasks
                                                        .filter((task) => String(task.projectId) === String(project.id))
                                                        .map(taskCard)}
                                            </div>
                                        </article>
                                    )
                                })}
                        </section>
                    )}

                    {view === 'team' && (
                        <section className="developer-team-grid">
                            {teams.length === 0
                                ? <div className="panel developer-empty-copy">You are not currently assigned to a team.</div>
                                : teams.map((team) => {
                                    const teamTasks = assignedTasks.filter((task) => {
                                        const project = projects.find((item) => String(item.id) === String(task.projectId))
                                        return String(task.teamId || project?.teamId) === String(team.id)
                                    })
                                    const teamCompleted = teamTasks.filter((task) => task.status === 'COMPLETED').length
                                    const teamActive = teamTasks.length - teamCompleted
                                    return (
                                        <article className="panel developer-team-card" key={team.id}>
                                            <div className="developer-section-heading">
                                                <div><h2>{team.name}</h2><p>{team.description || 'Team workspace'}</p></div>
                                            </div>
                                            <p className="developer-team-manager">Manager: {managerNameForId(team.createdById)}</p>
                                            <div className="developer-team-members">
                                                {(team.members || []).map((entry) => {
                                                    const member = entry.user || {}
                                                    return (
                                                        <div className="developer-team-member" key={entry.userId}>
                                                            <span className="developer-avatar">
                                                                {member.avatarUrl
                                                                    ? <img src={member.avatarUrl} alt="" />
                                                                    : (member.name || member.email || 'TM').slice(0, 2).toUpperCase()}
                                                            </span>
                                                            <span><strong>{member.name || member.email}</strong><small>{member.role || 'Member'}</small></span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                            <div className="developer-team-stats">
                                                <strong>Your assigned tasks</strong>
                                                <span>{teamTasks.length} total</span>
                                                <span>{teamActive} active</span>
                                                <span>{teamCompleted} completed</span>
                                            </div>
                                            <div className="developer-team-projects">
                                                <strong>Team projects</strong>
                                                {(team.projects || []).length === 0
                                                    ? <small>No projects assigned.</small>
                                                    : team.projects.map((project) => <span key={project.id}>{project.name}</span>)}
                                            </div>
                                        </article>
                                    )
                                })}
                        </section>
                    )}

                    {view === 'submissions' && (
                        <section className="panel developer-section">
                            <div className="developer-section-heading">
                                <div><h2>Submission history</h2><p>Pending review, manager feedback, and approved work.</p></div>
                                <span className="developer-submission-count">{submissions.length}</span>
                            </div>
                            {submissions.length === 0
                                ? <p className="developer-empty-copy">You have not submitted any tasks for review yet.</p>
                                : <div className="developer-submission-list">
                                    {submissions.map((task) => (
                                        <button className="developer-submission-row" key={task.id} type="button" onClick={() => openTask(task)}>
                                            <span className={`developer-status status-${String(task.status).toLowerCase()}`}>{statusLabel(task.status)}</span>
                                            <span><strong>{task.title}</strong><small>{task.projectName} · {task.review?.submittedAt ? `Submitted ${formatDate(task.review.submittedAt)}` : `Manager: ${managerName(task)}`}</small></span>
                                            <b>{task.review?.feedback ? 'View feedback' : 'Details'}</b>
                                        </button>
                                    ))}
                                </div>}
                        </section>
                    )}

                    {view === 'performance' && (
                        <div className="developer-performance-grid">
                            <section className="panel developer-section">
                                <div className="developer-section-heading"><div><h2>Task status</h2><p>Counts reflect tasks assigned to your account.</p></div></div>
                                <div className="developer-performance-bars">
                                    {TASK_COLUMNS.map((column) => {
                                        const count = taskCounts[column.status] || 0
                                        const width = assignedTasks.length ? count / assignedTasks.length * 100 : 0
                                        return (
                                            <div className="developer-performance-row" key={column.status}>
                                                <span>{column.label}</span><div className="developer-progress-track"><span className={`bar-${column.status.toLowerCase()}`} style={{ width: `${width}%` }} /></div><b>{count}</b>
                                            </div>
                                        )
                                    })}
                                </div>
                            </section>
                            <section className="panel developer-section developer-performance-summary">
                                <h2>Personal completion</h2>
                                <strong>{completionRate}%</strong>
                                <p>{completedCount} of {assignedTasks.length} assigned tasks completed.</p>
                                <div className="developer-performance-facts">
                                    <span><b>{completedThisWeek}</b> completed this week</span>
                                    <span><b>{completedThisMonth}</b> completed this month</span>
                                    <span><b>{taskCounts.IN_REVIEW || 0}</b> submitted for review</span>
                                    <span><b>{overdueTasks.length}</b> overdue</span>
                                </div>
                            </section>
                        </div>
                    )}
                </>
            )}

            {selectedTask && (
                <div className="developer-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedTask(null)}>
                    <section className="developer-modal" role="dialog" aria-modal="true" aria-labelledby="developer-task-title">
                        <header className="developer-modal-heading">
                            <div><p className="eyebrow">Task details</p><h2 id="developer-task-title">{selectedTask.title}</h2></div>
                            <button className="icon-button" type="button" aria-label="Close task details" onClick={() => setSelectedTask(null)}>×</button>
                        </header>
                        <div className="developer-task-detail-meta">
                            <span>Project: {selectedTask.projectName}</span>
                            <span>Status: {statusLabel(selectedTask.status)}</span>
                            <span>Priority: {priorityLabel(selectedTask.priority)}</span>
                            <span>Team: {teamNameFor(selectedTask)}</span>
                            <span>Manager: {managerName(selectedTask)}</span>
                            <span>Start: {formatDate(selectedTask.startDate)}</span>
                            <span>Due: {formatDate(selectedTask.dueDate)}</span>
                        </div>
                        <p className="developer-task-description">{selectedTask.description || 'No task requirements have been provided.'}</p>
                        {detailsLoading ? <p className="loading-state">Loading comments, attachments, and review history…</p> : (
                            <>
                                <div className="developer-detail-progress">
                                    <div><strong>Progress</strong><span>{Number(selectedTask.progress || 0)}%</span></div>
                                    <div className="developer-progress-track"><span style={{ width: `${Math.min(100, Number(selectedTask.progress || 0))}%` }} /></div>
                                </div>
                                {selectedTask.status === 'TODO' && (
                                    <button className="primary-button" type="button" disabled={savingAction} onClick={() => startTask(selectedTask)}>
                                        {savingAction ? 'Starting…' : 'Start task'}
                                    </button>
                                )}
                                {selectedTask.status === 'IN_PROGRESS' && (
                                    <>
                                        <label className="developer-progress-input">
                                            Update progress: {progressDraft}%
                                            <input type="range" min="0" max="100" step="1" value={progressDraft} onChange={(event) => setProgressDraft(Number(event.target.value))} />
                                        </label>
                                        <div className="developer-modal-actions">
                                            <button className="secondary-button" type="button" disabled={savingAction || Number(progressDraft) === Number(selectedTask.progress || 0)} onClick={saveProgress}>Save progress</button>
                                        </div>
                                        <form className="developer-submit-form" onSubmit={submitTask}>
                                            <label>Completion summary<textarea required rows={3} value={submissionDetails} onChange={(event) => setSubmissionDetails(event.target.value)} placeholder="Summarize the work completed and any implementation notes." /></label>
                                            <button className="primary-button" type="submit" disabled={savingAction || !submissionDetails.trim()}>
                                                {savingAction ? 'Submitting…' : 'Submit for manager review'}
                                            </button>
                                        </form>
                                    </>
                                )}
                                {selectedTask.status === 'IN_REVIEW' && (
                                    <div className="developer-review-notice">
                                        <strong>Pending Manager Review</strong>
                                        <p>{selectedTask.review?.submissionDetails || 'Your submission is waiting for a manager decision.'}</p>
                                    </div>
                                )}
                                {selectedTask.status === 'COMPLETED' && (
                                    <div className="developer-review-notice is-complete">
                                        <strong>Approved and completed</strong>
                                        <p>{selectedTask.review?.feedback || 'Your manager approved this task.'}</p>
                                    </div>
                                )}
                                {reviewHistory.length > 0 && (
                                    <section className="developer-detail-section">
                                        <h3>Review history</h3>
                                        {reviewHistory.map((review) => (
                                            <article className="developer-review-history-row" key={review.id}>
                                                <strong>{String(review.status || '').replaceAll('_', ' ')}</strong>
                                                <small>{formatDate(review.reviewedAt || review.submittedAt)} · {review.reviewerName || 'Submitted'}</small>
                                                {review.feedback && <p>{review.feedback}</p>}
                                            </article>
                                        ))}
                                    </section>
                                )}
                                <section className="developer-detail-section">
                                    <h3>Attachments</h3>
                                    {attachments.length === 0 ? <p className="developer-empty-copy">No attachments.</p> : attachments.map((attachment) => (
                                        attachment.fileUrl
                                            ? <a className="developer-attachment-row" key={attachment.id} href={attachment.fileUrl} target="_blank" rel="noreferrer">{attachment.fileName}</a>
                                            : <span className="developer-attachment-row" key={attachment.id}>{attachment.fileName} (No download link available)</span>
                                    ))}
                                </section>
                                <section className="developer-detail-section">
                                    <h3>Comments</h3>
                                    {comments.length === 0 ? <p className="developer-empty-copy">No comments yet.</p> : (
                                        <div className="developer-comments">
                                            {comments.map((comment) => (
                                                <article className="developer-comment" key={comment.id}>
                                                    <strong>{comment.author?.name || (String(comment.authorId) === String(user?.id) ? 'You' : 'Team member')}</strong>
                                                    {editingCommentId === comment.id ? (
                                                        <form onSubmit={(event) => saveCommentEdit(event, comment.id)}>
                                                            <textarea rows={2} value={commentEditDraft} onChange={(event) => setCommentEditDraft(event.target.value)} />
                                                            <div className="developer-modal-actions">
                                                                <button className="secondary-button" type="button" onClick={() => setEditingCommentId(null)}>Cancel</button>
                                                                <button className="primary-button" type="submit" disabled={savingAction || !commentEditDraft.trim()}>Save comment</button>
                                                            </div>
                                                        </form>
                                                    ) : (
                                                        <>
                                                            <p>{comment.content}</p>
                                                            <small>{formatDate(comment.createdAt)}</small>
                                                            {String(comment.authorId) === String(user?.id) && (
                                                                <div className="developer-comment-actions">
                                                                    <button type="button" onClick={() => {
                                                                        setEditingCommentId(comment.id)
                                                                        setCommentEditDraft(comment.content)
                                                                    }}>Edit</button>
                                                                    <button type="button" disabled={savingAction} onClick={() => removeComment(comment.id)}>Delete</button>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </article>
                                            ))}
                                        </div>
                                    )}
                                    {selectedTask.status !== 'COMPLETED' && (
                                        <form className="developer-comment-form" onSubmit={postComment}>
                                            <textarea rows={2} value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Add a task comment or report a blocker…" />
                                            <div className="developer-modal-actions">
                                                <button className="secondary-button" type="button" onClick={() => setCommentDraft((current) => current.startsWith('Blocker: ') ? current : `Blocker: ${current}`)}>Report blocker</button>
                                                <button className="primary-button" type="submit" disabled={savingAction || !commentDraft.trim()}>{savingAction ? 'Posting…' : 'Add comment'}</button>
                                            </div>
                                        </form>
                                    )}
                                </section>
                            </>
                        )}
                    </section>
                </div>
            )}
        </main>
    )
}
