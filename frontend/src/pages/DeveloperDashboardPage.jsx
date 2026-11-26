import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
    submitProjectTaskForReview,
    updateProjectTask,
} from '../services/projectService.js'
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

async function fetchDeveloperWorkspace(organizationId) {
    const [loadedProjects, loadedTeams, loadedMembers, loadedNotifications] = await Promise.all([
        getProjects(organizationId),
        getTeams(organizationId),
        getOrganizationMembers(organizationId),
        getNotifications(),
    ])
    const projects = (Array.isArray(loadedProjects) ? loadedProjects : [])
        .filter((project) => project.isMember)
    const taskGroups = await Promise.all(projects.map(async (project) => ({
        project,
        tasks: await getProjectTasks(project.id),
    })))
    const tasks = taskGroups.flatMap(({ project, tasks: projectTasks }) =>
        (Array.isArray(projectTasks) ? projectTasks : []).map((task) => ({
            ...task,
            projectName: project.name,
        }))
    )

    return {
        projects,
        teams: Array.isArray(loadedTeams) ? loadedTeams : [],
        members: Array.isArray(loadedMembers) ? loadedMembers : [],
        tasks,
        notifications: Array.isArray(loadedNotifications)
            ? loadedNotifications
            : Array.isArray(loadedNotifications?.data) ? loadedNotifications.data : [],
    }
}

export default function DeveloperDashboardPage({ view = 'overview' }) {
    const navigate = useNavigate()
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
    const [progressDraft, setProgressDraft] = useState(0)
    const [submissionDetails, setSubmissionDetails] = useState('')
    const [savingAction, setSavingAction] = useState(false)

    const refreshWorkspace = useCallback(async (orgId) => {
        const data = await fetchDeveloperWorkspace(orgId)
        setProjects(data.projects)
        setTeams(data.teams)
        setMembers(data.members)
        setTasks(data.tasks)
        setNotifications(data.notifications)
        return data
    }, [])

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
                setError('')
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
    const pendingTasks = assignedTasks.filter((task) => task.status !== 'COMPLETED')
    const overdueTasks = assignedTasks.filter(isOverdue)
    const upcomingDeadlines = useMemo(
        () => pendingTasks
            .filter((task) => task.dueDate)
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
    const taskCounts = Object.fromEntries(TASK_COLUMNS.map(({ status }) => [
        status,
        assignedTasks.filter((task) => task.status === status).length,
    ]))
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

    async function openTask(task) {
        setSelectedTask(task)
        setProgressDraft(Number(task.progress || 0))
        setCommentDraft('')
        setSubmissionDetails('')
        setDetailsLoading(true)
        setComments([])
        setAttachments([])
        setReviewHistory([])
        try {
            const [taskComments, taskAttachments, taskReviews] = await Promise.all([
                getProjectTaskComments(task.id),
                getProjectTaskAttachments(task.id),
                getProjectTaskReviews(task.id),
            ])
            setComments(Array.isArray(taskComments) ? taskComments : [])
            setAttachments(Array.isArray(taskAttachments) ? taskAttachments : [])
            setReviewHistory(Array.isArray(taskReviews) ? taskReviews : [])
        } catch (requestError) {
            setError(requestError.message || 'Unable to load task details.')
        } finally {
            setDetailsLoading(false)
        }
    }

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
            await submitProjectTaskForReview(selectedTask.id, submissionDetails.trim())
            const data = await refreshWorkspace(organizationId)
            const updated = data.tasks.find((task) => String(task.id) === String(selectedTask.id))
            if (updated) setSelectedTask(updated)
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

    function managerName(task) {
        const manager = members.find((member) => String(member.userId) === String(task.createdById))
        return manager?.name || manager?.email || 'Project manager'
    }

    function taskCard(task) {
        return (
            <button className="developer-task-card" key={task.id} type="button" onClick={() => openTask(task)}>
                <span className={`developer-status status-${String(task.status).toLowerCase()}`}>{statusLabel(task.status)}</span>
                <strong>{task.title}</strong>
                <span className="developer-task-project">{task.projectName} · {task.priority}</span>
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

            {error && <p className="service-error" role="alert">{error}</p>}
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
                        <div className="developer-kanban" aria-label="My tasks by status">
                            {TASK_COLUMNS.map((column) => {
                                const columnTasks = assignedTasks.filter((task) => task.status === column.status)
                                return (
                                    <section className="panel developer-kanban-column" key={column.status}>
                                        <div className="developer-section-heading">
                                            <h2>{column.label}</h2><span>{columnTasks.length}</span>
                                        </div>
                                        {columnTasks.length === 0
                                            ? <p className="developer-empty-copy">No tasks</p>
                                            : <div className="developer-task-list">{columnTasks.map(taskCard)}</div>}
                                    </section>
                                )
                            })}
                        </div>
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
                                                <span>Priority <b>{project.priority}</b></span>
                                                <span>Deadline <b>{formatDate(project.dueDate)}</b></span>
                                                <span>Tasks <b>{complete} / {total} completed</b></span>
                                            </div>
                                            <div className="developer-progress-track"><span style={{ width: `${progress}%` }} /></div>
                                            <small>{progress}% complete</small>
                                        </article>
                                    )
                                })}
                        </section>
                    )}

                    {view === 'team' && (
                        <section className="developer-team-grid">
                            {teams.length === 0
                                ? <div className="panel developer-empty-copy">You are not currently assigned to a team.</div>
                                : teams.map((team) => (
                                    <article className="panel developer-team-card" key={team.id}>
                                        <div className="developer-section-heading">
                                            <div><h2>{team.name}</h2><p>{team.description || 'Team workspace'}</p></div>
                                        </div>
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
                                        <div className="developer-team-projects">
                                            <strong>Team projects</strong>
                                            {(team.projects || []).length === 0
                                                ? <small>No projects assigned.</small>
                                                : team.projects.map((project) => <span key={project.id}>{project.name}</span>)}
                                        </div>
                                    </article>
                                ))}
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
                            <span>{selectedTask.projectName}</span><span>{selectedTask.priority}</span>
                            <span>Manager: {managerName(selectedTask)}</span>
                            <span>Due {formatDate(selectedTask.dueDate)}</span>
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
                                        <a className="developer-attachment-row" key={attachment.id} href={attachment.fileUrl || undefined} target={attachment.fileUrl ? '_blank' : undefined} rel={attachment.fileUrl ? 'noreferrer' : undefined}>
                                            {attachment.fileName}
                                        </a>
                                    ))}
                                </section>
                                <section className="developer-detail-section">
                                    <h3>Comments</h3>
                                    {comments.length === 0 ? <p className="developer-empty-copy">No comments yet.</p> : (
                                        <div className="developer-comments">
                                            {comments.map((comment) => (
                                                <article className="developer-comment" key={comment.id}>
                                                    <strong>{comment.author?.name || (String(comment.authorId) === String(user?.id) ? 'You' : 'Team member')}</strong>
                                                    <p>{comment.content}</p>
                                                    <small>{formatDate(comment.createdAt)}</small>
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
