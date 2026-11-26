import { useEffect, useMemo, useState } from 'react'
import { getOverview } from '../services/analyticsService.js'
import { getOrganizations } from '../services/organizationService.js'
import '../App.css'

export default function AnalyticsPage() {
    const [organizations, setOrganizations] = useState([])
    const [organizationId, setOrganizationId] = useState('')
    const [overview, setOverview] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [hoveredStatus, setHoveredStatus] = useState(null)
    const [hoveredProject, setHoveredProject] = useState(null)

    useEffect(() => {
        getOrganizations()
            .then((loadedOrganizations) => {
                const orgs = Array.isArray(loadedOrganizations) ? loadedOrganizations : []
                setOrganizations(orgs)
                if (orgs.length > 0) {
                    setOrganizationId(orgs[0].id)
                } else {
                    setIsLoading(false)
                }
            })
            .catch((requestError) => {
                setError(requestError.message)
                setIsLoading(false)
            })
    }, [])

    useEffect(() => {
        if (!organizationId) return
        getOverview(organizationId)
            .then(setOverview)
            .catch((requestError) => setError(requestError.message))
            .finally(() => setIsLoading(false))
    }, [organizationId])

    const completed = overview?.completedTasks || 0
    const inProgress = overview?.inProgressTasks || 0
    const todo = overview?.todoTasks || 0
    const overdue = overview?.overdueTasks || 0
    const review = overview?.tasksUnderReview || 0
    const total = overview?.tasks || (completed + inProgress + todo + review)
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0

    const priorityCounts = useMemo(() => {
        const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
        const distribution = overview?.priorityDistribution || []
        distribution.forEach(({ priority, count }) => {
            const label = priority === 'URGENT' ? 'Critical' : priority
            if (counts[label] !== undefined) counts[label] = Number(count)
        })
        return counts
    }, [overview])
    const totalPriority = total || 1

    const memberStats = useMemo(() => {
        return (overview?.developerWorkload || []).slice(0, 6).map(m => {
            const name = m.name || m.email || 'Member'
            return {
                name,
                role: 'MEMBER',
                total: Number(m.totalTasks) || 0,
                done: Number(m.completedTasks) || 0,
                inProgress: Number(m.inProgressTasks) || 0,
                review: Number(m.reviewTasks) || 0,
                initials: name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
            }
        })
    }, [overview])

    const projectStats = useMemo(() => {
        return (overview?.projectStats || []).slice(0, 6).map(project => ({
            ...project,
            taskCount: Number(project.taskCount) || 0,
            doneCount: Number(project.completedTasks) || 0,
            completion: Number(project.progress) || 0,
        }))
    }, [overview])

    const statusData = [
        { label: 'Completed', value: completed, color: '#10b981', bg: '#d1fae5' },
        { label: 'In Progress', value: inProgress, color: '#f59e0b', bg: '#fef3c7' },
        { label: 'Todo', value: todo, color: '#3b82f6', bg: '#dbeafe' },
        { label: 'Review', value: review, color: '#8b5cf6', bg: '#ede9fe' },
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
                        <select value={organizationId} onChange={(event) => {
                            setIsLoading(true)
                            setError('')
                            setOverview(null)
                            setOrganizationId(event.target.value)
                        }}>
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
                    <span className="stat-icon coral">!</span>
                    <div><p>Overdue</p><strong style={{ color: '#e96f59' }}>{overdue}</strong><small style={{ color: '#e96f59' }}>{overdue > 0 ? 'Needs follow-up' : 'No overdue tasks'}</small></div>
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
                    <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#858996' }}>Priority allocation across {total} live tasks.</p>
                    {total === 0 ? (
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
                {(overview?.projectStats || []).length === 0 ? (
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
                {(overview?.developerWorkload || []).length === 0 ? (
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

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <div className="panel" style={{ padding: '24px', background: '#fff', border: '1px solid #ebe9e5', borderRadius: '10px' }}>
                    <h2 style={{ margin: '0 0 4px', font: "700 18px 'Space Grotesk'" }}>Weekly Task Completion</h2>
                    <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#858996' }}>Tasks completed over the last seven days.</p>
                    <div style={{ display: 'flex', alignItems: 'end', gap: '10px', height: '150px' }}>
                        {(overview?.weeklyTaskCompletion || []).map(day => {
                            const weekly = overview?.weeklyTaskCompletion || []
                            const max = Math.max(1, ...weekly.map(item => Number(item.completed) || 0))
                            const value = Number(day.completed) || 0
                            return (
                                <div key={day.date} title={`${value} completed`} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'end', alignItems: 'center', gap: '7px' }}>
                                    <strong style={{ color: '#64748b', fontSize: '10px' }}>{value}</strong>
                                    <div style={{ width: '100%', maxWidth: '34px', height: `${Math.max(4, value / max * 100)}%`, borderRadius: '5px 5px 2px 2px', background: '#5b4beb' }} />
                                    <small style={{ color: '#64748b', fontSize: '10px' }}>{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</small>
                                </div>
                            )
                        })}
                        {!(overview?.weeklyTaskCompletion || []).length && <p style={{ color: '#64748b', fontSize: '12px' }}>No weekly completion data yet.</p>}
                    </div>
                </div>
                <div className="panel" style={{ padding: '24px', background: '#fff', border: '1px solid #ebe9e5', borderRadius: '10px' }}>
                    <h2 style={{ margin: '0 0 4px', font: "700 18px 'Space Grotesk'" }}>Team Productivity</h2>
                    <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#858996' }}>Assigned work and delivery by managed team.</p>
                    {(overview?.teamStats || []).length === 0 ? (
                        <p style={{ color: '#64748b', fontSize: '12px' }}>No team productivity data available.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
                            {overview.teamStats.slice(0, 6).map(team => {
                                const activeCount = Number(team.activeTasks) || 0
                                const doneCount = Number(team.completedTasks) || 0
                                const delivery = activeCount ? Math.round(doneCount / activeCount * 100) : 0
                                return (
                                    <div key={team.id}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', marginBottom: '5px' }}>
                                            <strong>{team.name}</strong>
                                            <span style={{ color: '#64748b' }}>{doneCount} completed - {team.developers} developers</span>
                                        </div>
                                        <div style={{ height: '7px', background: '#f1f5f9', borderRadius: '5px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${delivery}%`, background: '#22c55e' }} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </section>

            <section className="panel" style={{ marginBottom: '24px', padding: '24px', background: '#fff', border: '1px solid #ebe9e5', borderRadius: '10px' }}>
                <h2 style={{ margin: '0 0 4px', font: "700 18px 'Space Grotesk'" }}>Upcoming Project Deadlines</h2>
                <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#858996' }}>Open tasks due within the next two weeks.</p>
                {(overview?.deadlineTracking || []).length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '12px' }}>No upcoming deadlines.</p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                        {overview.deadlineTracking.map(item => (
                            <div key={item.id} style={{ padding: '12px', border: '1px solid #edf0f5', borderRadius: '8px' }}>
                                <strong style={{ color: '#1e293b', fontSize: '13px' }}>{item.title}</strong>
                                <div style={{ marginTop: '5px', color: '#64748b', fontSize: '11px' }}>{item.projectName} - {item.assigneeName || 'Unassigned'}</div>
                                <div style={{ marginTop: '8px', color: '#b45309', fontSize: '11px', fontWeight: 700 }}>{new Date(item.dueDate).toLocaleDateString()}</div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Summary Stats Footer */}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
                {[
                    { label: 'ACTIVE PROJECTS', value: overview?.activeProjects || 0, color: '#1e293b' },
                    { label: 'TEAM MEMBERS', value: overview?.totalDevelopers || 0, color: '#1e293b' },
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

