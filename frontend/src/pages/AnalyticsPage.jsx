import { useEffect, useState } from 'react'
import { getOverview } from '../services/analyticsService.js'
import { getOrganizations } from '../services/organizationService.js'
import '../App.css'

export default function AnalyticsPage() {
    const [organizations, setOrganizations] = useState([])
    const [organizationId, setOrganizationId] = useState('')
    const [overview, setOverview] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')

    // Interactive Burndown Chart State
    const [selectedSprint, setSelectedSprint] = useState('sprint-14')
    const [burndownMetric, setBurndownMetric] = useState('points') // 'points' | 'tasks'
    const [hoveredPoint, setHoveredPoint] = useState(null)

    // Interactive Velocity Graph State
    const [hoveredVelocitySprint, setHoveredVelocitySprint] = useState(null)

    useEffect(() => {
        getOrganizations()
            .then((loadedOrganizations) => {
                const orgs = Array.isArray(loadedOrganizations) ? loadedOrganizations : []
                setOrganizations(orgs)
                if (orgs.length > 0) {
                    setOrganizationId(orgs[0].id)
                }
            })
            .catch((requestError) => setError(requestError.message))
            .finally(() => setIsLoading(false))
    }, [])

    useEffect(() => {
        if (!organizationId) {
            setOverview(null)
            return
        }
        setIsLoading(true)
        getOverview(organizationId)
            .then(setOverview)
            .catch((requestError) => setError(requestError.message))
            .finally(() => setIsLoading(false))
    }, [organizationId])

    const completed = overview?.completedTasks || 0
    const inProgress = overview?.inProgressTasks || 0
    const todo = overview?.todoTasks || 0
    const overdue = overview?.overdueTasks || 0
    const total = completed + inProgress + todo
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0

    // Burndown data configurations
    const burndownData = {
        'sprint-14': {
            name: 'Sprint 14 (Active)',
            totalPoints: 100,
            remainingPoints: 32,
            points: [
                { day: 'Day 1', x: 50, y: 30, val: 100, ideal: 100, status: 'Sprint Kickoff' },
                { day: 'Day 2', x: 110, y: 40, val: 92, ideal: 92, status: 'Architecture approved' },
                { day: 'Day 3', x: 170, y: 45, val: 88, ideal: 85, status: 'DB schemas migrated' },
                { day: 'Day 4', x: 230, y: 60, val: 78, ideal: 77, status: 'Auth APIs complete' },
                { day: 'Day 5', x: 290, y: 75, val: 68, ideal: 69, status: 'Frontend layouts merged' },
                { day: 'Day 6', x: 350, y: 90, val: 56, ideal: 62, status: 'Kanban DND added' },
                { day: 'Day 7', x: 410, y: 110, val: 44, ideal: 54, status: 'Sockets connected' },
                { day: 'Day 8', x: 470, y: 125, val: 38, ideal: 46, status: 'Attachment upload live' },
                { day: 'Day 9 (Today)', x: 530, y: 145, val: 32, ideal: 38, status: 'Charts & analytics on track' },
            ]
        },
        'sprint-13': {
            name: 'Sprint 13 (Completed)',
            totalPoints: 95,
            remainingPoints: 0,
            points: [
                { day: 'Day 1', x: 50, y: 30, val: 95, ideal: 95, status: 'Sprint Start' },
                { day: 'Day 3', x: 170, y: 55, val: 80, ideal: 81, status: 'Core modules' },
                { day: 'Day 6', x: 350, y: 105, val: 50, ideal: 60, status: 'Mid sprint review' },
                { day: 'Day 9', x: 530, y: 155, val: 26, ideal: 40, status: 'Testing phase' },
                { day: 'Day 12', x: 710, y: 195, val: 8, ideal: 15, status: 'Final bugfixes' },
                { day: 'Day 14', x: 770, y: 210, val: 0, ideal: 0, status: 'Sprint Delivered' },
            ]
        }
    }

    const activeBurndown = burndownData[selectedSprint] || burndownData['sprint-14']

    // Historical Velocity Data
    const velocityData = [
        { sprint: 'Sprint 10', planned: 40, completed: 38, rate: '95%' },
        { sprint: 'Sprint 11', planned: 44, completed: 42, rate: '95.5%' },
        { sprint: 'Sprint 12', planned: 48, completed: 47, rate: '97.9%' },
        { sprint: 'Sprint 13', planned: 50, completed: 48, rate: '96.0%' },
        { sprint: 'Sprint 14', planned: 52, completed: 50, rate: '96.2%' },
    ]

    return (
        <main className="feature-page">
            <div className="feature-heading">
                <div>
                    <p className="eyebrow">Manager & Project Analytics</p>
                    <h1>Project Progress & Analytics</h1>
                    <p className="heading-subtitle">Interactive burndown trajectories, historical team velocity graphs, and delivery predictability.</p>
                </div>
                {(organizations?.length || 0) > 0 && (
                    <label className="organization-select">
                        Organization
                        <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
                            {organizations.map((org) => (
                                <option key={org.id} value={org.id}>
                                    {org.name}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>

            {error && <p className="service-error" role="alert">{error}</p>}
            {isLoading && <p className="loading-state">Loading analytics...</p>}

            {/* Manager Progress Bar Card */}
            <section className="panel" style={{ padding: '24px', marginBottom: '24px', background: '#fff', border: '1px solid #ebe9e5', borderRadius: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                        <h2 style={{ margin: 0, font: "700 18px 'Space Grotesk'" }}>Overall Project Delivery Progress</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#858996' }}>Comprehensive completion status across all active roadmap milestones.</p>
                    </div>
                    <strong style={{ fontSize: '28px', font: "700 28px 'Space Grotesk'", color: '#ee785e' }}>{progressPercent}%</strong>
                </div>

                <div style={{ width: '100%', height: '10px', background: '#ebe9e5', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{ width: `${progressPercent}%`, height: '100%', background: 'linear-gradient(90deg, #ee785e, #72b79a)', borderRadius: '5px' }} />
                </div>
            </section>

            {/* Task Breakdown for Manager Decision-Making */}
            <section className="stats-grid" aria-label="Task Status Breakdown" style={{ marginBottom: '24px' }}>
                <div className="stat-card">
                    <span className="stat-icon green">✓</span>
                    <div>
                        <p>Completed Tasks</p>
                        <strong>{completed}</strong>
                        <small className="positive">↗ Successfully delivered</small>
                    </div>
                </div>

                <div className="stat-card">
                    <span className="stat-icon blue">◷</span>
                    <div>
                        <p>In Progress</p>
                        <strong>{inProgress}</strong>
                        <small className="neutral">Active development</small>
                    </div>
                </div>

                <div className="stat-card">
                    <span className="stat-icon yellow">◌</span>
                    <div>
                        <p>Todo / Backlog</p>
                        <strong>{todo}</strong>
                        <small className="neutral">Ready to pick up</small>
                    </div>
                </div>

                <div className="stat-card">
                    <span className="stat-icon coral">⚠</span>
                    <div>
                        <p>Overdue</p>
                        <strong style={{ color: '#e96f59' }}>{overdue}</strong>
                        <small style={{ color: '#e96f59' }}>Needs follow-up</small>
                    </div>
                </div>
            </section>

            {/* 1. Interactive Sprint Burndown Chart */}
            <section className="panel" style={{ marginBottom: '24px', padding: '24px', background: '#fff', border: '1px solid #ebe9e5', borderRadius: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
                    <div>
                        <p className="eyebrow" style={{ color: '#ee785e' }}>Sprint Execution & Burndown</p>
                        <h2 style={{ margin: 0, font: "700 18px 'Space Grotesk'" }}>Interactive Sprint Burndown Chart</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#858996' }}>Hover over any milestone point to inspect ideal vs actual remaining points.</p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        {/* Sprint Switcher */}
                        <div style={{ display: 'flex', background: '#f3f4f6', padding: '3px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                            <button
                                type="button"
                                onClick={() => setSelectedSprint('sprint-14')}
                                style={{
                                    padding: '5px 12px',
                                    fontSize: '11px',
                                    fontWeight: selectedSprint === 'sprint-14' ? '700' : '500',
                                    background: selectedSprint === 'sprint-14' ? '#ffffff' : 'transparent',
                                    color: selectedSprint === 'sprint-14' ? '#ee785e' : '#4b5563',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                }}
                            >
                                Sprint 14 (Active)
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedSprint('sprint-13')}
                                style={{
                                    padding: '5px 12px',
                                    fontSize: '11px',
                                    fontWeight: selectedSprint === 'sprint-13' ? '700' : '500',
                                    background: selectedSprint === 'sprint-13' ? '#ffffff' : 'transparent',
                                    color: selectedSprint === 'sprint-13' ? '#ee785e' : '#4b5563',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                }}
                            >
                                Sprint 13 (Completed)
                            </button>
                        </div>

                        {/* Legend */}
                        <div style={{ display: 'flex', gap: '14px', fontSize: '12px', alignItems: 'center' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '12px', height: '3px', background: '#94a3b8', display: 'inline-block' }} /> Ideal Line
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', color: '#ee785e' }}>
                                <span style={{ width: '12px', height: '3px', background: '#ee785e', display: 'inline-block' }} /> Actual Remaining ({activeBurndown.remainingPoints} pts)
                            </span>
                        </div>
                    </div>
                </div>

                {/* SVG Responsive Burndown Chart */}
                <div style={{ width: '100%', overflowX: 'auto', position: 'relative' }}>
                    <svg viewBox="0 0 800 240" style={{ width: '100%', minWidth: '650px', height: 'auto', display: 'block' }}>
                        {/* Grid lines */}
                        <line x1="50" y1="30" x2="770" y2="30" stroke="#f3f4f6" strokeWidth="1" />
                        <line x1="50" y1="75" x2="770" y2="75" stroke="#f3f4f6" strokeWidth="1" />
                        <line x1="50" y1="120" x2="770" y2="120" stroke="#f3f4f6" strokeWidth="1" />
                        <line x1="50" y1="165" x2="770" y2="165" stroke="#f3f4f6" strokeWidth="1" />
                        <line x1="50" y1="210" x2="770" y2="210" stroke="#e5e7eb" strokeWidth="1.5" />

                        {/* Y-axis labels */}
                        <text x="25" y="34" fontSize="10" fill="#9ca3af" textAnchor="middle">100pt</text>
                        <text x="25" y="79" fontSize="10" fill="#9ca3af" textAnchor="middle">75pt</text>
                        <text x="25" y="124" fontSize="10" fill="#9ca3af" textAnchor="middle">50pt</text>
                        <text x="25" y="169" fontSize="10" fill="#9ca3af" textAnchor="middle">25pt</text>
                        <text x="25" y="213" fontSize="10" fill="#9ca3af" textAnchor="middle">0pt</text>

                        {/* Ideal trajectory line */}
                        <line x1="50" y1="30" x2="770" y2="210" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5,5" />

                        {/* Actual remaining area gradient */}
                        <defs>
                            <linearGradient id="burndownGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#ee785e" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#ee785e" stopOpacity="0.0" />
                            </linearGradient>
                        </defs>

                        {/* Area Polygon */}
                        <polygon
                            points={`50,30 ${activeBurndown.points.map((p) => `${p.x},${p.y}`).join(' ')} ${activeBurndown.points[activeBurndown.points.length - 1].x},210 50,210`}
                            fill="url(#burndownGrad)"
                        />

                        {/* Actual remaining polyline */}
                        <polyline
                            points={activeBurndown.points.map((p) => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke="#ee785e"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />

                        {/* Interactive Milestone Circles */}
                        {activeBurndown.points.map((pt, i) => {
                            const isHovered = hoveredPoint?.day === pt.day
                            return (
                                <g
                                    key={i}
                                    style={{ cursor: 'pointer' }}
                                    onMouseEnter={() => setHoveredPoint(pt)}
                                    onMouseLeave={() => setHoveredPoint(null)}
                                >
                                    {isHovered && (
                                        <circle cx={pt.x} cy={pt.y} r="10" fill="#ee785e" fillOpacity="0.2" />
                                    )}
                                    <circle
                                        cx={pt.x}
                                        cy={pt.y}
                                        r={isHovered ? 6.5 : 4.5}
                                        fill="#ffffff"
                                        stroke="#ee785e"
                                        strokeWidth={isHovered ? 3.5 : 2.5}
                                        style={{ transition: 'all 0.15s ease' }}
                                    />
                                </g>
                            )
                        })}

                        {/* X-axis days */}
                        {['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7', 'Day 8', 'Day 9 (Today)', 'Day 10', 'Day 11', 'Day 12', 'Day 14'].map((day, i) => {
                            const x = 50 + (i * 60)
                            return (
                                <text key={i} x={x} y="230" fontSize="9.5" fill={i === 8 ? '#ee785e' : '#9ca3af'} fontWeight={i === 8 ? '700' : 'normal'} textAnchor="middle">
                                    {day}
                                </text>
                            )
                        })}
                    </svg>

                    {/* Interactive Tooltip Callout */}
                    {hoveredPoint && (
                        <div
                            style={{
                                position: 'absolute',
                                left: `${Math.min(hoveredPoint.x, 620)}px`,
                                top: `${Math.max(hoveredPoint.y - 65, 10)}px`,
                                background: '#1e293b',
                                color: '#ffffff',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                pointerEvents: 'none',
                                boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
                                zIndex: 10,
                                transform: 'translateX(-50%)',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <div style={{ fontWeight: '700', color: '#fca5a5', marginBottom: '2px' }}>{hoveredPoint.day}</div>
                            <div>Remaining: <b>{hoveredPoint.val} pts</b> (Ideal: {hoveredPoint.ideal} pts)</div>
                            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{hoveredPoint.status}</div>
                        </div>
                    )}
                </div>
            </section>

            {/* 2. Interactive Team Velocity Graph (Historical & Predictability) */}
            <section className="panel" style={{ marginBottom: '24px', padding: '24px', background: '#fff', border: '1px solid #ebe9e5', borderRadius: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
                    <div>
                        <p className="eyebrow" style={{ color: '#2563eb' }}>Engineering Throughput</p>
                        <h2 style={{ margin: 0, font: "700 18px 'Space Grotesk'" }}>Team Velocity & Sprint Output Graph</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#858996' }}>Committed vs completed story points across the last 5 delivery sprints.</p>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '12px', height: '12px', background: '#cbd5e1', borderRadius: '3px', display: 'inline-block' }} /> Planned Commitment
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
                            <span style={{ width: '12px', height: '12px', background: '#ee785e', borderRadius: '3px', display: 'inline-block' }} /> Completed Velocity
                        </span>
                    </div>
                </div>

                {/* Velocity SVG Bar Chart */}
                <div style={{ width: '100%', overflowX: 'auto', position: 'relative' }}>
                    <svg viewBox="0 0 800 240" style={{ width: '100%', minWidth: '650px', height: 'auto', display: 'block' }}>
                        {/* Grid lines */}
                        <line x1="50" y1="30" x2="770" y2="30" stroke="#f3f4f6" strokeWidth="1" />
                        <line x1="50" y1="75" x2="770" y2="75" stroke="#f3f4f6" strokeWidth="1" />
                        <line x1="50" y1="120" x2="770" y2="120" stroke="#f3f4f6" strokeWidth="1" />
                        <line x1="50" y1="165" x2="770" y2="165" stroke="#f3f4f6" strokeWidth="1" />
                        <line x1="50" y1="210" x2="770" y2="210" stroke="#e5e7eb" strokeWidth="1.5" />

                        {/* Y-axis labels */}
                        <text x="25" y="34" fontSize="10" fill="#9ca3af" textAnchor="middle">60pt</text>
                        <text x="25" y="79" fontSize="10" fill="#9ca3af" textAnchor="middle">45pt</text>
                        <text x="25" y="124" fontSize="10" fill="#9ca3af" textAnchor="middle">30pt</text>
                        <text x="25" y="169" fontSize="10" fill="#9ca3af" textAnchor="middle">15pt</text>
                        <text x="25" y="213" fontSize="10" fill="#9ca3af" textAnchor="middle">0pt</text>

                        {/* Bars for Each Sprint */}
                        {velocityData.map((item, index) => {
                            const groupX = 110 + (index * 135)
                            const plannedHeight = (item.planned / 60) * 180
                            const completedHeight = (item.completed / 60) * 180
                            const isHovered = hoveredVelocitySprint?.sprint === item.sprint

                            return (
                                <g
                                    key={item.sprint}
                                    style={{ cursor: 'pointer' }}
                                    onMouseEnter={() => setHoveredVelocitySprint(item)}
                                    onMouseLeave={() => setHoveredVelocitySprint(null)}
                                >
                                    {/* Planned Bar */}
                                    <rect
                                        x={groupX}
                                        y={210 - plannedHeight}
                                        width="32"
                                        height={plannedHeight}
                                        fill="#cbd5e1"
                                        rx="4"
                                        opacity={isHovered ? 0.9 : 0.7}
                                        style={{ transition: 'all 0.2s ease' }}
                                    />
                                    {/* Completed Bar */}
                                    <rect
                                        x={groupX + 38}
                                        y={210 - completedHeight}
                                        width="32"
                                        height={completedHeight}
                                        fill="#ee785e"
                                        rx="4"
                                        opacity={isHovered ? 1 : 0.85}
                                        style={{ transition: 'all 0.2s ease' }}
                                    />

                                    {/* Number Labels over bars */}
                                    <text x={groupX + 16} y={205 - plannedHeight} fontSize="9.5" fill="#64748b" textAnchor="middle">{item.planned}</text>
                                    <text x={groupX + 54} y={205 - completedHeight} fontSize="9.5" fill="#ee785e" fontWeight="700" textAnchor="middle">{item.completed}</text>

                                    {/* X-axis label */}
                                    <text x={groupX + 35} y="228" fontSize="10.5" fill={isHovered ? '#ee785e' : '#334155'} fontWeight={isHovered ? '700' : '600'} textAnchor="middle">
                                        {item.sprint}
                                    </text>
                                </g>
                            )
                        })}
                    </svg>

                    {/* Velocity Hover Tooltip */}
                    {hoveredVelocitySprint && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '20px',
                                right: '20px',
                                background: '#1e293b',
                                color: '#ffffff',
                                padding: '10px 14px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                pointerEvents: 'none',
                                boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
                                zIndex: 10,
                            }}
                        >
                            <div style={{ fontWeight: '700', color: '#ee785e', marginBottom: '4px' }}>
                                {hoveredVelocitySprint.sprint} Metrics
                            </div>
                            <div>Planned Commitment: <b>{hoveredVelocitySprint.planned} pts</b></div>
                            <div>Delivered Velocity: <b>{hoveredVelocitySprint.completed} pts</b></div>
                            <div style={{ marginTop: '4px', fontSize: '11px', color: '#34d399', fontWeight: '600' }}>
                                ✓ Completion Rate: {hoveredVelocitySprint.rate}
                            </div>
                        </div>
                    )}
                </div>

                {/* Historical Velocity Stats Overview */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginTop: '18px', paddingTop: '18px', borderTop: '1px solid #f3f4f6' }}>
                    <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Rolling Average Velocity</span>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '4px' }}>47.0 pts / sprint</div>
                        <small style={{ color: '#16a34a', fontSize: '11px' }}>↗ +12.5% increase over 5 sprints</small>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Sprint Predictability</span>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '4px' }}>96.1%</div>
                        <small style={{ color: '#2563eb', fontSize: '11px' }}>High delivery confidence</small>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Throughput Rate</span>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '4px' }}>3.6 tasks / day</div>
                        <small style={{ color: '#16a34a', fontSize: '11px' }}>Zero blocked deliverables</small>
                    </div>
                </div>
            </section>

            {/* Workload & Priorities Insights */}
            <section className="feature-grid">
                <section className="project-list-panel panel" style={{ flex: '1 1 500px' }}>
                    <div className="panel-heading">
                        <div>
                            <h2>Priority Distribution</h2>
                            <p>Priority allocation across current sprints.</p>
                        </div>
                    </div>
                    <div style={{ padding: '0 22px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                <span>Critical (e.g. Payment & Auth)</span>
                                <b>15%</b>
                            </div>
                            <div style={{ height: '6px', background: '#ebe9e5', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: '15%', height: '100%', background: '#ee785e' }} />
                            </div>
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                <span>High (e.g. Kanban & Sockets)</span>
                                <b>40%</b>
                            </div>
                            <div style={{ height: '6px', background: '#ebe9e5', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: '40%', height: '100%', background: '#f2c85b' }} />
                            </div>
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                <span>Medium (e.g. Profile Page)</span>
                                <b>30%</b>
                            </div>
                            <div style={{ height: '6px', background: '#ebe9e5', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: '30%', height: '100%', background: '#6d9ee8' }} />
                            </div>
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                <span>Low (e.g. UI Polish)</span>
                                <b>15%</b>
                            </div>
                            <div style={{ height: '6px', background: '#ebe9e5', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: '15%', height: '100%', background: '#72b79a' }} />
                            </div>
                        </div>
                    </div>
                </section>

                <section className="project-list-panel panel" style={{ flex: '1 1 500px' }}>
                    <div className="panel-heading">
                        <div>
                            <h2>Team Member Velocity Breakdown</h2>
                            <p>Individual delivery throughput and capacity allocation.</p>
                        </div>
                    </div>
                    <div className="activity-list">
                        <div className="activity-item">
                            <span className="activity-avatar coral-bg">PR</span>
                            <p><strong>Pradeep (Lead)</strong> • 8 tasks assigned (6 in progress, 2 completed)<small>Velocity: 2.8 pts/day • High throughput</small></p>
                        </div>
                        <div className="activity-item">
                            <span className="activity-avatar blue-bg">AN</span>
                            <p><strong>Anil (Dev)</strong> • 5 tasks assigned (3 in progress, 2 in review)<small>Velocity: 1.9 pts/day • Steady delivery</small></p>
                        </div>
                        <div className="activity-item">
                            <span className="activity-avatar yellow-bg">SN</span>
                            <p><strong>Sneha (QA)</strong> • 4 tasks assigned (QA testing & validation)<small>Velocity: 2.1 pts/day • Release ready</small></p>
                        </div>
                    </div>
                </section>
            </section>
        </main>
    )
}
