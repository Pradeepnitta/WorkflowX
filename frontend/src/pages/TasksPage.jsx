import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createTask, getTasks, updateTaskStatus, updateTaskDetails, deleteTask } from '../services/taskService.js'
import { getOrganizations, getOrganizationMembers } from '../services/organizationService.js'
import { getProjects } from '../services/projectService.js'
import { getSocket } from '../services/socketService.js'
import { getCurrentUser } from '../services/authService.js'
import '../App.css'

const STATUSES = ['All tasks', 'Todo', 'In progress', 'Review', 'Done']
const KANBAN_COLUMNS = ['Todo', 'In progress', 'Review', 'Done']
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

export default function TasksPage() {
    const [searchParams, setSearchParams] = useSearchParams()
    const projectQuery = searchParams.get('project')

    const [tasks, setTasks] = useState([])
    const [organizations, setOrganizations] = useState([])
    const [organizationId, setOrganizationId] = useState('')
    const [members, setMembers] = useState([])
    const [projects, setProjects] = useState([])
    const [currentUser, setCurrentUser] = useState(null)

    // View mode: Kanban Board vs Table View
    const [viewMode, setViewMode] = useState('kanban')

    // Drag-and-Drop state
    const [draggedTaskId, setDraggedTaskId] = useState(null)
    const [dragOverCol, setDragOverCol] = useState(null)

    // Filter & search
    const [filter, setFilter] = useState('All tasks')
    const [assigneeFilter, setAssigneeFilter] = useState('ALL')
    const [priorityFilter, setPriorityFilter] = useState('ALL')
    const [projectFilter, setProjectFilter] = useState(projectQuery || 'ALL')
    const [searchQuery, setSearchQuery] = useState('')
    const [onlyMyTasks, setOnlyMyTasks] = useState(false)

    // Task Creation Form
    const [title, setTitle] = useState('')
    const [selectedProject, setSelectedProject] = useState('')
    const [selectedAssignee, setSelectedAssignee] = useState('')
    const [priority, setPriority] = useState('High')
    const [dueDate, setDueDate] = useState('')
    const [suggestionReason, setSuggestionReason] = useState('')
    const [assigningSuggestionId, setAssigningSuggestionId] = useState(null)
    const [assigneeForSuggestion, setAssigneeForSuggestion] = useState('')

    // Selected Task Modal State
    const [activeTask, setActiveTask] = useState(null)
    const [commentsMap, setCommentsMap] = useState({})
    const [attachmentsMap, setAttachmentsMap] = useState({})
    const [newAttachmentName, setNewAttachmentName] = useState('')
    const [newComment, setNewComment] = useState('')
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [editingTitleText, setEditingTitleText] = useState('')

    // Rich Attachment Preview Modal State
    const [previewFile, setPreviewFile] = useState(null)
    const [copyCodeSuccess, setCopyCodeSuccess] = useState(false)

    const [isLoading, setIsLoading] = useState(true)
    const [isCreating, setIsCreating] = useState(false)
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')

    // Load tasks, organizations & current user
    useEffect(() => {
        setIsLoading(true)
        getCurrentUser().then(setCurrentUser).catch(() => null)
        Promise.all([
            getTasks().catch(() => []),
            getOrganizations().catch(() => []),
        ])
            .then(([loadedTasks, loadedOrgs]) => {
                setTasks(Array.isArray(loadedTasks) ? loadedTasks : [])
                const orgList = Array.isArray(loadedOrgs) ? loadedOrgs : []
                setOrganizations(orgList)
                if (orgList.length > 0) {
                    setOrganizationId(orgList[0].id)
                }
            })
            .catch((requestError) => setError(requestError.message))
            .finally(() => setIsLoading(false))
    }, [])

    // Real-time Socket.IO Listeners
    useEffect(() => {
        const socket = getSocket()
        if (!socket) return

        function handleTaskCreated(newTask) {
            setTasks((prev) => [newTask, ...prev.filter((t) => t.id !== newTask.id)])
        }

        function handleTaskUpdated(updatedTask) {
            setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? { ...t, ...updatedTask } : t)))
            if (activeTask && activeTask.id === updatedTask.id) {
                setActiveTask((prev) => ({ ...prev, ...updatedTask }))
            }
        }

        function handleTaskDeleted(payload) {
            const delId = payload?.id || payload?.taskId
            setTasks((prev) => prev.filter((t) => t.id !== delId && String(t.id) !== String(delId)))
            if (activeTask && (activeTask.id === delId || String(activeTask.id) === String(delId))) {
                setActiveTask(null)
            }
        }

        function handleCommentCreated(payload) {
            if (activeTask && String(activeTask.id) === String(payload?.taskId)) {
                const newCmt = {
                    id: payload.comment?.id || Date.now(),
                    author: payload.user?.email || 'Team Member',
                    text: payload.comment?.content || payload.comment?.text || '',
                    time: 'Just now',
                }
                setCommentsMap((prev) => ({
                    ...prev,
                    [payload.taskId]: [...(prev[payload.taskId] || []), newCmt],
                }))
            }
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
    }, [activeTask])

    useEffect(() => {
        if (!organizationId) {
            setMembers([])
            setProjects([])
            return
        }
        Promise.all([
            getOrganizationMembers(organizationId).catch(() => []),
            getProjects(organizationId).catch(() => []),
        ])
            .then(([loadedMembers, loadedProjects]) => {
                const mList = Array.isArray(loadedMembers) ? loadedMembers : []
                const pList = Array.isArray(loadedProjects) ? loadedProjects : []
                setMembers(mList)
                setProjects(pList)
                if (pList.length > 0 && !selectedProject) {
                    setSelectedProject(pList[0].name)
                }
            })
            .catch(() => null)
    }, [organizationId, selectedProject])

    useEffect(() => {
        if (projectQuery) {
            setProjectFilter(projectQuery)
            setSelectedProject(projectQuery)
        }
    }, [projectQuery])

    const pendingSuggestions = useMemo(() => {
        return tasks.filter((t) => t.isSuggestion && t.approvalStatus === 'PENDING')
    }, [tasks])

    const myPendingSuggestions = useMemo(() => {
        const myName = (currentUser?.name || currentUser?.email || '').toLowerCase()
        return pendingSuggestions.filter((t) => {
            const by = (t.suggestedBy || '').toLowerCase()
            return by && (by.includes(myName) || myName.includes(by))
        })
    }, [pendingSuggestions, currentUser])

    const visibleTasks = useMemo(() => {
        return tasks.filter((task) => {
            if (task.isSuggestion && task.approvalStatus === 'PENDING') return false
            if (task.approvalStatus === 'REJECTED') return false

            const matchesStatus = filter === 'All tasks' || task.status === filter
            const matchesAssignee = assigneeFilter === 'ALL' || task.assignee === assigneeFilter
            const matchesPriority = priorityFilter === 'ALL' || (task.priority || '').toLowerCase() === priorityFilter.toLowerCase()
            const matchesProject = projectFilter === 'ALL' || (task.project || '').toLowerCase().includes(projectFilter.toLowerCase())
            const matchesSearch = !searchQuery.trim() || (task.title || '').toLowerCase().includes(searchQuery.toLowerCase().trim())

            const matchesOnlyMy = !onlyMyTasks || (
                task.assignee && (
                    task.assignee.toLowerCase().includes((currentUser?.name || '').toLowerCase()) ||
                    task.assignee.toLowerCase().includes((currentUser?.email || '').toLowerCase()) ||
                    task.assignee === 'You'
                )
            )

            return matchesStatus && matchesAssignee && matchesPriority && matchesProject && matchesOnlyMy && matchesSearch
        })
    }, [filter, assigneeFilter, priorityFilter, projectFilter, onlyMyTasks, searchQuery, currentUser, tasks])

    // Status counts for Manager/Developer tracking
    const statusCounts = useMemo(() => {
        const boardTasks = tasks.filter((t) => (!t.isSuggestion || t.approvalStatus === 'APPROVED') && t.approvalStatus !== 'REJECTED')
        const todo = boardTasks.filter((t) => t.status === 'Todo').length
        const inProgress = boardTasks.filter((t) => t.status === 'In progress').length
        const review = boardTasks.filter((t) => t.status === 'Review').length
        const done = boardTasks.filter((t) => t.status === 'Done').length
        const total = todo + inProgress + review + done
        const completionRate = total > 0 ? Math.round((done / total) * 100) : 0

        return {
            todo,
            inProgress,
            review,
            done,
            total,
            completionRate,
            pendingSuggestions: pendingSuggestions.length,
        }
    }, [tasks, pendingSuggestions])

    // Current user membership and assignment authorization check
    const currentMembership = useMemo(() => {
        if (!currentUser || !members) return null
        return members.find((m) => m.email === currentUser.email || m.userId === currentUser.id)
    }, [currentUser, members])

    const canAssign = useMemo(() => {
        if (!currentUser) return false
        const role = (currentMembership?.role || currentUser.role || '').toUpperCase()
        return role === 'ADMIN' || role === 'MANAGER'
    }, [currentUser, currentMembership])

    async function submit(event) {
        event.preventDefault()
        if (!title.trim()) return
        setIsCreating(true)
        setError('')
        setSuccessMessage('')
        try {
            if (canAssign) {
                const task = await createTask({
                    title: title.trim(),
                    priority,
                    project: selectedProject || 'General',
                    assignee: selectedAssignee || 'Unassigned',
                    due: dueDate ? new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Next week',
                    isSuggestion: false,
                    approvalStatus: 'APPROVED',
                })
                setTasks((currentTasks) => [task, ...currentTasks])
                setTitle('')
                setDueDate('')
                setSuccessMessage(`✓ Official task created and assigned to ${selectedAssignee || 'Unassigned'} with ${priority} priority.`)
            } else {
                const task = await createTask({
                    title: title.trim(),
                    priority,
                    project: selectedProject || 'General',
                    assignee: 'Unassigned',
                    due: dueDate ? new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Next week',
                    isSuggestion: true,
                    approvalStatus: 'PENDING',
                    suggestedBy: currentUser?.name || currentUser?.email || 'Developer',
                    suggestionReason: suggestionReason.trim() || 'Missing requirement identified during implementation',
                })
                setTasks((currentTasks) => [task, ...currentTasks])
                setTitle('')
                setDueDate('')
                setSuggestionReason('')
                setSuccessMessage(`💡 Task proposal submitted to Manager for review & assignment!`)
            }
        } catch (requestError) {
            setError(requestError.message)
        } finally {
            setIsCreating(false)
        }
    }

    async function handleApproveSuggestion(suggestionTask, targetAssignee) {
        if (!targetAssignee) {
            setError('Please select an assignee before approving the task.')
            return
        }
        setError('')
        try {
            const updated = await updateTaskDetails(suggestionTask.id, {
                isSuggestion: false,
                approvalStatus: 'APPROVED',
                assignee: targetAssignee,
                status: 'Todo',
            })
            setTasks((prev) => prev.map((t) => (t.id === suggestionTask.id ? { ...t, ...updated, isSuggestion: false, approvalStatus: 'APPROVED', assignee: targetAssignee, status: 'Todo' } : t)))
            setAssigningSuggestionId(null)
            setAssigneeForSuggestion('')
            setSuccessMessage(`✓ Approved "${suggestionTask.title}" and assigned to ${targetAssignee}!`)
        } catch (err) {
            setError(err.message || 'Failed to approve task suggestion')
        }
    }

    async function handleRejectSuggestion(suggestionTask) {
        try {
            const updated = await updateTaskDetails(suggestionTask.id, {
                approvalStatus: 'REJECTED',
            })
            setTasks((prev) => prev.map((t) => (t.id === suggestionTask.id ? { ...t, ...updated, approvalStatus: 'REJECTED' } : t)))
            setSuccessMessage(`Task proposal "${suggestionTask.title}" rejected.`)
        } catch (err) {
            setError(err.message || 'Failed to reject task suggestion')
        }
    }

    async function handleStatusChange(taskId, nextStatus) {
        setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t))
        )
        if (activeTask && activeTask.id === taskId) {
            setActiveTask((prev) => ({ ...prev, status: nextStatus }))
        }
        setSuccessMessage(`Task moved to ${nextStatus}.`)
        try {
            await updateTaskStatus(taskId, nextStatus)
        } catch {
            // roll back if failed
        }
    }

    // HTML5 Drag-and-Drop Column Drop Handler
    async function handleDropOnColumn(targetColumn) {
        if (!draggedTaskId) return
        const currentTask = tasks.find((t) => t.id === draggedTaskId)
        if (!currentTask || currentTask.status === targetColumn) {
            setDraggedTaskId(null)
            setDragOverCol(null)
            return
        }

        // Optimistic UI status update
        setTasks((prev) =>
            prev.map((t) => (t.id === draggedTaskId ? { ...t, status: targetColumn } : t))
        )
        if (activeTask && activeTask.id === draggedTaskId) {
            setActiveTask((prev) => ({ ...prev, status: targetColumn }))
        }
        const taskId = draggedTaskId
        setDraggedTaskId(null)
        setDragOverCol(null)
        setSuccessMessage(`Moved "${currentTask.title}" to ${targetColumn}.`)

        try {
            await updateTaskStatus(taskId, targetColumn)
        } catch {
            // Rollback on network failure
            setTasks((prev) =>
                prev.map((t) => (t.id === taskId ? { ...t, status: currentTask.status } : t))
            )
        }
    }

    function openTaskModal(task) {
        setActiveTask(task)
        setEditingTitleText(task.title || '')
        setIsEditingTitle(false)
    }

    async function handleDeleteTask(taskId, e) {
        if (e) e.stopPropagation()
        const target = tasks.find((t) => t.id === taskId || String(t.id) === String(taskId))
        const taskTitle = target?.title || 'this task'
        if (!window.confirm(`Are you sure you want to permanently delete "${taskTitle}"?`)) return
        setError('')
        try {
            await deleteTask(taskId)
            setTasks((prev) => prev.filter((t) => t.id !== taskId && String(t.id) !== String(taskId)))
            if (activeTask && (activeTask.id === taskId || String(activeTask.id) === String(taskId))) {
                setActiveTask(null)
            }
            setSuccessMessage(`✓ Task "${taskTitle}" was deleted successfully.`)
        } catch (err) {
            setError(err.message || 'Failed to delete task')
        }
    }

    async function handleSaveTitle() {
        if (!activeTask || !editingTitleText.trim()) return
        const newTitle = editingTitleText.trim()
        try {
            await updateTaskDetails(activeTask.id, { title: newTitle })
            setActiveTask((prev) => ({ ...prev, title: newTitle }))
            setTasks((prev) => prev.map((t) => (t.id === activeTask.id ? { ...t, title: newTitle } : t)))
            setIsEditingTitle(false)
            setSuccessMessage('Task title updated successfully.')
        } catch (err) {
            setError(err.message || 'Failed to update task title')
        }
    }

    async function handleUpdateActiveTaskField(field, value) {
        if (!activeTask) return
        try {
            await updateTaskDetails(activeTask.id, { [field]: value })
            setActiveTask((prev) => ({ ...prev, [field]: value }))
            setTasks((prev) => prev.map((t) => (t.id === activeTask.id ? { ...t, [field]: value } : t)))
            setSuccessMessage(`Updated task ${field}.`)
        } catch (err) {
            setError(err.message || `Failed to update ${field}`)
        }
    }

    async function handleAddComment(e) {
        e.preventDefault()
        if (!newComment.trim() || !activeTask) return
        const commentObj = {
            id: Date.now(),
            author: 'Developer (You)',
            text: newComment.trim(),
            time: 'Just now',
        }
        const updatedList = [...(commentsMap[activeTask.id] || []), commentObj]
        setCommentsMap((prev) => ({
            ...prev,
            [activeTask.id]: updatedList
        }))
        setNewComment('')
        setSuccessMessage('Comment added to task thread.')
        try {
            await updateTaskDetails(activeTask.id, { comments: updatedList })
        } catch {
            // silent fallback
        }
    }

    // Physical File Upload Handler (PDFs, Images, Code, Docs)
    function handleFileUpload(e) {
        const file = e.target.files?.[0]
        if (!file || !activeTask) return

        const isCodeOrText = file.name.match(/\.(js|jsx|ts|tsx|py|html|css|json|sql|sh|yml|yaml|md|txt|env)$/i)
        const reader = new FileReader()

        reader.onload = async () => {
            const dataUrl = reader.result

            if (isCodeOrText) {
                try {
                    const textReader = new FileReader()
                    textReader.onload = async () => {
                        const newFileObj = {
                            name: file.name,
                            size: file.size,
                            type: file.type || 'text/plain',
                            url: dataUrl,
                            content: textReader.result,
                            uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        }
                        persistAttachment(newFileObj)
                    }
                    textReader.readAsText(file)
                    return
                } catch {
                    // fallback
                }
            }

            const newFileObj = {
                name: file.name,
                size: file.size,
                type: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
                url: dataUrl,
                content: null,
                uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
            persistAttachment(newFileObj)
        }

        async function persistAttachment(newFileObj) {
            const currentList = attachmentsMap[activeTask.id] || []
            const updatedList = [...currentList, newFileObj]
            setAttachmentsMap((prev) => ({
                ...prev,
                [activeTask.id]: updatedList
            }))
            setSuccessMessage(`Attached "${newFileObj.name}" to task.`)
            try {
                await updateTaskDetails(activeTask.id, { attachments: updatedList })
            } catch {
                // fallback
            }
        }

        reader.readAsDataURL(file)
        e.target.value = ''
    }

    function handleAddAttachmentName(e) {
        e.preventDefault()
        if (!newAttachmentName.trim() || !activeTask) return
        const newObj = {
            name: newAttachmentName.trim(),
            size: 36000,
            type: newAttachmentName.endsWith('.pdf') ? 'application/pdf' : newAttachmentName.match(/\.(png|jpg|jpeg|webp)$/i) ? 'image/png' : 'text/plain',
            url: null,
            content: `// Notes for ${newAttachmentName.trim()}`,
            uploadedAt: 'Just now',
        }
        setAttachmentsMap((prev) => ({
            ...prev,
            [activeTask.id]: [...(prev[activeTask.id] || []), newObj]
        }))
        setNewAttachmentName('')
        setSuccessMessage(`File "${newObj.name}" attached.`)
    }

    function getFileHelper(item) {
        if (typeof item === 'object') {
            return {
                name: item.name,
                size: item.size ? `${(item.size / 1024).toFixed(1)} KB` : '32 KB',
                url: item.url,
                content: item.content,
                type: item.type || '',
            }
        }
        return {
            name: item,
            size: '28 KB',
            url: null,
            content: `// Source code and documentation for ${item}`,
            type: item.endsWith('.pdf') ? 'application/pdf' : item.match(/\.(png|jpg|jpeg|webp)$/i) ? 'image/png' : 'text/plain',
        }
    }

    function triggerDownload(file) {
        if (file.url) {
            const a = document.createElement('a')
            a.href = file.url
            a.download = file.name
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
        } else {
            // Generate fallback data Blob for download
            const blob = new Blob([file.content || `WorkFlowX Attachment: ${file.name}`], { type: 'text/plain' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = file.name
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        }
    }

    return (
        <main className="feature-page">
            <div className="feature-heading">
                <div>
                    <p className="eyebrow">Developer & Execution Workspace</p>
                    <h1>My Tasks & Workflow</h1>
                    <p className="heading-subtitle">Interactive Signboard with drag-and-drop, physical file attachments, and live Socket.IO collaboration.</p>
                </div>
                {/* View Mode Toggle: Signboard vs Table */}
                <div style={{ display: 'inline-flex', background: '#f3f4f6', padding: '3px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <button
                        type="button"
                        onClick={() => setViewMode('kanban')}
                        style={{
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: viewMode === 'kanban' ? '700' : '500',
                            background: viewMode === 'kanban' ? '#ffffff' : 'transparent',
                            color: viewMode === 'kanban' ? '#ee785e' : '#4b5563',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}
                    >
                        <span>📋</span> Signboard
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode('table')}
                        style={{
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: viewMode === 'table' ? '700' : '500',
                            background: viewMode === 'table' ? '#ffffff' : 'transparent',
                            color: viewMode === 'table' ? '#ee785e' : '#4b5563',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}
                    >
                        <span>☰</span> Table List
                    </button>
                </div>
            </div>

            {error && <p className="service-error" role="alert">{error}</p>}
            {successMessage && (
                <p className="service-success" role="status" style={{ color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '7px', marginBottom: '16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>✓</span> {successMessage}
                </p>
            )}

            {/* Task Pipeline Metrics Header */}
            <section className="stats-grid" aria-label="Task progress metrics" style={{ marginBottom: '14px' }}>
                <div
                    className="stat-card"
                    style={{
                        cursor: 'pointer',
                        border: filter === 'Todo' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                        transform: filter === 'Todo' ? 'translateY(-2px)' : 'none',
                        boxShadow: filter === 'Todo' ? '0 8px 16px -4px rgba(2, 132, 199, 0.2)' : '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s ease',
                    }}
                    onClick={() => setFilter(filter === 'Todo' ? 'All tasks' : 'Todo')}
                >
                    <span className="stat-icon yellow" style={{ background: '#e0f2fe', color: '#0284c7' }}>◌</span>
                    <div>
                        <p style={{ color: '#0369a1' }}>TODO</p>
                        <strong>{statusCounts.todo}</strong>
                        <small className="neutral">Awaiting start</small>
                    </div>
                </div>

                <div
                    className="stat-card"
                    style={{
                        cursor: 'pointer',
                        border: filter === 'In progress' ? '2px solid #d97706' : '1px solid #e2e8f0',
                        transform: filter === 'In progress' ? 'translateY(-2px)' : 'none',
                        boxShadow: filter === 'In progress' ? '0 8px 16px -4px rgba(217, 119, 6, 0.2)' : '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s ease',
                    }}
                    onClick={() => setFilter(filter === 'In progress' ? 'All tasks' : 'In progress')}
                >
                    <span className="stat-icon blue" style={{ background: '#fef3c7', color: '#d97706' }}>◷</span>
                    <div>
                        <p style={{ color: '#b45309' }}>IN PROGRESS</p>
                        <strong>{statusCounts.inProgress}</strong>
                        <small className="positive" style={{ color: '#d97706' }}>Active development</small>
                    </div>
                </div>

                <div
                    className="stat-card"
                    style={{
                        cursor: 'pointer',
                        border: filter === 'Review' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                        transform: filter === 'Review' ? 'translateY(-2px)' : 'none',
                        boxShadow: filter === 'Review' ? '0 8px 16px -4px rgba(124, 58, 237, 0.2)' : '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s ease',
                    }}
                    onClick={() => setFilter(filter === 'Review' ? 'All tasks' : 'Review')}
                >
                    <span className="stat-icon coral" style={{ background: '#ede9fe', color: '#7c3aed' }}>◎</span>
                    <div>
                        <p style={{ color: '#6d28d9' }}>IN REVIEW</p>
                        <strong>{statusCounts.review}</strong>
                        <small className="neutral">QA & code review</small>
                    </div>
                </div>

                <div
                    className="stat-card"
                    style={{
                        cursor: 'pointer',
                        border: filter === 'Done' ? '2px solid #059669' : '1px solid #e2e8f0',
                        transform: filter === 'Done' ? 'translateY(-2px)' : 'none',
                        boxShadow: filter === 'Done' ? '0 8px 16px -4px rgba(5, 150, 105, 0.2)' : '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s ease',
                    }}
                    onClick={() => setFilter(filter === 'Done' ? 'All tasks' : 'Done')}
                >
                    <span className="stat-icon green" style={{ background: '#d1fae5', color: '#059669' }}>✓</span>
                    <div>
                        <p style={{ color: '#047857' }}>COMPLETED</p>
                        <strong>{statusCounts.done}</strong>
                        <small className="positive">Delivered tasks</small>
                    </div>
                </div>

                {statusCounts.pendingSuggestions > 0 && (
                    <div className="stat-card" style={{ cursor: 'pointer', background: '#fffdf5', borderColor: '#fde68a' }}>
                        <span className="stat-icon yellow">💡</span>
                        <div>
                            <p style={{ color: '#b45309' }}>TASK PROPOSALS</p>
                            <strong style={{ color: '#92400e' }}>{statusCounts.pendingSuggestions}</strong>
                            <small style={{ color: '#b45309' }}>Pending review</small>
                        </div>
                    </div>
                )}
            </section>

            {/* Overall Workflow Progress Bar */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '220px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                        Sprint Completion:
                    </span>
                    <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                            style={{
                                width: `${statusCounts.completionRate}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                                borderRadius: '4px',
                                transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                            }}
                        />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669', minWidth: '36px' }}>
                        {statusCounts.completionRate}%
                    </span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                    <span>{statusCounts.done} of {statusCounts.total} tasks completed</span>
                </div>
            </div>

            {/* MANAGER REVIEW QUEUE: TASK PROPOSALS SUBMITTED BY DEVELOPERS */}
            {canAssign && pendingSuggestions.length > 0 && (
                <section
                    className="panel"
                    style={{
                        marginBottom: '24px',
                        background: '#fffdfa',
                        border: '1px solid #fde68a',
                        borderRadius: '12px',
                        padding: '20px',
                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.08)',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '20px' }}>🔔</span>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '16px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    Manager Review Queue: Task Proposals
                                    <span style={{ fontSize: '11px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                                        {pendingSuggestions.length} Pending
                                    </span>
                                </h3>
                                <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#b45309' }}>
                                    Developers proposed these tasks. Review, approve, and assign them to an engineer.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                        {pendingSuggestions.map((sug) => (
                            <div
                                key={sug.id}
                                style={{
                                    background: '#ffffff',
                                    border: '1px solid #fed7aa',
                                    borderRadius: '10px',
                                    padding: '16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                }}
                            >
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                        <span className={`priority ${(sug.priority || 'medium').toLowerCase()}`} style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '4px' }}>
                                            {sug.priority}
                                        </span>
                                        <span style={{ fontSize: '11px', color: '#6b7280', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>
                                            📁 {sug.project}
                                        </span>
                                    </div>
                                    <h4 style={{ margin: '6px 0 4px', fontSize: '14.5px', color: '#111827' }}>
                                        {sug.title}
                                    </h4>
                                    <p style={{ margin: '0 0 8px', fontSize: '11px', color: '#6b7280' }}>
                                        Suggested by: <strong style={{ color: '#374151' }}>{sug.suggestedBy || 'Developer'}</strong> • Target: {sug.due || 'Next week'}
                                    </p>
                                    <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: '6px', padding: '8px 10px', marginBottom: '12px' }}>
                                        <p style={{ margin: 0, fontSize: '12px', color: '#713f12', fontStyle: 'italic', lineHeight: 1.4 }}>
                                            💬 "{sug.suggestionReason || 'Identified missing functionality during development.'}"
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    {assigningSuggestionId === sug.id ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: '1px dashed #fed7aa' }}>
                                            <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#374151' }}>
                                                Select Developer to Assign:
                                            </label>
                                            <select
                                                value={assigneeForSuggestion}
                                                onChange={(e) => setAssigneeForSuggestion(e.target.value)}
                                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff' }}
                                            >
                                                <option value="">-- Choose Developer --</option>
                                                {members.map((m) => (
                                                    <option key={m.userId} value={m.name || m.email}>
                                                        {m.name || m.email} ({m.role})
                                                    </option>
                                                ))}
                                            </select>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setAssigningSuggestionId(null)
                                                        setAssigneeForSuggestion('')
                                                    }}
                                                    style={{ padding: '5px 10px', fontSize: '11px', borderRadius: '5px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={!assigneeForSuggestion}
                                                    onClick={() => handleApproveSuggestion(sug, assigneeForSuggestion)}
                                                    style={{
                                                        padding: '5px 12px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        borderRadius: '5px',
                                                        border: 'none',
                                                        background: assigneeForSuggestion ? '#15803d' : '#9ca3af',
                                                        color: '#fff',
                                                        cursor: assigneeForSuggestion ? 'pointer' : 'not-allowed',
                                                    }}
                                                >
                                                    ✓ Approve & Assign
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px dashed #fed7aa' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleRejectSuggestion(sug)}
                                                style={{ padding: '6px 12px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', cursor: 'pointer' }}
                                                title="Decline this suggestion"
                                            >
                                                ✕ Reject
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAssigningSuggestionId(sug.id)
                                                    setAssigneeForSuggestion('')
                                                }}
                                                style={{
                                                    padding: '6px 14px',
                                                    fontSize: '11.5px',
                                                    fontWeight: 600,
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    background: '#2563eb',
                                                    color: '#fff',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                ✓ Review & Assign
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* DEVELOPER STATUS: MY PROPOSED TASKS UNDER REVIEW */}
            {!canAssign && myPendingSuggestions.length > 0 && (
                <section
                    className="panel"
                    style={{
                        marginBottom: '20px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '16px',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>💡</span>
                            <strong style={{ fontSize: '13px', color: '#334155' }}>
                                Your Task Proposals Under Manager Review ({myPendingSuggestions.length})
                            </strong>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {myPendingSuggestions.map((sug) => (
                            <div key={sug.id} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 14px', fontSize: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '10px', fontWeight: 600 }}>
                                        ⏳ Awaiting Manager Approval
                                    </span>
                                    <span style={{ color: '#64748b' }}>• {sug.project}</span>
                                </div>
                                <strong style={{ color: '#0f172a' }}>{sug.title}</strong>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Filter Tabs, Search Bar and Quick Selectors */}
            <section className="task-page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', background: '#fff', padding: '12px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="filter-tabs">
                        {STATUSES.map((item) => (
                            <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>
                                {item}
                            </button>
                        ))}
                    </div>

                    {/* Modern Search Input */}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <span style={{ position: 'absolute', left: '10px', fontSize: '13px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter by title, project, assignee..."
                            style={{
                                padding: '7px 28px 7px 30px',
                                fontSize: '12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
                                width: '230px',
                                transition: 'all 0.2s ease',
                                outline: 'none',
                                color: '#1e293b',
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#2563eb'
                                e.target.style.background = '#ffffff'
                                e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)'
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#cbd5e1'
                                e.target.style.background = '#f8fafc'
                                e.target.style.boxShadow = 'none'
                            }}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                style={{
                                    position: 'absolute',
                                    right: '8px',
                                    background: 'none',
                                    border: 'none',
                                    color: '#94a3b8',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    padding: 0,
                                }}
                                title="Clear search"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => setOnlyMyTasks(!onlyMyTasks)}
                        style={{
                            padding: '7px 13px',
                            fontSize: '11.5px',
                            borderRadius: '8px',
                            border: onlyMyTasks ? '1px solid #2563eb' : '1px solid #d1d5db',
                            background: onlyMyTasks ? '#eff6ff' : '#fff',
                            color: onlyMyTasks ? '#1d4ed8' : '#374151',
                            fontWeight: onlyMyTasks ? 700 : '500',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        <span>👤</span> {onlyMyTasks ? '✓ My Tasks Only' : 'My Tasks Only'}
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        id="task-project-filter"
                        value={projectFilter}
                        onChange={(e) => {
                            const val = e.target.value
                            setProjectFilter(val)
                            if (val === 'ALL') {
                                searchParams.delete('project')
                                setSearchParams(searchParams)
                            } else {
                                setSearchParams({ project: val })
                            }
                        }}
                        style={{ padding: '7px 11px', fontSize: '11.5px', borderRadius: '8px', border: '1px solid #cbd5e1', background: projectFilter !== 'ALL' ? '#eff6ff' : '#fff', fontWeight: projectFilter !== 'ALL' ? '600' : 'normal', color: projectFilter !== 'ALL' ? '#1d4ed8' : '#1f2937' }}
                    >
                        <option value="ALL">All Projects</option>
                        {projects.map((p) => (
                            <option key={p.id || p.name} value={p.name}>
                                Project: {p.name}
                            </option>
                        ))}
                    </select>

                    {projectFilter !== 'ALL' && (
                        <button
                            type="button"
                            onClick={() => {
                                setProjectFilter('ALL')
                                searchParams.delete('project')
                                setSearchParams(searchParams)
                            }}
                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '5px 10px', fontSize: '11px', cursor: 'pointer', color: '#475569' }}
                            title="Clear project filter"
                        >
                            ✕ Clear {projectFilter}
                        </button>
                    )}

                    <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} style={{ padding: '7px 11px', fontSize: '11.5px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#1f2937' }}>
                        <option value="ALL">All Assignees</option>
                        {members.map((m) => (
                            <option key={m.userId} value={m.name || m.email}>
                                {m.name || m.email}
                            </option>
                        ))}
                    </select>

                    <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={{ padding: '7px 11px', fontSize: '11.5px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#1f2937' }}>
                        <option value="ALL">All Priorities</option>
                        {PRIORITIES.map((p) => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </div>
            </section>

            <section className="feature-grid task-page-grid">
                {/* Create / Propose Task Form */}
                <form className="task-create-panel" onSubmit={submit} style={{ flex: '1 1 340px', height: 'fit-content' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span className="eyebrow" style={{ color: canAssign ? '#ee785e' : '#2563eb', letterSpacing: '1px' }}>
                            {canAssign ? '⚡ Manager Planning' : '💡 Developer Proposal'}
                        </span>
                        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                            {canAssign ? 'Official Task' : 'Suggest Task'}
                        </span>
                    </div>
                    <h2 style={{ fontSize: '20px', margin: '0 0 6px', color: '#111827' }}>
                        {canAssign ? 'Create & Assign Task' : 'Suggest a Task'}
                    </h2>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px', lineHeight: '1.4' }}>
                        {canAssign
                            ? 'Plan deliverables, assign ownership to developers, and set completion milestones.'
                            : 'Found missing work or a bug? Propose this task for your Manager to review and assign.'}
                    </p>

                    <div className="task-field-group">
                        <label>
                            <span>Task Title</span>
                            <span style={{ color: canAssign ? '#ee785e' : '#2563eb' }}>*</span>
                        </label>
                        <input
                            id="new-task-title-input"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={canAssign ? "e.g. Implement OAuth2 Login Flow" : "e.g. Add password-reset API & email notification"}
                            required
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px' }}>
                        {canAssign && (
                            <div className="task-field-group">
                                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>Assignee (Manager)</span>
                                </label>
                                <select id="new-task-assignee-select" value={selectedAssignee} onChange={(e) => setSelectedAssignee(e.target.value)}>
                                    <option value="">-- Unassigned --</option>
                                    {members.map((m) => (
                                        <option key={m.userId} value={m.name || m.email}>
                                            {m.name || m.email} ({m.role})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="task-field-group">
                            <label>Project Workspace</label>
                            <select id="new-task-project-select" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
                                {projects.length === 0 && <option value="General">General Workspace</option>}
                                {projects.map((p) => (
                                    <option key={p.id} value={p.name}>
                                        {p.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px' }}>
                        <div className="task-field-group">
                            <label>Priority Level</label>
                            <select id="new-task-priority-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
                                {PRIORITIES.map((p) => (
                                    <option key={p} value={p}>
                                        {p === 'Critical' ? '🔥 Critical' : p === 'High' ? '⚡ High' : p === 'Medium' ? '● Medium' : '○ Low'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="task-field-group">
                            <label>{canAssign ? 'Target Deadline' : 'Estimated Need Date'}</label>
                            <input
                                id="new-task-due-date-input"
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                            />
                        </div>
                    </div>

                    {!canAssign && (
                        <div className="task-field-group" style={{ marginTop: '14px' }}>
                            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Why is this needed? (Proposal justification)</span>
                                <span style={{ color: '#2563eb' }}>*</span>
                            </label>
                            <textarea
                                id="new-task-reason-input"
                                value={suggestionReason}
                                onChange={(e) => setSuggestionReason(e.target.value)}
                                rows={2}
                                placeholder="Explain to the Manager why this task should be created (e.g. 'Users cannot recover accounts without password reset API')..."
                                required
                                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', resize: 'vertical', fontSize: '12.5px' }}
                            />
                        </div>
                    )}

                    <div style={{ marginTop: '14px' }}>
                        <button
                            id="create-task-submit-btn"
                            className="primary-button"
                            type="submit"
                            disabled={isCreating}
                            style={{
                                width: '100%',
                                justifyContent: 'center',
                                padding: '13px',
                                fontSize: '13.5px',
                                borderRadius: '9px',
                                fontWeight: '600',
                                background: canAssign ? '#ee785e' : '#2563eb',
                            }}
                        >
                            {isCreating
                                ? (canAssign ? 'Creating Task...' : 'Submitting Proposal...')
                                : (canAssign ? '✓ Add Task to Board' : '💡 Submit Proposal for Manager Review')}
                        </button>
                    </div>
                </form>

                {/* View Mode 1: Interactive HTML5 Drag-and-Drop Kanban Board */}
                {viewMode === 'kanban' ? (
                    <section className="project-list-panel panel" style={{ flex: '1 1 700px', overflowX: 'auto', background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}>
                        <div className="panel-heading" style={{ marginBottom: '16px', background: '#fff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                            <div>
                                <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                                    <span>Interactive Kanban Board</span>
                                    <span style={{ fontSize: '11px', background: 'linear-gradient(135deg, #fee2e2 0%, #ffedd5 100%)', color: '#ea580c', padding: '2px 8px', borderRadius: '12px', fontWeight: 700, border: '1px solid #fed7aa' }}>
                                        ✦ Live Sync & DnD
                                    </span>
                                </h2>
                                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                                    Drag & drop cards across stages or use quick-advance buttons to update lifecycle.
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569', background: '#f8fafc', padding: '4px 12px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                                    🎯 {visibleTasks.length} Visible Tasks
                                </span>
                            </div>
                        </div>

                        {isLoading && <p className="loading-state">Loading tasks...</p>}

                        <div className="kanban-board-container">
                            {KANBAN_COLUMNS.map((column) => {
                                const colTasks = visibleTasks.filter((t) => t.status === column)
                                const isDragOver = dragOverCol === column

                                const themeClass =
                                    column === 'Todo' ? 'col-theme-todo' :
                                    column === 'In progress' ? 'col-theme-inprogress' :
                                    column === 'Review' ? 'col-theme-review' : 'col-theme-done'

                                const colIcon =
                                    column === 'Todo' ? '📋' :
                                    column === 'In progress' ? '⚡' :
                                    column === 'Review' ? '👁' : '✓'

                                return (
                                    <div
                                        key={column}
                                        className={`kanban-col-wrapper ${themeClass} ${isDragOver ? 'is-drag-over' : ''}`}
                                        onDragOver={(e) => {
                                            e.preventDefault()
                                            if (dragOverCol !== column) setDragOverCol(column)
                                        }}
                                        onDragLeave={() => {
                                            if (dragOverCol === column) setDragOverCol(null)
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault()
                                            handleDropOnColumn(column)
                                        }}
                                    >
                                        {/* Column Header */}
                                        <div className="kanban-col-header">
                                            <div className="kanban-col-title-group">
                                                <span className="kanban-col-icon-pill">{colIcon}</span>
                                                <h3 className="kanban-col-title">{column}</h3>
                                                {column === 'In progress' && (
                                                    <span className="pulsing-status-dot" title="Sprint active" />
                                                )}
                                            </div>
                                            <span className="kanban-col-count-badge">
                                                {colTasks.length}
                                            </span>
                                        </div>

                                        {/* Column Task Cards Stack */}
                                        <div className="kanban-cards-stack">
                                            {colTasks.map((task) => {
                                                const isDragging = draggedTaskId === task.id
                                                const attachments = attachmentsMap[task.id] || []
                                                const comments = commentsMap[task.id] || []
                                                const priority = (task.priority || 'medium').toLowerCase()
                                                const priorityStripeClass = `priority-stripe-${priority}`

                                                const nextStatus =
                                                    column === 'Todo' ? 'In progress' :
                                                    column === 'In progress' ? 'Review' :
                                                    column === 'Review' ? 'Done' : null

                                                return (
                                                    <article
                                                        key={task.id}
                                                        draggable
                                                        onDragStart={() => setDraggedTaskId(task.id)}
                                                        onDragEnd={() => {
                                                            setDraggedTaskId(null)
                                                            setDragOverCol(null)
                                                        }}
                                                        onClick={() => openTaskModal(task)}
                                                        className={`kanban-card ${priorityStripeClass} ${isDragging ? 'is-dragging' : ''}`}
                                                        title="Click to view details & files, or drag to stage"
                                                    >
                                                        {/* Top Bar: Priority Badge + Drag Handle */}
                                                        <div className="kanban-card-topbar">
                                                            <span className={`kanban-priority-pill ${priority}`}>
                                                                {priority === 'critical' ? '🔥' : priority === 'high' ? '▲' : priority === 'medium' ? '●' : '▽'}{' '}
                                                                {task.priority || 'Medium'}
                                                            </span>
                                                            <span className="kanban-drag-handle" title="Drag card">⠿</span>
                                                        </div>

                                                        {/* Task Title */}
                                                        <h4 className="kanban-card-title">
                                                            {task.title}
                                                        </h4>

                                                        {/* Project Capsule */}
                                                        <div className="kanban-card-project-pill">
                                                            <span>📁</span>
                                                            <span>{task.project || 'General'}</span>
                                                        </div>

                                                        {/* Card Footer: Assignee Avatar + Due Date + Counters & Quick Move */}
                                                        <div className="kanban-card-footer">
                                                            <div className="kanban-card-meta-left">
                                                                <div
                                                                    className="kanban-avatar-badge"
                                                                    title={task.assignee ? `Assigned to: ${task.assignee}` : 'Assigned to: You'}
                                                                >
                                                                    {task.assignee ? task.assignee.slice(0, 2).toUpperCase() : 'ME'}
                                                                </div>
                                                                <span className="kanban-due-date" title={`Due: ${task.due || 'Next week'}`}>
                                                                    <span>📅</span> {task.due || 'Next week'}
                                                                </span>
                                                            </div>

                                                            <div className="kanban-card-meta-right">
                                                                {attachments.length > 0 && (
                                                                    <span className="kanban-counter-chip" title={`${attachments.length} attachments`}>
                                                                        📎 {attachments.length}
                                                                    </span>
                                                                )}
                                                                {comments.length > 0 && (
                                                                    <span className="kanban-counter-chip" title={`${comments.length} comments`}>
                                                                        💬 {comments.length}
                                                                    </span>
                                                                )}
                                                                {nextStatus && (
                                                                    <button
                                                                        type="button"
                                                                        className="kanban-quick-move-btn"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            handleStatusChange(task.id, nextStatus)
                                                                        }}
                                                                        title={`Quick advance to ${nextStatus}`}
                                                                    >
                                                                        ➔
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </article>
                                                )
                                            })}

                                            {!isLoading && colTasks.length === 0 && (
                                                <div className="kanban-empty-dropzone">
                                                    <span style={{ fontSize: '18px' }}>📥</span>
                                                    <span>No {column.toLowerCase()} tasks</span>
                                                    <span style={{ fontSize: '10.5px', opacity: 0.7 }}>Drop cards here</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                ) : (
                    /* View Mode 2: Table / List View */
                    <section className="project-list-panel panel" aria-labelledby="task-list-title" style={{ flex: '1 1 700px' }}>
                        <div className="panel-heading">
                            <div>
                                <h2 id="task-list-title">My Tasks Table</h2>
                                <p>Click any task to view details, add comments, and upload files.</p>
                            </div>
                            <strong>{visibleTasks.length} Tasks</strong>
                        </div>

                        {isLoading && <p className="loading-state">Loading tasks...</p>}
                        {!isLoading && visibleTasks.length === 0 && <p className="empty-column">No tasks found</p>}

                        <div className="project-list">
                            {visibleTasks.map((task) => (
                                <article
                                    className="project-row"
                                    key={task.id}
                                    onClick={() => openTaskModal(task)}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '14px 18px', cursor: 'pointer' }}
                                >
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <h3 style={{ margin: 0, fontSize: '13px' }}>{task.title}</h3>
                                            <span className={`priority ${(task.priority || 'medium').toLowerCase()}`} style={{ fontSize: '8px', padding: '2px 5px', borderRadius: '4px' }}>
                                                {task.priority || 'Medium'}
                                            </span>
                                        </div>
                                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#858996' }}>
                                            Project: <b>{task.project || 'General'}</b> • Assignee: <b>{task.assignee || 'Unassigned'}</b> • Due: <b>{task.due || 'Next week'}</b>
                                        </p>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                                        <select
                                            value={task.status || 'Todo'}
                                            onChange={(e) => handleStatusChange(task.id, e.target.value)}
                                            style={{ padding: '5px 8px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
                                        >
                                            <option value="Todo">TODO</option>
                                            <option value="In progress">IN PROGRESS</option>
                                            <option value="Review">IN REVIEW</option>
                                            <option value="Done">COMPLETED</option>
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => openTaskModal(task)}
                                            style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 9px', fontSize: '11px', color: '#ee785e', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            Details ➔
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => handleDeleteTask(task.id, e)}
                                            style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', color: '#dc2626', cursor: 'pointer' }}
                                            title="Delete Task"
                                        >
                                            🗑
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                )}
            </section>

            {/* Task Detail Modal: Status Execution, Comments & Physical File Attachments */}
            {activeTask && (
                <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setActiveTask(null)}>
                    <div className="task-form" style={{ width: 'min(100%, 640px)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-heading" style={{ marginBottom: '14px' }}>
                            <div style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span className={`priority ${(activeTask.priority || 'medium').toLowerCase()}`} style={{ fontSize: '9px', padding: '2px 8px', borderRadius: '4px' }}>
                                            {activeTask.priority || 'Medium'} Priority
                                        </span>
                                        <select
                                            value={activeTask.priority || 'Medium'}
                                            onChange={(e) => handleUpdateActiveTaskField('priority', e.target.value)}
                                            style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc' }}
                                            title="Change Priority"
                                        >
                                            {PRIORITIES.map((p) => (
                                                <option key={p} value={p}>{p}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <button type="button" className="close-button" onClick={() => setActiveTask(null)}>×</button>
                                </div>

                                {/* Editable Task Title */}
                                {isEditingTitle ? (
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', margin: '8px 0' }}>
                                        <input
                                            type="text"
                                            value={editingTitleText}
                                            onChange={(e) => setEditingTitleText(e.target.value)}
                                            style={{ padding: '6px 10px', fontSize: '15px', fontWeight: 600, borderRadius: '6px', border: '1px solid #2563eb', flex: 1, outline: 'none' }}
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSaveTitle()
                                                if (e.key === 'Escape') setIsEditingTitle(false)
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleSaveTitle}
                                            className="primary-button"
                                            style={{ padding: '6px 12px', fontSize: '11.5px' }}
                                        >
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsEditingTitle(false)}
                                            className="secondary-button"
                                            style={{ padding: '6px 10px', fontSize: '11.5px' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0 8px' }}>
                                        <h2 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>{activeTask.title}</h2>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingTitleText(activeTask.title)
                                                setIsEditingTitle(true)
                                            }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#64748b' }}
                                            title="Edit Title"
                                        >
                                            ✏️
                                        </button>
                                    </div>
                                )}

                                {/* Meta Bar: Project, Assignee, Due Date */}
                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', fontSize: '11.5px', color: '#64748b', background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>📁 Project:</span>
                                        <select
                                            value={activeTask.project || 'General'}
                                            onChange={(e) => handleUpdateActiveTaskField('project', e.target.value)}
                                            style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff' }}
                                        >
                                            {projects.length === 0 && <option value="General">General</option>}
                                            {projects.map((p) => (
                                                <option key={p.id} value={p.name}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>📅 Due:</span>
                                        <input
                                            type="text"
                                            value={activeTask.due || ''}
                                            onChange={(e) => handleUpdateActiveTaskField('due', e.target.value)}
                                            placeholder="e.g. Nov 15"
                                            style={{ width: '80px', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                        />
                                    </div>

                                    {canAssign && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span>👤 Assignee:</span>
                                            <select
                                                value={activeTask.assignee || ''}
                                                onChange={(e) => {
                                                    const nextAssignee = e.target.value
                                                    handleUpdateActiveTaskField('assignee', nextAssignee)
                                                    setSuccessMessage(`Task reassigned to ${nextAssignee || 'Unassigned'}.`)
                                                }}
                                                style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff' }}
                                            >
                                                <option value="">-- Unassigned --</option>
                                                {members.map((m) => (
                                                    <option key={m.userId} value={m.name || m.email}>
                                                        {m.name || m.email} ({m.role})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Status Advancement Quick Buttons */}
                        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', padding: '12px 14px', borderRadius: '8px', marginBottom: '18px' }}>
                            <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: '#6b7280', display: 'block', marginBottom: '8px', letterSpacing: '0.5px' }}>
                                Update Workflow Status
                            </strong>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {['Todo', 'In progress', 'Review', 'Done'].map((st) => (
                                    <button
                                        key={st}
                                        type="button"
                                        onClick={() => handleStatusChange(activeTask.id, st)}
                                        style={{
                                            padding: '6px 14px',
                                            fontSize: '11.5px',
                                            fontWeight: activeTask.status === st ? '700' : '500',
                                            background: activeTask.status === st ? '#ee785e' : '#ffffff',
                                            color: activeTask.status === st ? '#ffffff' : '#374151',
                                            border: activeTask.status === st ? '1px solid #ee785e' : '1px solid #d1d5db',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                        }}
                                    >
                                        {st === 'Done' ? '✓ COMPLETED' : st === 'Review' ? '◎ IN REVIEW' : st === 'In progress' ? '◷ IN PROGRESS' : '◌ TODO'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* File Attachments with Physical Upload & Download/Preview */}
                        <div style={{ marginBottom: '22px', background: '#fcfcfc', border: '1px solid #ebe9e5', borderRadius: '10px', padding: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <div>
                                    <strong style={{ fontSize: '13.5px', color: '#111827', display: 'block' }}>
                                        📎 Attachments & Documents ({(attachmentsMap[activeTask.id] || []).length})
                                    </strong>
                                    <span style={{ fontSize: '11px', color: '#6b7280' }}>Physical uploads: PDFs, images, code files, and documents</span>
                                </div>
                            </div>

                            {/* Attachment Items List */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                                {(attachmentsMap[activeTask.id] || []).length === 0 ? (
                                    <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontSize: '12px', fontStyle: 'italic' }}>
                                        No attachments uploaded yet. Use the upload button below.
                                    </div>
                                ) : (
                                    (attachmentsMap[activeTask.id] || []).map((fileItem, idx) => {
                                    const file = getFileHelper(fileItem)
                                    const isPdf = file.name.endsWith('.pdf')
                                    const isImg = file.name.match(/\.(png|jpg|jpeg|webp|svg|gif)$/i)
                                    const isCode = file.name.match(/\.(js|jsx|ts|tsx|py|html|css|json|sql|sh|yml|md|txt)$/i)

                                    return (
                                        <div
                                            key={idx}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '10px 14px',
                                                background: '#ffffff',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '8px',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                                                <span style={{ fontSize: '20px', lineHeight: 1 }}>
                                                    {isPdf ? '📄' : isImg ? '🖼️' : isCode ? '💻' : '📁'}
                                                </span>
                                                <div style={{ minWidth: 0 }}>
                                                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {file.name}
                                                    </span>
                                                    <span style={{ fontSize: '10.5px', color: '#9ca3af' }}>
                                                        {file.size} • {isPdf ? 'PDF Document' : isImg ? 'Image Asset' : isCode ? 'Source Code' : 'Document'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                {/* Preview Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewFile(file)}
                                                    style={{
                                                        padding: '5px 10px',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        background: '#f8fafc',
                                                        border: '1px solid #cbd5e1',
                                                        borderRadius: '6px',
                                                        color: '#334155',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                    }}
                                                    title="Preview document in rich modal"
                                                >
                                                    👁 Preview
                                                </button>

                                                {/* Download Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => triggerDownload(file)}
                                                    style={{
                                                        padding: '5px 10px',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        background: '#edf4ff',
                                                        border: '1px solid #bfdbfe',
                                                        borderRadius: '6px',
                                                        color: '#2563eb',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                    }}
                                                    title="Download file"
                                                >
                                                    ⬇ Download
                                                </button>

                                                {/* Delete Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const currentList = attachmentsMap[activeTask.id] || []
                                                        const updatedList = currentList.filter((_, i) => i !== idx)
                                                        setAttachmentsMap((prev) => ({
                                                            ...prev,
                                                            [activeTask.id]: updatedList
                                                        }))
                                                        updateTaskDetails(activeTask.id, { attachments: updatedList }).catch(() => null)
                                                    }}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 6px', fontSize: '15px' }}
                                                    title="Remove attachment"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                    )
                                }))}
                            </div>

                            {/* Multipart File Upload Controls */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <label
                                    style={{
                                        cursor: 'pointer',
                                        padding: '8px 16px',
                                        background: '#edf4ff',
                                        color: '#2563eb',
                                        border: '1px dashed #93c5fd',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                        fontWeight: '600',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        transition: 'background 0.2s',
                                    }}
                                >
                                    <span>📎 Choose File to Attach</span>
                                    <input
                                        type="file"
                                        style={{ display: 'none' }}
                                        accept=".pdf,image/*,.js,.jsx,.ts,.tsx,.py,.html,.css,.json,.sql,.md,.txt"
                                        onChange={handleFileUpload}
                                    />
                                </label>

                                <span style={{ fontSize: '11px', color: '#9ca3af' }}>or manual add:</span>
                                <input
                                    type="text"
                                    placeholder="e.g. system-spec.pdf"
                                    value={newAttachmentName}
                                    onChange={(e) => setNewAttachmentName(e.target.value)}
                                    style={{ flex: 1, minWidth: '130px', padding: '7px 10px', fontSize: '12px' }}
                                />
                                <button
                                    type="button"
                                    onClick={handleAddAttachmentName}
                                    className="secondary-button"
                                    style={{ padding: '7px 12px', fontSize: '11px' }}
                                >
                                    Add
                                </button>
                            </div>
                        </div>

                        {/* Task Comments & Real-time Communication */}
                        <div>
                            <strong style={{ fontSize: '12.5px', color: '#111827', display: 'block', marginBottom: '8px' }}>
                                💬 Team Discussion & Collaboration
                            </strong>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', marginBottom: '12px', padding: '10px', background: '#fafaf9', borderRadius: '8px', border: '1px solid #ebe9e5' }}>
                                {(commentsMap[activeTask.id] || []).length === 0 ? (
                                    <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontSize: '12px', fontStyle: 'italic' }}>
                                        No comments yet. Start the discussion below!
                                    </div>
                                ) : (
                                    (commentsMap[activeTask.id] || []).map((cmt) => (
                                        <div key={cmt.id} style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ebe9e5' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                                                <strong style={{ color: '#ee785e' }}>{cmt.author}</strong>
                                                <span style={{ color: '#9ca3af', fontSize: '10px' }}>{cmt.time}</span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: '12.5px', color: '#1f2937', lineHeight: '1.4' }}>{cmt.text}</p>
                                        </div>
                                    ))
                                )}
                            </div>

                            <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    placeholder="Write a comment, share updates, or ask for review..."
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    style={{ flex: 1, padding: '8px 12px', fontSize: '12.5px' }}
                                />
                                <button type="submit" className="primary-button" style={{ padding: '8px 16px', fontSize: '12px' }}>
                                    Post
                                </button>
                            </form>
                        </div>

                        <div className="form-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button
                                type="button"
                                onClick={(e) => handleDeleteTask(activeTask.id, e)}
                                style={{
                                    padding: '7px 14px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    background: '#fef2f2',
                                    color: '#dc2626',
                                    border: '1px solid #fecaca',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.15s ease',
                                }}
                                title="Permanently delete this task"
                            >
                                🗑 Delete Task
                            </button>
                            <button type="button" className="secondary-button" onClick={() => setActiveTask(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rich File Attachment Preview Modal */}
            {previewFile && (
                <div className="attachment-preview-modal" onMouseDown={(e) => e.target === e.currentTarget && setPreviewFile(null)}>
                    <div className="attachment-preview-card">
                        <div className="attachment-preview-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '22px' }}>
                                    {previewFile.name.endsWith('.pdf') ? '📄' : previewFile.name.match(/\.(png|jpg|jpeg|webp|svg|gif)$/i) ? '🖼️' : '💻'}
                                </span>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '14px', color: '#111827', fontWeight: 600 }}>{previewFile.name}</h3>
                                    <span style={{ fontSize: '11px', color: '#6b7280' }}>{previewFile.size} • Physical Attachment Preview</span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {previewFile.content && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard?.writeText(previewFile.content)
                                            setCopyCodeSuccess(true)
                                            setTimeout(() => setCopyCodeSuccess(false), 2000)
                                        }}
                                        style={{
                                            padding: '5px 10px',
                                            fontSize: '11.5px',
                                            background: '#f1f5f9',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                        }}
                                    >
                                        {copyCodeSuccess ? '✓ Copied' : '📋 Copy Code'}
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => triggerDownload(previewFile)}
                                    className="primary-button"
                                    style={{ padding: '6px 12px', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '5px' }}
                                >
                                    ⬇ Download File
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setPreviewFile(null)}
                                    style={{ background: 'none', border: 'none', fontSize: '20px', color: '#64748b', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                                    title="Close Preview"
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        <div className="attachment-preview-body">
                            {/* 1. Image Preview */}
                            {previewFile.name.match(/\.(png|jpg|jpeg|webp|svg|gif)$/i) ? (
                                <div style={{ textAlign: 'center', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                    <img
                                        src={previewFile.url || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260"><rect width="100%" height="100%" fill="%23f8fafc"/><text x="50%" y="50%" fill="%2364748b" text-anchor="middle" font-family="sans-serif">Image Preview</text></svg>'}
                                        alt={previewFile.name}
                                        style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    />
                                </div>
                            ) : previewFile.name.endsWith('.pdf') ? (
                                /* 2. PDF Preview */
                                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                                    {previewFile.url ? (
                                        <object
                                            data={previewFile.url}
                                            type="application/pdf"
                                            style={{ width: '100%', height: '520px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                        >
                                            <p style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                                                Your browser does not support inline PDF viewing. <button type="button" onClick={() => triggerDownload(previewFile)} style={{ color: '#ee785e', textDecoration: 'underline', border: 'none', background: 'none', cursor: 'pointer' }}>Click here to download the PDF.</button>
                                            </p>
                                        </object>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '40px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', maxWidth: '420px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                            <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>📄</span>
                                            <h4 style={{ margin: '0 0 6px', fontSize: '16px', color: '#1e293b' }}>PDF Document Ready</h4>
                                            <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#64748b' }}>{previewFile.name} ({previewFile.size})</p>
                                            <button
                                                type="button"
                                                onClick={() => triggerDownload(previewFile)}
                                                className="primary-button"
                                                style={{ width: '100%', justifyContent: 'center' }}
                                            >
                                                ⬇ Download & View Full PDF
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* 3. Code & Text File Syntax Preview */
                                <div style={{ width: '100%', height: '100%', background: '#0f172a', borderRadius: '10px', padding: '16px', overflowX: 'auto', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
                                        <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>📄 {previewFile.name}</span>
                                        <span style={{ fontSize: '10px', color: '#64748b' }}>Syntax Viewer</span>
                                    </div>
                                    <pre style={{ margin: 0, fontFamily: 'Consolas, Monaco, "Courier New", monospace', fontSize: '12.5px', color: '#38bdf8', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                        <code>{previewFile.content || `// Content for ${previewFile.name}\n// Attached to task execution pipeline.`}</code>
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}
