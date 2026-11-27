import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOrganizations, getOrganizationMembers } from '../services/organizationService.js'
import { getOverview } from '../services/analyticsService.js'
import { getCurrentUser } from '../services/authService.js'
import { getNotifications } from '../services/notificationService.js'
import {
    createProjectTask,
    deleteProjectTask,
    getProjectTaskAttachments,
    getProjectTaskComments,
    getProjectTaskReviews,
    getProjectTasks,
    getProjects,
    reviewProjectTask,
    updateProjectTask,
} from '../services/projectService.js'
import { getTeams } from '../services/teamService.js'
import '../App.css'
import './ManagerDashboardPage.css'

const EMPTY_FORM = {
    title: '',
    description: '',
    projectId: '',
    assigneeId: '',
    priority: 'MEDIUM',
    status: 'TODO',
    startDate: '',
    dueDate: '',
    teamId: '',
    progress: 0,
}

function formatDate(value) {
    if (!value) return 'No deadline'
    const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value)
    return Number.isNaN(date.getTime()) ? 'No deadline' : date.toLocaleDateString()
}

function formatStatus(status) {
    return String(status || 'TODO').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatPriority(priority) {
    return String(priority || 'MEDIUM').toUpperCase() === 'URGENT'
        ? 'Critical'
        : formatStatus(priority || 'MEDIUM')
}

function formatRelativeTime(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
    if (elapsedMinutes < 1) return 'Just now'
    if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`
    const elapsedHours = Math.floor(elapsedMinutes / 60)
    if (elapsedHours < 24) return `${elapsedHours}h ago`
    const elapsedDays = Math.floor(elapsedHours / 24)
    if (elapsedDays < 7) return `${elapsedDays}d ago`
    return date.toLocaleDateString()
}

function formatDeadline(value) {
    if (!value) return 'No deadline'
    const deadline = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value)
    if (Number.isNaN(deadline.getTime())) return 'No deadline'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    deadline.setHours(0, 0, 0, 0)
    const daysUntil = Math.round((deadline - today) / 86400000)
    if (daysUntil === 0) return 'Today'
    if (daysUntil === 1) return 'Tomorrow'
    return deadline.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatWeekday(value) {
    if (!value) return ''
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { weekday: 'short' })
}

function getActivityTitle(notification) {
    const type = String(notification?.type || '').toUpperCase()
    const message = String(notification?.message || '').toLowerCase()
    if (type === 'TASK_ASSIGNED' || message.includes('assigned to you')) return 'New task assigned'
    if (type === 'DEADLINE_REMINDER') return 'Deadline approaching'
    if (type === 'TASK_OVERDUE') return 'Task overdue'
    if (type === 'TASK_APPROVED' || message.includes('approved')) return 'Task approved'
    if (message.includes('submitted') || message.includes('review')) return 'Task submitted'
    if (type.startsWith('PROJECT')) return 'Project updated'
    return formatStatus(type || 'Workspace update')
}

function getTrendPoints(rows, key, maxValueOverride = 0, width = 320, height = 150) {
    const values = rows.map((row) => Number(row[key] || 0))
    const maxValue = Math.max(5, maxValueOverride, ...values)
    const left = 28
    const right = width - 8
    const top = 10
    const bottom = height - 24
    const plotWidth = right - left
    const plotHeight = bottom - top
    const points = values.map((value, index) => {
        const x = values.length < 2 ? left + plotWidth / 2 : left + (plotWidth * index) / (values.length - 1)
        const y = bottom - (value / maxValue) * plotHeight
        return { x, y, value }
    })
    return {
        points,
        pointsString: points.map(({ x, y }) => `${x},${y}`).join(' '),
        areaPath: points.length
            ? `M ${points[0].x},${bottom} L ${points.map(({ x, y }) => `${x},${y}`).join(' L ')} L ${points[points.length - 1].x},${bottom} Z`
            : '',
        maxValue,
        left,
        right,
        top,
        bottom,
        plotHeight,
    }
}

async function fetchDashboardData(organizationId) {
    const [overviewResult, projectsResult, teamsResult, membersResult, notificationsResult] = await Promise.allSettled([
        getOverview(organizationId),
        getProjects(organizationId),
        getTeams(organizationId),
        getOrganizationMembers(organizationId),
        getNotifications(),
    ])
    if (projectsResult.status === 'rejected') throw projectsResult.reason

    const projects = Array.isArray(projectsResult.value) ? projectsResult.value : []
    const manageableProjects = projects.filter((project) => project.canManage)
    const taskGroups = await Promise.all(manageableProjects.map(async (project) => ({
        project,
        tasks: await getProjectTasks(project.id),
    })))
    const loadErrors = [
        [overviewResult, 'Unable to load workspace analytics.'],
        [teamsResult, 'Unable to load workspace teams.'],
        [membersResult, 'Unable to load workspace developers.'],
        [notificationsResult, 'Unable to load workspace notifications.'],
    ]
        .filter(([result]) => result.status === 'rejected')
        .map(([result, fallback]) => `${fallback} ${result.reason?.message || ''}`.trim())

    return {
        overview: overviewResult.status === 'fulfilled' ? overviewResult.value : null,
        projects,
        teams: teamsResult.status === 'fulfilled' && Array.isArray(teamsResult.value) ? teamsResult.value : [],
        members: membersResult.status === 'fulfilled' && Array.isArray(membersResult.value)
            ? membersResult.value.filter((member) => member.role === 'MEMBER')
            : [],
        notifications: notificationsResult.status === 'fulfilled'
            ? Array.isArray(notificationsResult.value)
                ? notificationsResult.value
                : Array.isArray(notificationsResult.value?.data) ? notificationsResult.value.data : []
            : [],
        errors: loadErrors,
        tasks: taskGroups.flatMap(({ project, tasks }) =>
            (Array.isArray(tasks) ? tasks : []).map((task) => ({
                ...task,
                projectName: project.name,
            }))
        ),
    }
}

export default function ManagerDashboardPage({ view = 'overview' }) {
    const reviewsOnly = view === 'reviews'
    const tasksOnly = view === 'tasks'
    const navigate = useNavigate()
    const [organizations, setOrganizations] = useState([])
    const [organizationId, setOrganizationId] = useState('')
    const [user, setUser] = useState(null)
    const [overview, setOverview] = useState(null)
    const [projects, setProjects] = useState([])
    const [teams, setTeams] = useState([])
    const [members, setMembers] = useState([])
    const [tasks, setTasks] = useState([])
    const [notifications, setNotifications] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')
    const savingRef = useRef(false)
    const [showTaskForm, setShowTaskForm] = useState(false)
    const [editingTask, setEditingTask] = useState(null)
    const [taskForm, setTaskForm] = useState(EMPTY_FORM)
    const [reviewTask, setReviewTask] = useState(null)
    const [reviewDetails, setReviewDetails] = useState({ comments: [], attachments: [], history: [] })
    const [reviewFeedback, setReviewFeedback] = useState('')
    const [reviewLoading, setReviewLoading] = useState(false)
    const [reviewSaving, setReviewSaving] = useState(false)

    const loadDashboard = useCallback(async (orgId) => {
        try {
            const data = await fetchDashboardData(orgId)
            setOverview(data.overview)
            setProjects(data.projects)
            setTeams(data.teams)
            setMembers(data.members)
            setTasks(data.tasks)
            setNotifications(data.notifications)
            setError(data.errors.join(' '))
        } catch (requestError) {
            setError(requestError.message || 'Unable to load Manager dashboard data.')
        }
    }, [])

    useEffect(() => {
        let current = true
        Promise.all([getOrganizations(), getCurrentUser()])
            .then(([loadedOrganizations, currentUser]) => {
                if (!current) return
                const list = Array.isArray(loadedOrganizations)
                    ? loadedOrganizations.filter((organization) =>
                        ['MANAGER', 'ADMIN'].includes(String(organization.role || '').toUpperCase())
                    )
                    : []
                setOrganizations(list)
                setUser(currentUser)
                const firstOrganization = list[0]
                if (firstOrganization) {
                    setOrganizationId(firstOrganization.id)
                } else {
                    setLoading(false)
                }
            })
            .catch((requestError) => {
                if (current) {
                    setError(requestError.message || 'Unable to load your workspace.')
                    setLoading(false)
                }
            })
        return () => {
            current = false
        }
    }, [loadDashboard])

    useEffect(() => {
        if (!organizationId) return
        let current = true
        fetchDashboardData(organizationId)
            .then((data) => {
                if (!current) return
                setOverview(data.overview)
                setProjects(data.projects)
                setTeams(data.teams)
                setMembers(data.members)
                setTasks(data.tasks)
                setNotifications(data.notifications)
                setError(data.errors.join(' '))
            })
            .catch((requestError) => {
                if (current) setError(requestError.message || 'Unable to load Manager dashboard data.')
            })
            .finally(() => {
                if (current) setLoading(false)
            })
        return () => {
            current = false
        }
    }, [organizationId])

    const activeOrganization = organizations.find((organization) => organization.id === organizationId)
    const activeRole = String(activeOrganization?.role || '').toUpperCase()
    const isAdmin = activeRole === 'ADMIN'
    const isManager = activeRole === 'MANAGER' || isAdmin
    const managedTasks = useMemo(
        () => tasks.filter((task) => projects.some((project) => project.id === task.projectId && project.canManage)),
        [projects, tasks]
    )
    const pendingReviews = useMemo(
        () => managedTasks.filter((task) => task.status === 'IN_REVIEW' && task.review?.status === 'PENDING'),
        [managedTasks]
    )

    function openCreateTask() {
        setEditingTask(null)
        setTaskForm({
            ...EMPTY_FORM,
            projectId: projects.find((project) => project.canManage)?.id || '',
        })
        setShowTaskForm(true)
    }

    function openEditTask(task) {
        setEditingTask(task)
        setTaskForm({
            ...EMPTY_FORM,
            ...task,
            startDate: task.startDate ? new Date(task.startDate).toISOString().slice(0, 10) : '',
            dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '',
            progress: Number(task.progress || 0),
        })
        setShowTaskForm(true)
    }

    async function saveTask(event) {
        event.preventDefault()
        if (savingRef.current) return
        savingRef.current = true
        setSaving(true)
        setError('')
        setSuccessMessage('')
        try {
            const payload = {
                ...taskForm,
                startDate: taskForm.startDate || null,
                dueDate: taskForm.dueDate || null,
                teamId: taskForm.teamId || null,
                assigneeId: taskForm.assigneeId || null,
                progress: Number(taskForm.progress),
            }
            if (editingTask && taskForm.status === editingTask.status) {
                delete payload.status
            }
            if (editingTask) {
                await updateProjectTask(editingTask.id, payload)
            } else {
                await createProjectTask(payload)
            }
            setShowTaskForm(false)
            await loadDashboard(organizationId)
            setSuccessMessage(editingTask ? 'Task updated successfully.' : 'Task created successfully.')
        } catch (requestError) {
            setError(requestError.message || 'Unable to save this task.')
        } finally {
            savingRef.current = false
            setSaving(false)
        }
    }

    async function removeTask(task) {
        if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return
        setError('')
        try {
            await deleteProjectTask(task.id)
            setTasks((current) => current.filter((entry) => String(entry.id) !== String(task.id)))
        } catch (requestError) {
            setError(requestError.message || 'Unable to delete this task.')
        }
    }

    async function openReview(task) {
        setReviewTask(task)
        setReviewFeedback('')
        setReviewLoading(true)
        setReviewDetails({ comments: [], attachments: [], history: [] })
        try {
            const [comments, attachments, history] = await Promise.all([
                getProjectTaskComments(task.id),
                getProjectTaskAttachments(task.id),
                getProjectTaskReviews(task.id),
            ])
            setReviewDetails({
                comments: Array.isArray(comments) ? comments : [],
                attachments: Array.isArray(attachments) ? attachments : [],
                history: Array.isArray(history) ? history : [],
            })
        } catch (requestError) {
            setError(requestError.message || 'Unable to load task review details.')
        } finally {
            setReviewLoading(false)
        }
    }

    async function submitReview(action) {
        if (!reviewTask) return
        setReviewSaving(true)
        setError('')
        try {
            await reviewProjectTask(reviewTask.id, action, reviewFeedback)
            setReviewTask(null)
            await loadDashboard(organizationId)
        } catch (requestError) {
            setError(requestError.message || 'Unable to submit this review.')
        } finally {
            setReviewSaving(false)
        }
    }

    const overviewCards = [
        { label: 'Total Projects', value: overview?.projects, icon: '▰', tone: 'violet', detail: 'In your managed scope' },
        { label: 'Active Projects', value: overview?.activeProjects, icon: '✓', tone: 'green', detail: 'Currently in delivery' },
        { label: 'Teams', value: overview?.totalTeams, icon: '♧', tone: 'blue', detail: 'Assigned teams' },
        { label: 'Total Tasks', value: overview?.tasks, icon: '▣', tone: 'orange', detail: 'Across managed projects' },
        { label: 'Completed', value: overview?.completedTasks, icon: '✓', tone: 'mint', detail: 'Approved and delivered' },
    ]
    const weeklyData = overview?.weeklyTaskCompletion || []
    const maximumWeeklyTasks = Math.max(
        5,
        ...weeklyData.map((day) => Math.max(Number(day.completed || 0), Number(day.created || 0)))
    )
    const completedTrend = getTrendPoints(weeklyData, 'completed', maximumWeeklyTasks)
    const createdTrend = getTrendPoints(weeklyData, 'created', maximumWeeklyTasks)
    const completionRate = overview?.tasks
        ? Math.round((Number(overview.completedTasks || 0) / Number(overview.tasks)) * 100)
        : 0
    const recentNotifications = [...notifications]
        .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
        .slice(0, 4)
    const displayedTasks = tasksOnly ? managedTasks : managedTasks.slice(0, 30)
    const taskManagementSection = (
        <section className="panel manager-section manager-task-section">
            <div className="manager-section-heading">
                <div>
                    <h2>{tasksOnly ? 'All project tasks' : 'Project tasks'}</h2>
                    <p>Create, reassign, edit, and monitor tasks in projects you manage.</p>
                </div>
                <button className="primary-button" type="button" onClick={openCreateTask} disabled={!projects.some((project) => project.canManage)}>
                    Add task
                </button>
            </div>
            {managedTasks.length === 0 ? (
                <p className="manager-empty-copy">No project tasks found. Create a task to get started.</p>
            ) : (
                <div className="manager-task-table-wrap">
                    <table className="manager-task-table">
                        <thead>
                            <tr><th>Task</th><th>Project</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due</th><th>Progress</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            {displayedTasks.map((task) => (
                                <tr key={task.id}>
                                    <td><strong>{task.title}</strong></td>
                                    <td>{task.projectName}</td>
                                    <td>{formatStatus(task.status)}</td>
                                    <td>{task.priority}</td>
                                    <td>{members.find((member) => member.userId === task.assigneeId)?.name || 'Unassigned'}</td>
                                    <td>{formatDate(task.dueDate)}</td>
                                    <td>{Number(task.progress || 0)}%</td>
                                    <td className="manager-task-actions">
                                        <button type="button" onClick={() => openEditTask(task)}>Edit</button>
                                        <button className="danger-text" type="button" onClick={() => removeTask(task)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    )

    if (!loading && activeOrganization && !isManager) {
        return (
            <main className="feature-page">
                <section className="panel manager-empty">
                    <h1>Manager dashboard unavailable</h1>
                    <p>This workspace does not grant Manager or Admin access.</p>
                </section>
            </main>
        )
    }

    return (
        <main className="feature-page manager-dashboard">
            <header className="feature-heading">
                <div>
                    <p className="eyebrow">{isAdmin ? 'Administrator workspace' : 'Manager workspace'}</p>
                    <h1>{reviewsOnly
                        ? 'Task Reviews'
                        : tasksOnly
                            ? 'All Tasks'
                            : <><span className="manager-waving-hand" aria-hidden="true">👋</span> Welcome back{user?.name ? `, ${user.name}` : ''}!</>}</h1>
                    <p className="heading-subtitle">
                        {reviewsOnly
                            ? 'Review developer submissions for projects you are authorized to manage.'
                            : tasksOnly
                                ? 'Manage tasks across projects you are authorized to manage.'
                            : isAdmin
                                ? 'Global workspace oversight across projects, teams, and task reviews.'
                                : 'Manage the projects and teams assigned to you, track delivery, and review submissions.'}
                    </p>
                </div>
                <div className="manager-heading-actions">
                    {!reviewsOnly && !tasksOnly && <span className="manager-period-label"><span aria-hidden="true">▦</span> Last 7 days</span>}
                    {organizations.length > 1 && (
                        <label className="organization-select">
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
                    {reviewsOnly ? (
                        <button className="secondary-button" type="button" onClick={() => navigate('/manager')}>Back to dashboard</button>
                    ) : (
                        <button className="primary-button" type="button" onClick={openCreateTask} disabled={!projects.some((project) => project.canManage)}>
                            New task
                        </button>
                    )}
                </div>
            </header>

            {error && <p className="service-error" role="alert">{error}</p>}
            {successMessage && <p className="service-success" role="status">{successMessage}</p>}
            {loading && <p className="loading-state">Loading live workspace data…</p>}
            {!loading && !activeOrganization && (
                <section className="panel manager-empty">
                    <h2>No workspace available</h2>
                    <p>Create or join a workspace to manage projects and teams.</p>
                </section>
            )}

            {!loading && overview && !reviewsOnly && !tasksOnly && (
                <>
                    <section className="manager-stat-grid" aria-label="Manager dashboard metrics">
                        {overviewCards.map((card) => (
                            <article className={`manager-stat-card tone-${card.tone}`} key={card.label}>
                                <span className="manager-stat-icon" aria-hidden="true">{card.icon}</span>
                                <div className="manager-stat-copy">
                                    <strong>{Number(card.value || 0)}</strong>
                                    <span>{card.label}</span>
                                    <small>{card.detail}</small>
                                </div>
                            </article>
                        ))}
                    </section>

                    <div className="manager-dashboard-grid">
                        <section className="panel manager-section manager-project-overview">
                            <div className="manager-section-heading">
                                <div><h2>Projects Overview</h2><p>Progress across projects you manage.</p></div>
                                <button type="button" className="text-button" onClick={() => navigate('/projects')}>View all <span aria-hidden="true">→</span></button>
                            </div>
                            {(overview.projectStats || []).length === 0 ? (
                                <p className="manager-empty-copy">No authorized projects yet. Create a project to start tracking delivery.</p>
                            ) : (
                                <div className="manager-project-list">
                                    {overview.projectStats.slice(0, 3).map((project) => (
                                        <article className="manager-project-row" key={project.id}>
                                            <span className={`manager-project-icon priority-${String(project.priority || 'MEDIUM').toLowerCase()}`} aria-hidden="true">⌘</span>
                                            <div className="manager-project-copy">
                                                <strong>{project.name}</strong>
                                                <small>{project.description || project.teamName || 'Project workspace'}</small>
                                            </div>
                                            <span className={`manager-priority-pill priority-${String(project.priority || 'MEDIUM').toLowerCase()}`}>
                                                {formatPriority(project.priority)}
                                            </span>
                                            <div className="manager-project-progress">
                                                <b>{Number(project.progress || 0)}%</b>
                                                <div className="manager-progress-track">
                                                    <span style={{ width: `${Math.min(100, Number(project.progress || 0))}%` }} />
                                                </div>
                                            </div>
                                            <small className="manager-project-tasks">{project.completedTasks || 0} / {project.taskCount || 0}</small>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="panel manager-section manager-performance-panel">
                            <div className="manager-section-heading">
                                <div><h2>Team Performance</h2><p>Tasks created and completed this week.</p></div>
                            </div>
                            <div className="manager-chart-legend">
                                <span><i className="legend-completed" />Completed</span>
                                <span><i className="legend-created" />Created</span>
                            </div>
                            <svg className="manager-performance-chart" viewBox="0 0 320 150" role="img" aria-label="Weekly task creation and completion chart">
                                <title>Weekly tasks created and completed</title>
                                {[0, 1, 2, 3].map((step) => {
                                    const y = completedTrend.top + (completedTrend.plotHeight * step) / 3
                                    const value = Math.round(maximumWeeklyTasks * (1 - step / 3))
                                    return (
                                        <g key={step}>
                                            <line x1={completedTrend.left} y1={y} x2={completedTrend.right} y2={y} className="manager-chart-gridline" />
                                            <text x="19" y={y + 3} className="manager-chart-axis-label" textAnchor="end">{value}</text>
                                        </g>
                                    )
                                })}
                                <polygon points={completedTrend.points.length
                                    ? `${completedTrend.points[0].x},${completedTrend.bottom} ${completedTrend.pointsString} ${completedTrend.points[completedTrend.points.length - 1].x},${completedTrend.bottom}`
                                    : ''} className="manager-chart-area" />
                                <polyline points={createdTrend.pointsString} className="manager-chart-line line-created" />
                                <polyline points={completedTrend.pointsString} className="manager-chart-line line-completed" />
                                {createdTrend.points.map((point, index) => (
                                    <circle key={`created-${weeklyData[index]?.date || index}`} cx={point.x} cy={point.y} r="3" className="manager-chart-point point-created" />
                                ))}
                                {completedTrend.points.map((point, index) => (
                                    <circle key={`completed-${weeklyData[index]?.date || index}`} cx={point.x} cy={point.y} r="3.5" className="manager-chart-point point-completed" />
                                ))}
                                {weeklyData.map((day, index) => (
                                    <text key={day.date || index} x={completedTrend.points[index]?.x} y="145" className="manager-chart-day" textAnchor="middle">
                                        {formatWeekday(day.date)}
                                    </text>
                                ))}
                            </svg>
                        </section>

                        <section className="manager-progress-panel">
                            <div className="manager-progress-panel-heading"><span aria-hidden="true">🏆</span><strong>Team Progress</strong></div>
                            <strong className="manager-progress-percent">{completionRate}%</strong>
                            <p>Tasks completed</p>
                            <div className="manager-progress-track manager-progress-track-light">
                                <span style={{ width: `${completionRate}%` }} />
                            </div>
                            <div className="manager-progress-callout">
                                <strong><span aria-hidden="true">★</span> Keep it moving!</strong>
                                <p>{overview.completedTasks || 0} of {overview.tasks || 0} tasks are complete across your managed projects.</p>
                            </div>
                            <div className="manager-progress-facts">
                                <span><b>{overview.pendingTasks || 0}</b> To do</span>
                                <span><b>{overview.tasksUnderReview || 0}</b> In review</span>
                                <span><b>{overview.overdueTasks || 0}</b> Overdue</span>
                                <span><b>{overview.totalDevelopers || 0}</b> Developers</span>
                            </div>
                        </section>

                        <section className="panel manager-section manager-reviews-panel">
                            <div className="manager-section-heading">
                                <div><h2>Pending Task Reviews</h2><p>Developer submissions needing your decision.</p></div>
                                <button type="button" className="text-button" onClick={() => navigate('/manager/reviews')}>View all <span aria-hidden="true">→</span></button>
                            </div>
                            {pendingReviews.length === 0 ? (
                                <p className="manager-empty-copy">No tasks are waiting for review.</p>
                            ) : (
                                <div className="manager-review-list">
                                    {pendingReviews.slice(0, 3).map((task) => (
                                        <button className="manager-review-row" key={task.id} type="button" onClick={() => openReview(task)}>
                                            <span className={`manager-review-priority priority-${String(task.priority || 'MEDIUM').toLowerCase()}`} />
                                            <span className="manager-review-copy">
                                                <strong>{task.title}</strong>
                                                <small>{task.projectName} · Submitted by {task.review?.submitterName || 'Developer'}</small>
                                            </span>
                                            <span className={`manager-priority-pill priority-${String(task.priority || 'MEDIUM').toLowerCase()}`}>{formatPriority(task.priority)}</span>
                                            <small className="manager-relative-time">{formatRelativeTime(task.review?.submittedAt)}</small>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="panel manager-section manager-deadlines-panel">
                            <div className="manager-section-heading">
                                <div><h2>Upcoming Deadlines</h2><p>Tasks approaching their due date.</p></div>
                                <button type="button" className="text-button" onClick={() => navigate('/tasks')}>View all <span aria-hidden="true">→</span></button>
                            </div>
                            {(overview.deadlineTracking || []).length === 0 ? (
                                <p className="manager-empty-copy">No upcoming task deadlines.</p>
                            ) : (
                                <div className="manager-deadline-list">
                                    {overview.deadlineTracking.slice(0, 3).map((deadline) => (
                                        <div key={deadline.id} className="manager-deadline-row">
                                            <span className={`manager-deadline-icon ${formatDeadline(deadline.dueDate) === 'Today' ? 'is-today' : ''}`} aria-hidden="true">◷</span>
                                            <span className="manager-deadline-copy">
                                                <strong>{deadline.title}</strong>
                                                <small>{deadline.projectName}</small>
                                            </span>
                                            <span className={`manager-deadline-pill ${formatDeadline(deadline.dueDate) === 'Today' ? 'is-today' : ''}`}>
                                                {formatDeadline(deadline.dueDate)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="panel manager-section manager-activity-panel">
                            <div className="manager-section-heading">
                                <h2>Recent Activity</h2>
                                <button type="button" className="text-button" onClick={() => navigate('/notifications')}>View all <span aria-hidden="true">→</span></button>
                            </div>
                            {recentNotifications.length === 0 ? (
                                <p className="manager-empty-copy">No recent notifications.</p>
                            ) : (
                                <div className="manager-activity-list">
                                    {recentNotifications.map((notification, index) => (
                                        <article className="manager-activity-row" key={notification.id || `${notification.createdAt}-${index}`}>
                                            <span className={`manager-activity-dot activity-${index % 4}`} />
                                            <span className="manager-activity-copy">
                                                <strong>{getActivityTitle(notification)}</strong>
                                                <small>{notification.message || 'Workspace update'}</small>
                                            </span>
                                            <small className="manager-relative-time">{formatRelativeTime(notification.createdAt)}</small>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>

                    <div className="manager-secondary-grid">
                        <section className="panel manager-section">
                            <div className="manager-section-heading">
                                <div><h2>Team workload</h2><p>Authorized teams and their live task totals.</p></div>
                                <button type="button" className="text-button" onClick={() => navigate('/teams')}>Manage teams</button>
                            </div>
                            {(overview.teamStats || []).length === 0 ? (
                                <p className="manager-empty-copy">No teams have been created or assigned to you.</p>
                            ) : (
                                <div className="manager-team-grid">
                                    {overview.teamStats.map((team) => (
                                        <article className="manager-team-card" key={team.id}>
                                            <div className="manager-team-avatar">{team.name?.slice(0, 1).toUpperCase() || 'T'}</div>
                                            <div><strong>{team.name}</strong><small>{team.developers} developers · {team.activeTasks} active · {team.completedTasks} completed</small></div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>
                        <section className="panel manager-section">
                            <div className="manager-section-heading">
                                <div><h2>Developer workload</h2><p>Assigned tasks, delivery, and overdue work.</p></div>
                            </div>
                            {(overview.developerWorkload || []).length === 0 ? (
                                <p className="manager-empty-copy">No developers have tasks in your managed projects.</p>
                            ) : (
                                <div className="manager-workload-list">
                                    {overview.developerWorkload.slice(0, 5).map((developer) => (
                                        <div className="manager-workload-row" key={developer.userId}>
                                            <span className="manager-person-avatar">{developer.name?.slice(0, 1).toUpperCase() || 'D'}</span>
                                            <div className="manager-workload-person"><strong>{developer.name}</strong><small>{developer.assignedProjects} projects · {developer.inProgressTasks} active · {developer.completedTasks} completed</small></div>
                                            <b className={Number(developer.overdueTasks) > 0 ? 'is-overdue' : ''}>{developer.overdueTasks} overdue</b>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>

                    {taskManagementSection}
                </>
            )}

            {!loading && tasksOnly && activeOrganization && taskManagementSection}

            {!loading && overview && reviewsOnly && (
                <section className="panel manager-section manager-review-page">
                    <div className="manager-section-heading">
                        <div>
                            <h2>Submissions awaiting review</h2>
                            <p>Only reviews in projects you can manage are shown here.</p>
                        </div>
                        <span className="manager-review-count">{pendingReviews.length}</span>
                    </div>
                    {pendingReviews.length === 0 ? (
                        <p className="manager-empty-copy">No developer submissions are waiting for your review.</p>
                    ) : (
                        <div className="manager-review-list">
                            {pendingReviews.map((task) => (
                                <button className="manager-review-row" key={task.id} type="button" onClick={() => openReview(task)}>
                                    <span className="manager-review-dot" />
                                    <span>
                                        <strong>{task.title}</strong>
                                        <small>{task.projectName} · {task.review?.submitterName || 'Developer'} · submitted {formatDate(task.review?.submittedAt)}</small>
                                    </span>
                                    <b>Open review</b>
                                </button>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {showTaskForm && (
                <div className="manager-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowTaskForm(false)}>
                    <form className="manager-modal" onSubmit={saveTask}>
                        <div className="manager-modal-heading">
                            <div><p className="eyebrow">Task management</p><h2>{editingTask ? 'Edit task' : 'Create project task'}</h2></div>
                            <button type="button" className="icon-button" onClick={() => setShowTaskForm(false)} aria-label="Close">×</button>
                        </div>
                        <label>Title<input required value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} /></label>
                        <label>Description<textarea rows={3} value={taskForm.description || ''} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} /></label>
                        <div className="manager-form-grid">
                            <label>Project<select required value={taskForm.projectId} onChange={(event) => {
                                const projectId = event.target.value
                                const project = projects.find((item) => item.id === projectId)
                                setTaskForm({ ...taskForm, projectId, teamId: project?.teamId || '' })
                            }}>
                                <option value="">Select a managed project</option>
                                {projects.filter((project) => project.canManage).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                            </select></label>
                            <label>Developer<select value={taskForm.assigneeId} onChange={(event) => setTaskForm({ ...taskForm, assigneeId: event.target.value })}>
                                <option value="">Unassigned</option>
                                {members.map((member) => <option key={member.userId} value={member.userId}>{member.name || member.email}</option>)}
                            </select></label>
                            <label>Team<select value={taskForm.teamId} onChange={(event) => setTaskForm({ ...taskForm, teamId: event.target.value })}>
                                <option value="">No team</option>
                                {teams.filter((team) => team.canManage).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                            </select></label>
                            <label>Priority<select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}>
                                <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Critical</option>
                            </select></label>
                            <label>Status<select
                                value={taskForm.status}
                                disabled={editingTask?.status === 'IN_REVIEW'}
                                onChange={(event) => setTaskForm({ ...taskForm, status: event.target.value })}
                            >
                                <option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option>
                                {editingTask && <option value="COMPLETED">Completed</option>}
                                {editingTask?.status === 'IN_REVIEW' && <option value="IN_REVIEW">In review</option>}
                            </select></label>
                            <label>Progress (%)<input type="number" min="0" max="100" step="1" value={taskForm.progress} onChange={(event) => setTaskForm({ ...taskForm, progress: event.target.value })} /></label>
                            <label>Start date<input type="date" value={taskForm.startDate} onChange={(event) => setTaskForm({ ...taskForm, startDate: event.target.value })} /></label>
                            <label>Due date<input type="date" min={taskForm.startDate || undefined} value={taskForm.dueDate} onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })} /></label>
                        </div>
                        <div className="manager-modal-actions">
                            <button type="button" className="secondary-button" onClick={() => setShowTaskForm(false)}>Cancel</button>
                            <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : editingTask ? 'Save changes' : 'Create task'}</button>
                        </div>
                    </form>
                </div>
            )}

            {reviewTask && (
                <div className="manager-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setReviewTask(null)}>
                    <section className="manager-modal manager-review-modal">
                        <div className="manager-modal-heading">
                            <div><p className="eyebrow">Task review</p><h2>{reviewTask.title}</h2></div>
                            <button type="button" className="icon-button" onClick={() => setReviewTask(null)} aria-label="Close">×</button>
                        </div>
                        <p className="manager-review-context">{reviewTask.projectName} · {members.find((member) => member.userId === reviewTask.assigneeId)?.name || 'Developer'} · submitted {formatDate(reviewTask.review?.submittedAt)}</p>
                        <p>{reviewTask.description || 'No task description provided.'}</p>
                        <div className="manager-submission-details">
                            <strong>Developer completion details</strong>
                            <p>{reviewTask.review?.submissionDetails || 'No additional completion details were submitted.'}</p>
                        </div>
                        {reviewLoading ? <p className="loading-state">Loading comments and attachments…</p> : (
                            <div className="manager-review-meta">
                                <span>{reviewDetails.comments.length} comment{reviewDetails.comments.length === 1 ? '' : 's'}</span>
                                <span>{reviewDetails.attachments.length} attachment{reviewDetails.attachments.length === 1 ? '' : 's'}</span>
                            </div>
                        )}
                        {reviewDetails.history.length > 0 && (
                            <div className="manager-review-history">
                                <strong>Previous review history</strong>
                                {reviewDetails.history.map((entry) => (
                                    <p key={entry.id}>{formatStatus(entry.status)} · {formatDate(entry.reviewedAt || entry.submittedAt)}{entry.feedback ? ` — ${entry.feedback}` : ''}</p>
                                ))}
                            </div>
                        )}
                        <label>Review feedback<textarea rows={3} value={reviewFeedback} onChange={(event) => setReviewFeedback(event.target.value)} placeholder="Add feedback for the developer (required for rejection or requested changes)." /></label>
                        <div className="manager-modal-actions manager-review-actions">
                            <button type="button" className="secondary-button" disabled={reviewSaving} onClick={() => submitReview('REQUEST_CHANGES')}>Request changes</button>
                            <button type="button" className="danger-button" disabled={reviewSaving} onClick={() => submitReview('REJECT')}>Reject</button>
                            <button type="button" className="primary-button" disabled={reviewSaving} onClick={() => submitReview('APPROVE')}>{reviewSaving ? 'Submitting…' : 'Approve'}</button>
                        </div>
                    </section>
                </div>
            )}
        </main>
    )
}
