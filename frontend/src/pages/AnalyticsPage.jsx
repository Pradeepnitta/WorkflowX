import { useEffect, useMemo, useState } from 'react'
import { getOverview } from '../services/analyticsService.js'
import { getOrganizations, getOrganizationMembers } from '../services/organizationService.js'
import { getTasks } from '../services/taskService.js'
import { getProjects } from '../services/projectService.js'
import '../App.css'

export default function AnalyticsPage() {
    const [organizations, setOrganizations] = useState([])
    const [organizationId, setOrganizationId] = useState('')
    const [overview, setOverview] = useState(null)
    const [tasks, setTasks] = useState([])
    const [projects, setProjects] = useState([])
    const [members, setMembers] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [hoveredStatus, setHoveredStatus] = useState(null)
    const [hoveredProject, setHoveredProject] = useState(null)

    useEffect(() => {
        getOrganizations()
            .then((loadedOrganizations) => {
                const orgs = Array.isArray(loadedOrganizations) ? loadedOrganizations : []
                setOrganizations(orgs)
                if (orgs.length > 0) setOrganizationId(orgs[0].id)
            })
            .catch((requestError) => setError(requestError.message))
    }, [])

    useEffect(() => {
        if (!organizationId) { setOverview(null); return }
        setIsLoading(true)
        Promise.all([
            getOverview(organizationId).catch(() => null),
            getTasks().catch(() => []),
            getProjects(organizationId).catch(() => []),
            getOrganizationMembers(organizationId).catch(() => []),
        ])
            .then(([ov, loadedTasks, loadedProjects, loadedMembers]) => {
                setOverview(ov)
                setTasks(Array.isArray(loadedTasks) ? loadedTasks : [])
                setProjects(Array.isArray(loadedProjects) ? loadedProjects : [])
                setMembers(Array.isArray(loadedMembers) ? loadedMembers : [])
            })
            .catch((requestError) => setError(requestError.message))
            .finally(() => setIsLoading(false))
    }, [organizationId])

    const completed = overview?.completedTasks || 0
    const inProgress = overview?.inProgressTasks || 0
    const todo = overview?.todoTasks || 0
    const overdue = overview?.overdueTasks || 0
    const total = completed + inProgress + todo
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0

    const priorityCounts = useMemo(() => {
        const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
        tasks.forEach(t => {
            const p = t.priority || 'Medium'
            if (counts[p] !== undefined) counts[p]++
            else counts.Medium++
        })
        return counts
    }, [tasks])
    const totalPriority = tasks.length || 1

    const memberStats = useMemo(() => {
        return members.slice(0, 6).map(m => {
            const name = m.name || m.email || 'Member'
            const mTasks = tasks.filter(t => t.assignee === name || t.assignee === m.email || t.assignedTo === m.userId)
            return {
                name, role: m.role || 'MEMBER',
                total: mTasks.length,
                done: mTasks.filter(t => t.status === 'Done').length,
                inProgress: mTasks.filter(t => t.status === 'In progress').length,
                review: mTasks.filter(t => t.status === 'Review').length,
                initials: name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
            }
        })
    }, [members, tasks])

    const projectStats = useMemo(() => {
        return projects.slice(0, 6).map(p => {
            const pt = tasks.filter(t => t.project === p.name || t.projectId === p.id)
            const done = pt.filter(t => t.status === 'Done').length
            const ptTotal = pt.length
            return { ...p, taskCount: ptTotal, doneCount: done, completion: ptTotal > 0 ? Math.round((done / ptTotal) * 100) : 0 }
        })
    }, [projects, tasks])

    const statusData = [
        { label: 'Completed', value: completed, color: '#10b981', bg: '#d1fae5' },
        { label: 'In Progress', value: inProgress, color: '#f59e0b', bg: '#fef3c7' },
        { label: 'Todo', value: todo, color: '#3b82f6', bg: '#dbeafe' },
        { label: 'Overdue', value: overdue, color: '#ef4444', bg: '#fee2e2' },
    ].filter(d => d.value > 0)

    const DONUT_R = 70, DONUT_CX = 100, DONUT_CY = 100, STROKE_W = 26
    const circumference = 2 * Math.PI * DONUT_R
    let cumPct = 0
    const arcs = statusData.map(d => {
        const pct = total > 0 ? d.value / total : 0
        const strokeDasharray = `${pct * circumference} ${circumference}`
        const rotate = cumPct * 360 - 90
        cumPct += pct
        return { ...d, strokeDasharray, rotate }
    })

    const PRIORITY_COLORS = {
        Critical: { color: '#ef4444', bg: '#fee2e2', icon: 'ðŸ”¥' },
        High:     { color: '#f59e0b', bg: '#fef3c7', icon: 'âš¡' },
        Medium:   { color: '#3b82f6', bg: '#dbeafe', icon: 'â—' },
        Low:      { color: '#10b981', bg: '#d1fae5', icon: 'â—‹' },
    }

    return (
        <main className="feature-page">
            <div className="feature-heading">
                <div>
                    <p className="eyebrow">Manager &amp; Project Analytics</p>
                    <h1>Project Progress &amp; Analytics</h1>
                    <p className="heading-subtitle">Real-time task metrics, project completion, priority distribution, and team performance â€” all from live data.</p>
                </div>
                {(organizations?.length || 0) > 0 && (
                    <label className="organization-select">
                        Organization
                        <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
                            {organizations.map((org) => (
                                <option key={org.id} value={org.id}>{org.name}</option>
                            ))}
                        </select>
                    </label>
                )}
            </div>

            {error && <p className="service-error" role="alert">{error}</p>}
            {isLoading && <p className="loading-state">Loading analyticsâ€¦</p>}

            {/* Overall Progress Bar */}
            <section className="panel" style={{ padding: '24px', marginBottom: '24px', background: '#fff', border: '1px solid #ebe9e5', borderRadius: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                        <h2 style={{ margin: 0, font: "700 18px 'Space Grotesk'" }}>Overall Project Delivery Progress</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#858996' }}>Completion across {total} tracked tasks in this workspace.</p>
                    </div>
                    <strong style={{ fontSize: '28px', font: "700 28px 'Space Grotesk'", color: '#ee785e' }}>{progressPercent}%</strong>
                </div>
                <div style={{ width: '100%', height: '10px', background: '#ebe9e5', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{ width: `${progressPercent}%`, height: '100%', background: 'linear-gradient(90deg, #ee785e, #72b79a)', borderRadius: '5px', transition: 'width 0.6s ease' }} />
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
                    {statusData.map(d => (
                        <span key={d.label} style={{ fontSize: '12px', color: d.color, fontWeight: 600, background: d.bg, padding: '3px 10px', borderRadius: '20px' }}>
                            {d.label}: {d.value}
                        </span>
                    ))}
                </div>
            </section>

            {/* Stat Cards */}
            <section className="stats-grid" aria-label="Task Status Breakdown" style={{ marginBottom: '24px' }}>
                <div className="stat-card">
                    <span className="stat-icon green">âœ“</span>
                    <div><p>Completed Tasks</p><strong>{completed}</strong><small className="positive">â†— Successfully delivered</small></div>
                </div>
                <div className="stat-card">
                    <span className="stat-icon blue">â—·</span>
                    <div><p>In Progress</p><strong>{inProgress}</strong><small className="neutral">Active development</small></div>
                </div>
                <div className="stat-card">
                    <span className="stat-icon yellow">â—Œ</span>
                    <div><p>Todo / Backlog</p><strong>{todo}</strong><small className="neutral">Ready to pick up</small></div>
                </div>
                <div className="stat-card">
                    <span className="stat-icon coral">âš </span>
                    <div><p>Overdue</p><strong style={{ color: '#e96f59' }}>{overdue}</strong><small style={{ color: '#e96f59' }}>{overdue > 0 ? 'Needs follow-up' : 'None overdue âœ“'}</small></div>
                </div>
            </section>

            {/* Donut Chart + Priority Distribution */}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <div className="panel" style={{ padding: '24px', background: '#fff', border: '1px solid #ebe9e5', borderRadius: '10px' }}>
                    <h2 style={{ margin: '0 0 4px', font: "700 16px 'Space Grotesk'" }}>Task Status Distribution</h2>
                    <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#858996' }}>Live breakdown across all {total} tasks.</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {total === 0 ? (
                            <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                <div style={{ fontSize: 40, marginBottom: 8 }}>ðŸ“Š</div>
                                No tasks yet â€” create tasks to see analytics.
                            </div>
                        ) : (
                            <>
                                <svg viewBox="0 0 200 200" style={{ width: 160, height: 160, flexShrink: 0 }}>
                                    {arcs.map((arc) => (
                                        <circle key={arc.label} cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R} fill="none"
                                            stroke={arc.color} strokeWidth={STROKE_W}
                                            strokeDasharray={arc.strokeDasharray} strokeDashoffset={0}
                                            transform={`rotate(${arc.rotate} ${DONUT_CX} ${DONUT_CY})`}
                                            opacity={hoveredStatus === null || hoveredStatus === arc.label ? 1 : 0.3}
                                            style={{ cursor: 'pointer', transition: 'opacity 0.2s ease' }}
                                            onMouseEnter={() => setHoveredStatus(arc.label)}
                                            onMouseLeave={() => setHoveredStatus(null)}
                                        />
                                    ))}
                                    <text x={DONUT_CX} y={DONUT_CY - 8} textAnchor="middle" fontSize="22" fontWeight="700" fill="#1e293b">{progressPercent}%</text>
                                    <text x={DONUT_CX} y={DONUT_CY + 14} textAnchor="middle" fontSize="10" fill="#94a3b8">complete</text>
                                </svg>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {statusData.map(d => (
                                        <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: hoveredStatus === null || hoveredStatus === d.label ? 1 : 0.4, transition: 'opacity 0.2s' }}
                                            onMouseEnter={() => setHoveredStatus(d.label)} onMouseLeave={() => setHoveredStatus(null)}>
                                            <span style={{ width: 12, height: 12, background: d.color, borderRadius: '50%', flexShrink: 0 }} />
                                            <span style={{ fontSize: '13px', color: '#334155' }}>{d.label}</span>
                                            <strong style={{ fontSize: '13px', color: d.color, marginLeft: 'auto' }}>{d.value}</strong>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="panel" style={{ padding: '24px', background: '#fff', border: '1px solid #ebe9e5', borderRadius: '10px' }}>
                    <h2 style={{ margin: '0 0 4px', font: "700 16px 'Space Grotesk'" }}>Priority Distribution</h2>
                    <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#858996' }}>Priority allocation across {tasks.length} live tasks.</p>
                    {tasks.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                            <div style={{ fontSize: 40, marginBottom: 8 }}>ðŸ“‹</div>No tasks yet.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {Object.entries(priorityCounts).map(([priority, count]) => {
                                const meta = PRIORITY_COLORS[priority] || PRIORITY_COLORS.Medium
                                const pct = Math.round((count / totalPriority) * 100)
                                return (
                                    <div key={priority}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '5px', alignItems: 'center' }}>
                                            <span style={{ background: meta.bg, color: meta.color, padding: '1px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>{meta.icon} {priority}</span>
                                            <span style={{ fontWeight: 700, color: meta.color }}>{count} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({pct}%)</span></span>
                                        </div>
                                        <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', background: meta.color, borderRadius: '4px', transition: 'width 0.6s ease' }} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* Project Completion Tracker */}
            <section className="panel" style={{ marginBottom: '24px', padding: '24px', background: '#fff', border: '1px solid #ebe9e5', borderRadius: '10px' }}>
                <h2 style={{ margin: '0 0 4px', font: "700 18px 'Space Grotesk'" }}>Project Completion Tracker</h2>
                <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#858996' }}>Live delivery progress per project.</p>
                {projects.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                        <div style={{ fontSize: 40, marginBottom: 8 }}>ðŸš€</div>
                        No projects found. Create projects to track their progress here.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                        {projectStats.map(p => (
                            <div key={p.id}
                                style={{ background: hoveredProject === p.id ? '#f8fafc' : '#fff', border: `1px solid ${hoveredProject === p.id ? '#94a3b8' : '#e2e8f0'}`, borderRadius: '10px', padding: '16px', cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: hoveredProject === p.id ? '0 4px 12px rgba(0,0,0,0.08)' : 'none' }}
                                onMouseEnter={() => setHoveredProject(p.id)} onMouseLeave={() => setHoveredProject(null)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{p.name}</span>
                                    <span style={{ fontSize: '18px', fontWeight: 800, color: p.completion >= 80 ? '#10b981' : p.completion >= 40 ? '#f59e0b' : '#ef4444' }}>{p.completion}%</span>
                                </div>
                                <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                                    <div style={{ width: `${p.completion}%`, height: '100%', background: p.completion >= 80 ? '#10b981' : p.completion >= 40 ? '#f59e0b' : '#ef4444', borderRadius: '3px', transition: 'width 0.6s ease' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                                    <span>{p.doneCount}/{p.taskCount} tasks done</span>
                                    <span style={{ background: p.status === 'Active' ? '#dcfce7' : '#f1f5f9', color: p.status === 'Active' ? '#16a34a' : '#64748b', padding: '1px 8px', borderRadius: '10px', fontWeight: 600 }}>{p.status || 'Active'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Team Member Velocity Breakdown */}
            <section className="panel" style={{ marginBottom: '24px', padding: '24px', background: '#fff', border: '1px solid #ebe9e5', borderRadius: '10px' }}>
                <h2 style={{ margin: '0 0 4px', font: "700 18px 'Space Grotesk'" }}>Team Member Velocity Breakdown</h2>
                <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#858996' }}>Individual task ownership and delivery throughput from live data.</p>
                {members.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                        <div style={{ fontSize: 40, marginBottom: 8 }}>ðŸ‘¥</div>No members found in this organization.
                    </div>
                ) : (
                    <div className="activity-list">
                        {memberStats.map((m, i) => {
                            const avatarColors = ['coral-bg', 'blue-bg', 'yellow-bg', 'green-bg', 'purple-bg']
                            return (
                                <div key={m.name} className="activity-item">
                                    <span className={`activity-avatar ${avatarColors[i % avatarColors.length]}`}>{m.initials}</span>
                                    <p>
                                        <strong>{m.name}</strong> ({m.role}) â€¢ {m.total} task{m.total !== 1 ? 's' : ''} assigned
                                        {m.inProgress > 0 && `, ${m.inProgress} in progress`}
                                        {m.review > 0 && `, ${m.review} in review`}
                                        {m.done > 0 && `, ${m.done} completed`}
                                        <small>{m.total === 0 ? 'No tasks assigned yet' : `${m.done}/${m.total} delivered`}</small>
                                    </p>
                                </div>
                            )
                        })}
                    </div>
                )}
            </section>

            {/* Summary Stats Footer */}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
                {[
                    { label: 'ACTIVE PROJECTS', value: projects.length, color: '#1e293b' },
                    { label: 'TEAM MEMBERS', value: members.length, color: '#1e293b' },
                    { label: 'TOTAL TASKS', value: total, color: '#1e293b' },
                    { label: 'OVERDUE TASKS', value: overdue, color: overdue > 0 ? '#ef4444' : '#10b981' },
                ].map(s => (
                    <div key={s.label} style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <div style={{ fontSize: '28px', fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, marginTop: '4px' }}>{s.label}</div>
                    </div>
                ))}
            </section>
        </main>
    )
}

