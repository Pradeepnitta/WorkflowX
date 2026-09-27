import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTask as createTaskRequest, getTasks, updateTaskStatus } from '../services/taskService.js'
import { getSocket } from '../services/socketService.js'
import { getOrganizations, getOrganizationMembers } from '../services/organizationService.js'
import { getProjects } from '../services/projectService.js'
import '../App.css'

const columns = ['Todo', 'In progress', 'Review', 'Done']

export default function DashboardOverviewPage() {
    const navigate = useNavigate()
    const [tasks, setTasks] = useState([])
    const [projectsCount, setProjectsCount] = useState(0)
    const [membersCount, setMembersCount] = useState(0)
    const [filter, setFilter] = useState('All tasks')
    const [showTaskForm, setShowTaskForm] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [draggedTaskId, setDraggedTaskId] = useState(null)
    const [dragOverColumn, setDragOverColumn] = useState(null)

    useEffect(() => {
        getTasks()
            .then((loadedTasks) => setTasks(loadedTasks || []))
            .catch(() => setError('The task service is unavailable. Start the backend and refresh.'))
            .finally(() => setIsLoading(false))

        getOrganizations()
            .then(async (orgs) => {
                if (orgs && orgs.length > 0) {
                    const orgId = orgs[0].id
                    try {
                        const [pList, mList] = await Promise.all([
                            getProjects(orgId).catch(() => []),
                            getOrganizationMembers(orgId).catch(() => []),
                        ])
                        setProjectsCount(pList?.length || 0)
                        setMembersCount(mList?.length || 1)
                    } catch {
                        // fallback
                    }
                }
            })
            .catch(() => undefined)

        const socket = getSocket()
        if (socket) {
            function handleTaskCreated(newTask) {
                setTasks((prev) => [newTask, ...prev.filter((t) => t.id !== newTask.id)])
            }
            function handleTaskUpdated(updatedTask) {
                setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? { ...t, ...updatedTask } : t)))
            }
            socket.on('task:created', handleTaskCreated)
            socket.on('task:updated', handleTaskUpdated)
            return () => {
                socket.off('task:created', handleTaskCreated)
                socket.off('task:updated', handleTaskUpdated)
            }
        }
    }, [])

    const visibleTasks = useMemo(() => {
        if (filter === 'All tasks') return tasks
        return tasks.filter((task) => task.status === filter)
    }, [filter, tasks])

    const completedTasksCount = useMemo(
        () => tasks.filter((t) => t.status === 'Done' || t.status === 'COMPLETED').length,
        [tasks]
    )
    const openTasksCount = useMemo(
        () => tasks.filter((t) => t.status !== 'Done' && t.status !== 'COMPLETED').length,
        [tasks]
    )

    async function handleDropOnColumn(targetColumn) {
        if (!draggedTaskId || dragOverColumn !== targetColumn) return
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
        setDraggedTaskId(null)
        setDragOverColumn(null)

        try {
            await updateTaskStatus(draggedTaskId, targetColumn)
        } catch {
            // Rollback on failure
            setTasks((prev) =>
                prev.map((t) => (t.id === draggedTaskId ? { ...t, status: currentTask.status } : t))
            )
        }
    }

    async function createTask(event) {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        try {
            const task = await createTaskRequest({ title: form.get('title'), priority: form.get('priority') })
            setTasks((currentTasks) => [task, ...currentTasks])
            setShowTaskForm(false)
        } catch {
            setError('That task could not be created. Please try again.')
        }
    }


    return (
        <>
            <section className="page-heading">
                <div>
                    <p className="eyebrow">Overview</p>
                    <h1>Good day, Team <span className="wave">✦</span></h1>
                    <p className="heading-subtitle">Here is what is happening across your workspace today.</p>
                </div>
                <button className="primary-button" onClick={() => setShowTaskForm(true)}>
                    <span>+</span> New task
                </button>
            </section>

            <section className="stats-grid" aria-label="Workspace statistics">
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/projects')}>
                    <span className="stat-icon coral">▣</span>
                    <div>
                        <p>Active projects</p>
                        <strong>{projectsCount}</strong>
                        <small className="neutral">{projectsCount === 1 ? '1 active initiative' : `${projectsCount} active initiatives`}</small>
                    </div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/tasks')}>
                    <span className="stat-icon yellow">✓</span>
                    <div>
                        <p>Tasks completed</p>
                        <strong>{completedTasksCount}</strong>
                        <small className={completedTasksCount > 0 ? 'positive' : 'neutral'}>
                            {tasks.length > 0 ? `${Math.round((completedTasksCount / tasks.length) * 100)}% completed` : '0 completed'}
                        </small>
                    </div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/tasks')}>
                    <span className="stat-icon blue">◷</span>
                    <div>
                        <p>Due this week</p>
                        <strong>{openTasksCount}</strong>
                        <small className="neutral">{openTasksCount === 1 ? '1 task in flight' : `${openTasksCount} tasks in flight`}</small>
                    </div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/members')}>
                    <span className="stat-icon green">♧</span>
                    <div>
                        <p>Team members</p>
                        <strong>{membersCount}</strong>
                        <small className="neutral">{membersCount === 1 ? '1 active member' : `${membersCount} active members`}</small>
                    </div>
                </div>
            </section>

            <section className="workspace-grid">
                <div className="board-panel panel">
                    <div className="panel-heading">
                        <div>
                            <h2>My tasks</h2>
                            <p>Keep your work moving forward.</p>
                        </div>
                        <button className="text-button" onClick={() => navigate('/tasks')}>
                            View all <span>→</span>
                        </button>
                    </div>

                    <div className="task-toolbar">
                        <div className="filter-tabs">
                            {['All tasks', 'Todo', 'In progress', 'Review'].map((item) => (
                                <button
                                    key={item}
                                    className={filter === item ? 'selected' : ''}
                                    onClick={() => setFilter(item)}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                        <button className="filter-button" onClick={() => navigate('/tasks')}>≡ Filter</button>
                    </div>

                    {error && <p className="service-error">{error}</p>}
                    {isLoading && <p className="loading-state">Loading tasks...</p>}

                    <div className="kanban">
                        {columns.map((column) => (
                            <div
                                className={`kanban-column ${dragOverColumn === column ? 'drag-over' : ''}`}
                                key={column}
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
                                    background: dragOverColumn === column ? 'rgba(238, 120, 94, 0.08)' : 'transparent',
                                    borderRadius: '10px',
                                    transition: 'background 0.2s ease',
                                    padding: '6px',
                                }}
                            >
                                <div className="column-title">
                                    <span>{column}</span>
                                    <b>{visibleTasks.filter((task) => task.status === column).length}</b>
                                </div>
                                {visibleTasks
                                    .filter((task) => task.status === column)
                                    .map((task) => (
                                        <article
                                            className={`task-card ${draggedTaskId === task.id ? 'is-dragging' : ''}`}
                                            key={task.id}
                                            draggable
                                            onDragStart={() => setDraggedTaskId(task.id)}
                                            onDragEnd={() => {
                                                setDraggedTaskId(null)
                                                setDragOverColumn(null)
                                            }}
                                            style={{
                                                cursor: 'grab',
                                                opacity: draggedTaskId === task.id ? 0.45 : 1,
                                                transform: draggedTaskId === task.id ? 'scale(0.98)' : 'none',
                                            }}
                                            onClick={() => navigate('/tasks')}
                                            title="Drag to change status or click to view details"
                                        >
                                            <div className="task-card-top">
                                                <span className={`priority ${(task.priority || 'medium').toLowerCase()}`}>
                                                    {task.priority || 'Medium'}
                                                </span>
                                                <span style={{ fontSize: '11px', color: '#9ca3af', cursor: 'grab' }}>⠿</span>
                                            </div>
                                            <h3>{task.title}</h3>
                                            <p className="task-project">{task.project || 'General'}</p>
                                            <div className="task-meta">
                                                <span className="mini-avatar">{task.assignee || 'ME'}</span>
                                                <span className={task.due === 'Today' ? 'due-today' : ''}>{task.due || 'Today'}</span>
                                            </div>
                                        </article>
                                    ))}
                                {!isLoading && visibleTasks.filter((task) => task.status === column).length === 0 && (
                                    <p className="empty-column">Nothing here yet</p>
                                )}
                            </div>
                        ))}
                    </div>

                </div>

                <aside className="activity-panel panel">
                    <div className="panel-heading">
                        <div>
                            <h2>Recent activity</h2>
                            <p>Latest updates from your team.</p>
                        </div>
                        <button className="icon-button" onClick={() => navigate('/admin')}>•••</button>
                    </div>

                    <div className="activity-list">
                        {tasks.length > 0 ? (
                            tasks.slice(0, 4).map((task) => (
                                <div key={task.id} className="activity-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/tasks')}>
                                    <span className="activity-avatar coral-bg">{task.assignee ? task.assignee.slice(0, 2).toUpperCase() : 'TK'}</span>
                                    <p><strong>{task.assignee || 'Member'}</strong> updated <b>{task.title}</b> to {task.status}<small>{task.due || 'Recently'}</small></p>
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#6b7280' }}>
                                <p style={{ fontSize: '13px', margin: 0, fontWeight: 600 }}>No recent activity yet</p>
                                <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>Updates will appear here as your team creates tasks and updates workflows.</p>
                            </div>
                        )}
                    </div>
                    <button className="activity-footer" onClick={() => navigate('/admin')}>View activity log <span>→</span></button>
                </aside>
            </section>

            {showTaskForm && (
                <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowTaskForm(false)}>
                    <form className="task-form" onSubmit={createTask}>
                        <div className="modal-heading">
                            <div>
                                <p className="eyebrow">New item</p>
                                <h2>Create a task</h2>
                            </div>
                            <button type="button" className="close-button" onClick={() => setShowTaskForm(false)} aria-label="Close">×</button>
                        </div>
                        <label>
                            Task title
                            <input name="title" required placeholder="What needs to be done?" autoFocus />
                        </label>
                        <label>
                            Priority
                            <select name="priority" defaultValue="Medium">
                                <option>Low</option>
                                <option>Medium</option>
                                <option>High</option>
                            </select>
                        </label>
                        <div className="form-actions">
                            <button type="button" className="secondary-button" onClick={() => setShowTaskForm(false)}>
                                Cancel
                            </button>
                            <button className="primary-button" type="submit">
                                Create task
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>
    )
}
