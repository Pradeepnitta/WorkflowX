import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOrganizations, getOrganizationMembers } from '../services/organizationService.js'
import { createTeam, getTeams, addTeamMember, removeTeamMember, updateTeam, deleteTeam } from '../services/teamService.js'
import { getProjects } from '../services/projectService.js'
import { connectSocket } from '../services/socketService.js'
import '../App.css'


const DEPARTMENTS = ['All Teams', 'Engineering', 'Quality Assurance', 'DevOps & SRE', 'Product & Design']

function inferDepartment(name, dept) {
    if (dept && dept !== 'General' && DEPARTMENTS.includes(dept)) return dept
    const n = (name || '').toLowerCase()
    if (n.includes('qa') || n.includes('quality') || n.includes('test')) return 'Quality Assurance'
    if (n.includes('devops') || n.includes('sre') || n.includes('infra') || n.includes('cloud')) return 'DevOps & SRE'
    if (n.includes('product') || n.includes('design') || n.includes('ux') || n.includes('ui')) return 'Product & Design'
    return 'Engineering'
}

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

export default function TeamsPage() {
    const navigate = useNavigate()
    const [organizations, setOrganizations] = useState([])
    const [organizationId, setOrganizationId] = useState('')
    const [teams, setTeams] = useState([])
    const [orgMembers, setOrgMembers] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [toastMessage, setToastMessage] = useState('')
    const [error, setError] = useState('')

    // Filters and layout
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedDept, setSelectedDept] = useState('All Teams')
    const [viewMode, setViewMode] = useState('grid') // 'grid' | 'table'

    // Modals
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [editingTeam, setEditingTeam] = useState(null)
    const [detailTeam, setDetailTeam] = useState(null)
    const [teamToDelete, setTeamToDelete] = useState(null)

    // Form inputs for Create Team
    const [newTeamName, setNewTeamName] = useState('')
    const [newTeamDescription, setNewTeamDescription] = useState('')
    const [newTeamMembers, setNewTeamMembers] = useState([])
    const [memberPickerSelect, setMemberPickerSelect] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Form inputs for Member Addition inside detail modal
    const [selectedMemberToAdd, setSelectedMemberToAdd] = useState('')

    function showToast(message) {
        setToastMessage(message)
        setTimeout(() => setToastMessage(''), 4000)
    }

    // Load initial organizations
    useEffect(() => {
        getOrganizations()
            .then((loadedOrganizations) => {
                const orgs = Array.isArray(loadedOrganizations) ? loadedOrganizations : []
                setOrganizations(orgs)
                if (orgs.length > 0) {
                    setIsLoading(true)
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

    // Load teams, members, and projects when organization changes
    useEffect(() => {
        if (!organizationId) {
            return
        }

        Promise.all([
            getTeams(organizationId),
            getOrganizationMembers(organizationId),
            getProjects(organizationId),
        ])
            .then(([loadedTeams, members, loadedProjects]) => {
                const teamList = Array.isArray(loadedTeams) ? loadedTeams : []
                const projectList = Array.isArray(loadedProjects) ? loadedProjects : []

                const enriched = teamList.map((t, idx) => {
                    const managerMember = (t.members || []).find((m) => m.user?.role === 'MANAGER' || m.user?.role === 'ADMIN')
                    const squadProjects = projectList
                        .filter((project) => project.teamId === t.id)
                        .map((project) => project.name)

                    return {
                        id: t.id || `team-${idx}`,
                        name: t.name,
                        department: inferDepartment(t.name, t.department),
                        description: t.description || '',
                        lead: managerMember?.user?.name
                            ? `${managerMember.user.name} (${managerMember.user.role})`
                            : 'Not designated',
                        projects: squadProjects,
                        members: Array.isArray(t.members) ? t.members : [],
                    }
                })

                setTeams(enriched)
                setOrgMembers(Array.isArray(members) ? members : [])
            })
            .catch((requestError) => {
                setError(requestError.message)
            })
            .finally(() => setIsLoading(false))
    }, [organizationId])

    // Real-time synchronization for members added to organization
    useEffect(() => {
        const socket = connectSocket()
        if (!socket) return

        function handleMemberAdded(payload) {
            if (!organizationId) return
            if (payload?.organizationId && payload.organizationId !== organizationId) return
            getOrganizationMembers(organizationId)
                .then((mems) => {
                    if (Array.isArray(mems)) setOrgMembers(mems)
                })
                .catch((requestError) => setError(requestError.message))
        }

        socket.on('organization:member-added', handleMemberAdded)
        socket.on('member:added', handleMemberAdded)

        return () => {
            socket.off('organization:member-added', handleMemberAdded)
            socket.off('member:added', handleMemberAdded)
        }
    }, [organizationId])

    function handleOpenCreateModal() {
        setEditingTeam(null)
        setNewTeamName('')
        setNewTeamDescription('')
        setNewTeamMembers([])
        if (organizationId) {
            getOrganizationMembers(organizationId)
                .then((mems) => {
                    if (Array.isArray(mems)) setOrgMembers(mems)
                })
                .catch((requestError) => setError(requestError.message))
        }
        setShowCreateModal(true)
    }

    function handleOpenEditTeam(team) {
        setError('')
        setEditingTeam(team)
        setNewTeamName(team.name || '')
        setNewTeamDescription(team.description || '')
        setNewTeamMembers([])
        setShowCreateModal(true)
    }

    function handleOpenDetailTeam(team) {
        if (organizationId) {
            getOrganizationMembers(organizationId)
                .then((mems) => {
                    if (Array.isArray(mems)) setOrgMembers(mems)
                })
                .catch((requestError) => setError(requestError.message))
        }
        setDetailTeam(team)
    }

    // Filter teams based on search query & department
    const filteredTeams = useMemo(() => {
        return teams.filter((t) => {
            const query = searchQuery.trim().toLowerCase()
            const matchesQuery =
                !query ||
                t.name.toLowerCase().includes(query) ||
                (t.description && t.description.toLowerCase().includes(query)) ||
                (t.lead && t.lead.toLowerCase().includes(query)) ||
                (t.department && t.department.toLowerCase().includes(query)) ||
                (t.projects && t.projects.some((p) => p.toLowerCase().includes(query))) ||
                (t.members && t.members.some((m) => (m.user?.name || m.user?.email || '').toLowerCase().includes(query)))

            const matchesDept =
                selectedDept === 'All Teams' || t.department === selectedDept

            return matchesQuery && matchesDept
        })
    }, [teams, searchQuery, selectedDept])

    // Metric KPI Computations
    const metrics = useMemo(() => {
        const total = teams.length
        let memberCount = 0
        const projectSet = new Set()

        teams.forEach((t) => {
            memberCount += (t.members?.length || 0)
            if (Array.isArray(t.projects)) {
                t.projects.forEach((p) => projectSet.add(p))
            }
        })

        return {
            totalTeams: total,
            totalMembers: orgMembers.length > 0 ? orgMembers.length : memberCount,
            totalProjectsLinked: projectSet.size,
            activeSquads: teams.filter((t) => (t.members?.length || 0) > 0).length,
        }
    }, [teams, orgMembers])

    // Candidate members for team membership.
    const availableCandidateMembers = useMemo(() => {
        if (orgMembers && orgMembers.length > 0) {
            return orgMembers.map((m) => {
                const uid = m.userId || m.id || m.user?.id
                const email = m.email || m.user?.email || ''
                const name = m.name || m.user?.name || (email ? email.split('@')[0] : 'Member')
                const role = (m.role || m.user?.role || 'MEMBER').toUpperCase()
                const avatarUrl = m.avatarUrl || m.user?.avatarUrl || null
                return { userId: uid, name, email, role, avatarUrl }
            })
        }
        return []
    }, [orgMembers])

    // Handler: Create Team
    async function handleCreateTeam(e) {
        e.preventDefault()
        if (!newTeamName.trim()) return

        setIsSubmitting(true)
        setError('')

        if (editingTeam) {
            try {
                if (!editingTeam.canManage) throw new Error('You do not have permission to edit this team.')
                const updated = await updateTeam(editingTeam.id, {
                    name: newTeamName.trim(),
                    description: newTeamDescription.trim(),
                })
                const updatedTeam = {
                    ...editingTeam,
                    ...updated,
                    name: updated?.name || newTeamName.trim(),
                    description: updated?.description || newTeamDescription.trim(),
                    department: inferDepartment(updated?.name || newTeamName.trim(), editingTeam.department),
                }
                setTeams((prev) => prev.map((team) => team.id === editingTeam.id ? updatedTeam : team))
                setDetailTeam((current) => current?.id === editingTeam.id ? updatedTeam : current)
                showToast(`Team "${updatedTeam.name}" updated successfully.`)
                setShowCreateModal(false)
                setEditingTeam(null)
            } catch (err) {
                setError(err.message || 'Failed to update team.')
            } finally {
                setIsSubmitting(false)
            }
            return
        }

        const memberUserIds = newTeamMembers.map((m) => m.userId).filter(Boolean)

        const newTeamPayload = {
            name: newTeamName.trim(),
            department: inferDepartment(newTeamName.trim()),
            description: newTeamDescription.trim(),
            lead: 'Not designated',
            projects: [],
            members: newTeamMembers.map((m) => ({
                userId: m.userId,
                user: { id: m.userId, name: m.name, email: m.email, role: m.role || 'MEMBER', avatarUrl: m.avatarUrl },
            })),
        }

        try {
            if (!organizationId) throw new Error('Select an organization before creating a team.')
            const created = await createTeam({
                name: newTeamPayload.name,
                description: newTeamPayload.description,
                organizationId,
                memberUserIds,
            })
            if (!created?.id) throw new Error('The team was not created. Please try again.')
            newTeamPayload.id = created.id
            newTeamPayload.members = Array.isArray(created.members) ? created.members : newTeamPayload.members

            setTeams((prev) => [newTeamPayload, ...prev])
            showToast(`Team "${newTeamPayload.name}" created successfully with ${newTeamPayload.members.length} member(s)!`)
            setShowCreateModal(false)

            // Reset form
            setNewTeamName('')
            setNewTeamDescription('')
            setNewTeamMembers([])
            setMemberPickerSelect('')
        } catch (err) {
            setError(err.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handler: Confirm & Execute Delete Team
    async function confirmExecuteDeleteTeam() {
        if (!teamToDelete) return
        if (!teamToDelete.canManage) {
            setError('You do not have permission to delete this team.')
            return
        }
        const targetId = teamToDelete.id
        const targetName = teamToDelete.name

        try {
            await deleteTeam(targetId)
            setTeams((prev) => prev.filter((t) => t.id !== targetId))
            if (detailTeam && detailTeam.id === targetId) {
                setDetailTeam(null)
            }
            showToast(`Team "${targetName}" deleted successfully.`)
            setTeamToDelete(null)
        } catch (err) {
            setError(err.message)
        }
    }

    // Handler: Add Member to Team (inside detail modal)
    async function handleAddMemberToTeam() {
        if (!detailTeam || !selectedMemberToAdd) return
        if (!detailTeam.canManage) {
            setError('You do not have permission to manage this team.')
            return
        }

        const memberObj = orgMembers.find((m) => m.userId === selectedMemberToAdd)
        if (!memberObj) {
            setError('Choose a member from this organization.')
            return
        }

        const newMemberEntry = {
            userId: memberObj.userId || selectedMemberToAdd,
            user: {
                id: memberObj.userId || selectedMemberToAdd,
                name: memberObj.name || memberObj.email,
                email: memberObj.email,
                role: memberObj.role || 'DEVELOPER',
            },
        }

        try {
            await addTeamMember(detailTeam.id, newMemberEntry.userId)
            const updatedMembers = [...(detailTeam.members || []), newMemberEntry]
            const updatedTeam = { ...detailTeam, members: updatedMembers }

            setDetailTeam(updatedTeam)
            setTeams((prev) => prev.map((t) => (t.id === detailTeam.id ? updatedTeam : t)))
            showToast(`Added ${newMemberEntry.user.name} to ${detailTeam.name}!`)
            setSelectedMemberToAdd('')
        } catch (err) {
            setError(err.message)
        }
    }

    // Handler: Remove Member from Team
    async function handleRemoveMemberFromTeam(userId) {
        if (!detailTeam) return
        if (!detailTeam.canManage) {
            setError('You do not have permission to manage this team.')
            return
        }

        try {
            await removeTeamMember(detailTeam.id, userId)
            const updatedMembers = (detailTeam.members || []).filter((m) => m.userId !== userId)
            const updatedTeam = { ...detailTeam, members: updatedMembers }

            setDetailTeam(updatedTeam)
            setTeams((prev) => prev.map((t) => (t.id === detailTeam.id ? updatedTeam : t)))
            showToast('Member removed from team.')
        } catch (err) {
            setError(err.message)
        }
    }

    const activeOrg = organizations.find((o) => o.id === organizationId)
    const userRole = (activeOrg?.role || localStorage.getItem('workflowx_registered_role') || 'MEMBER').toUpperCase()
    const canManageTeams = userRole === 'ADMIN' || userRole === 'MANAGER'
    const eligibleCandidateMembers = userRole === 'MANAGER'
        ? availableCandidateMembers.filter((member) => member.role === 'MEMBER')
        : availableCandidateMembers
    const currentTeamMembers = detailTeam ? detailTeam.members || [] : []
    const availableTeamCandidates = eligibleCandidateMembers.filter(
        (member) => !currentTeamMembers.some((existing) => existing.userId === member.userId)
    )

    return (
        <main className="feature-page" style={{ paddingBottom: '60px' }}>
            {/* Toast Feedback Notification */}
            {toastMessage && (
                <div
                    id="teams-toast-notification"
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
                        <p className="eyebrow" style={{ margin: 0 }}>Workspace • Organization</p>
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
                    <h1>Teams & Squads</h1>
                    <p className="heading-subtitle">
                        Organize cross-functional squads, assign team leads, manage members, and connect teams to active initiatives.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {organizations.length > 0 && (
                        <label className="organization-select" style={{ margin: 0 }}>
                            <select
                                id="teams-org-select"
                                value={organizationId}
                                onChange={(e) => {
                                    setIsLoading(true)
                                    setError('')
                                    setOrganizationId(e.target.value)
                                }}
                            >
                                {organizations.map((org) => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </select>
                        </label>
                    )}
                    {canManageTeams ? (
                        <button
                            id="open-create-team-btn"
                            className="primary-button"
                            type="button"
                            onClick={handleOpenCreateModal}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <span>+</span> Create Team
                        </button>
                    ) : (
                        <span
                            style={{
                                fontSize: '12px',
                                color: '#64748b',
                                background: '#f1f5f9',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontWeight: 600,
                                border: '1px solid #e2e8f0',
                            }}
                        >
                            👁️ Read-only View ({userRole})
                        </span>
                    )}
                </div>
            </div>

            {error && <p className="service-error" role="alert">{error}</p>}

            {/* KPI Metrics Strip */}
            <section
                className="stats-grid"
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                    gap: '16px',
                    marginBottom: '24px',
                }}
            >
                <div className="stat-card" style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #ebe9e5' }}>
                    <span className="stat-icon blue" style={{ background: '#eff6ff', color: '#2563eb' }}>👥</span>
                    <div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Total Squads</p>
                        <strong style={{ fontSize: '24px', color: '#111827' }}>{metrics.totalTeams}</strong>
                        <small className="neutral" style={{ display: 'block', fontSize: '11px', color: '#9ca3af' }}>Active functional teams</small>
                    </div>
                </div>

                <div className="stat-card" style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #ebe9e5' }}>
                    <span className="stat-icon green" style={{ background: '#ecfdf5', color: '#059669' }}>👤</span>
                    <div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Team Members</p>
                        <strong style={{ fontSize: '24px', color: '#059669' }}>{metrics.totalMembers}</strong>
                        <small className="positive" style={{ display: 'block', fontSize: '11px', color: '#059669' }}>Allocated across squads</small>
                    </div>
                </div>

                <div className="stat-card" style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #ebe9e5' }}>
                    <span className="stat-icon yellow" style={{ background: '#fffbeb', color: '#d97706' }}>📁</span>
                    <div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Linked Projects</p>
                        <strong style={{ fontSize: '24px', color: '#d97706' }}>{metrics.totalProjectsLinked}</strong>
                        <small className="neutral" style={{ display: 'block', fontSize: '11px', color: '#d97706' }}>Initiatives with squad ownership</small>
                    </div>
                </div>

                <div className="stat-card" style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #ebe9e5' }}>
                    <span className="stat-icon coral" style={{ background: '#eef2ff', color: '#4f46e5' }}>⚡</span>
                    <div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Active Squads</p>
                        <strong style={{ fontSize: '24px', color: '#4f46e5' }}>{metrics.activeSquads}</strong>
                        <small className="positive" style={{ display: 'block', fontSize: '11px', color: '#4f46e5' }}>Fully staffed & assigned</small>
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
                {/* Department Filter Tabs */}
                <div className="filter-tabs" style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
                    {DEPARTMENTS.map((dept) => {
                        const count =
                            dept === 'All Teams'
                                ? teams.length
                                : teams.filter((t) => t.department === dept).length

                        return (
                            <button
                                key={dept}
                                id={`filter-dept-${dept.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                                type="button"
                                className={selectedDept === dept ? 'selected' : ''}
                                onClick={() => setSelectedDept(dept)}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <span>{dept}</span>
                                <span
                                    style={{
                                        fontSize: '10px',
                                        padding: '1px 6px',
                                        borderRadius: '10px',
                                        background: selectedDept === dept ? '#fff' : '#f3f4f6',
                                        color: selectedDept === dept ? '#1f2937' : '#6b7280',
                                        fontWeight: 700,
                                    }}
                                >
                                    {count}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Right Controls: Search & View Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                        <input
                            id="team-search-input"
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by team, lead, member..."
                            style={{
                                padding: '7px 12px 7px 28px',
                                fontSize: '12px',
                                borderRadius: '6px',
                                border: '1px solid #d1d5db',
                                width: '220px',
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

            {/* Teams Content Area */}
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                    <p>Loading teams and squad memberships...</p>
                </div>
            ) : filteredTeams.length === 0 ? (
                <div
                    style={{
                        background: '#fff',
                        border: '1px dashed #d1d5db',
                        borderRadius: '12px',
                        padding: '60px 20px',
                        textAlign: 'center',
                    }}
                >
                    <div style={{ fontSize: '36px', marginBottom: '12px' }}>👥</div>
                    <h3 style={{ margin: '0 0 6px', color: '#111827' }}>No teams found</h3>
                    <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: '13px' }}>
                        {searchQuery
                            ? `No teams matched "${searchQuery}". Try clearing search or filters.`
                            : 'No teams match your selected filter. Create your first squad!'}
                    </p>
                    <button
                        type="button"
                        className="primary-button"
                        onClick={() => {
                            setSearchQuery('')
                            setSelectedDept('All Teams')
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
                    {filteredTeams.map((team) => {
                        const members = team.members || []

                        return (
                            <article
                                key={team.id}
                                id={`team-card-${team.id}`}
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
                                }}
                            >
                                <div>
                                    {/* Header: Department pill & Member Count */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <span
                                            style={{
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                background: '#eff6ff',
                                                color: '#1d4ed8',
                                                border: '1px solid #bfdbfe',
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                            }}
                                        >
                                            {team.department || 'Engineering'}
                                        </span>

                                        <span
                                            style={{
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                background: '#f3f4f6',
                                                color: '#4b5563',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                            }}
                                        >
                                            👥 {members.length} {members.length === 1 ? 'member' : 'members'}
                                        </span>
                                    </div>

                                    {/* Team Name & Description */}
                                    <h3
                                        style={{
                                            margin: '0 0 6px',
                                            fontSize: '17px',
                                            fontWeight: 700,
                                            color: '#111827',
                                            cursor: 'pointer',
                                        }}
                                        onClick={() => handleOpenDetailTeam(team)}
                                        title="Click to view full team details"
                                    >
                                        {highlightMatch(team.name, searchQuery)}
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
                                        {highlightMatch(team.description, searchQuery)}
                                    </p>

                                    {/* Team Lead */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            background: '#f9fafb',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid #f3f4f6',
                                            marginBottom: '14px',
                                            fontSize: '12px',
                                        }}
                                    >
                                        <span style={{ fontSize: '13px' }}>👑</span>
                                        <span style={{ color: '#6b7280' }}>Team Lead:</span>
                                        <strong style={{ color: '#111827' }}>
                                            {highlightMatch(team.lead || 'Unassigned', searchQuery)}
                                        </strong>
                                    </div>

                                    {/* Associated Projects Tags */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <span style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: '#9ca3af', fontWeight: 600, marginBottom: '6px' }}>
                                            Active Projects
                                        </span>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {(team.projects || []).map((proj, pIdx) => (
                                                <span
                                                    key={pIdx}
                                                    onClick={() => navigate(`/tasks?project=${encodeURIComponent(proj)}`)}
                                                    style={{
                                                        fontSize: '11px',
                                                        background: '#eff6ff',
                                                        color: '#1d4ed8',
                                                        border: '1px solid #bfdbfe',
                                                        padding: '2px 8px',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        fontWeight: 500,
                                                        transition: 'all 0.15s ease',
                                                    }}
                                                    title={`Open ${proj} on Signboard ➔`}
                                                >
                                                    📁 {highlightMatch(proj, searchQuery)} ➔
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Members Avatars Row */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <span style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: '#9ca3af', fontWeight: 600, marginBottom: '6px' }}>
                                            Squad Roster
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                            {members.slice(0, 5).map((m, mIdx) => {
                                                const name = m.user?.name || m.user?.email || m.userId || 'User'
                                                const initial = name.charAt(0).toUpperCase()
                                                return (
                                                    <div
                                                        key={mIdx}
                                                        style={{
                                                            width: '26px',
                                                            height: '26px',
                                                            borderRadius: '50%',
                                                            background: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][mIdx % 5],
                                                            color: '#fff',
                                                            display: 'grid',
                                                            placeItems: 'center',
                                                            fontSize: '11px',
                                                            fontWeight: 700,
                                                        }}
                                                        title={name}
                                                    >
                                                        {initial}
                                                    </div>
                                                )
                                            })}
                                            {members.length > 5 && (
                                                <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>
                                                    +{members.length - 5} more
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Card Footer Actions */}
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        paddingTop: '14px',
                                        borderTop: '1px solid #f3f4f6',
                                    }}
                                >
                                    <button
                                        id={`manage-team-members-${team.id}`}
                                        type="button"
                                        onClick={() => handleOpenDetailTeam(team)}
                                        style={{
                                            background: '#f8fafc',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '6px',
                                            padding: '6px 12px',
                                            fontSize: '11px',
                                            color: '#334155',
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                        }}
                                        title="Manage members in squad"
                                    >
                                        <span>👥</span> Manage Roster
                                    </button>

                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            id={`view-team-tasks-${team.id}`}
                                            type="button"
                                            onClick={() => team.projects?.[0]
                                                ? navigate(`/tasks?project=${encodeURIComponent(team.projects[0])}`)
                                                : navigate('/projects')}
                                            style={{
                                                background: '#f0fdf4',
                                                border: '1px solid #bbf7d0',
                                                borderRadius: '6px',
                                                padding: '6px 10px',
                                                fontSize: '11px',
                                                color: '#15803d',
                                                cursor: 'pointer',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                            }}
                                            title="View tasks on Signboard"
                                        >
                                            <span>📋</span> Signboard
                                        </button>

                                        <button
                                            id={`view-team-projects-${team.id}`}
                                            type="button"
                                            onClick={() => navigate(`/projects?team=${encodeURIComponent(team.name)}`)}
                                            style={{
                                                background: '#f8fafc',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '6px',
                                                padding: '6px 10px',
                                                fontSize: '11px',
                                                color: '#334155',
                                                cursor: 'pointer',
                                            }}
                                            title="View initiatives associated with this squad"
                                        >
                                            Projects
                                        </button>

                                        {canManageTeams && team.canManage && (
                                            <button
                                                id={`delete-team-${team.id}`}
                                                type="button"
                                                onClick={() => setTeamToDelete(team)}
                                                style={{
                                                    background: '#fef2f2',
                                                    border: '1px solid #fecaca',
                                                    borderRadius: '6px',
                                                    padding: '6px 10px',
                                                    fontSize: '11px',
                                                    color: '#dc2626',
                                                    cursor: 'pointer',
                                                    fontWeight: 600,
                                                }}
                                                title="Delete Team"
                                            >
                                                ✕
                                            </button>
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
                                    <th style={{ padding: '12px 18px' }}>Team / Squad</th>
                                    <th style={{ padding: '12px 14px' }}>Department</th>
                                    <th style={{ padding: '12px 14px' }}>Team Lead</th>
                                    <th style={{ padding: '12px 14px' }}>Roster</th>
                                    <th style={{ padding: '12px 14px' }}>Associated Projects</th>
                                    <th style={{ padding: '12px 18px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTeams.map((team) => {
                                    const members = team.members || []

                                    return (
                                        <tr key={team.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '14px 18px' }}>
                                                <strong
                                                    style={{ display: 'block', color: '#111827', cursor: 'pointer' }}
                                                    onClick={() => handleOpenDetailTeam(team)}
                                                >
                                                    {highlightMatch(team.name, searchQuery)}
                                                </strong>
                                                <small style={{ color: '#6b7280', fontSize: '11px' }}>
                                                    {team.description}
                                                </small>
                                            </td>

                                            <td style={{ padding: '14px 14px' }}>
                                                <span style={{ fontSize: '11px', fontWeight: 600, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '6px' }}>
                                                    {team.department || 'Engineering'}
                                                </span>
                                            </td>

                                            <td style={{ padding: '14px 14px', color: '#111827', fontWeight: 500 }}>
                                                {highlightMatch(team.lead || 'Unassigned', searchQuery)}
                                            </td>

                                            <td style={{ padding: '14px 14px' }}>
                                                <span style={{ fontSize: '11px', background: '#f3f4f6', color: '#374151', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                                    {members.length} {members.length === 1 ? 'member' : 'members'}
                                                </span>
                                            </td>

                                            <td style={{ padding: '14px 14px' }}>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {(team.projects || []).slice(0, 2).map((p, pIdx) => (
                                                        <span key={pIdx} style={{ fontSize: '10px', background: '#f8fafc', padding: '1px 5px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                            {p}
                                                        </span>
                                                    ))}
                                                    {(team.projects?.length || 0) > 2 && (
                                                        <span style={{ fontSize: '10px', color: '#6b7280' }}>+{team.projects.length - 2}</span>
                                                    )}
                                                </div>
                                            </td>

                                            <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenDetailTeam(team)}
                                                        style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                                                    >
                                                        Roster
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => team.projects?.[0]
                                                            ? navigate(`/tasks?project=${encodeURIComponent(team.projects[0])}`)
                                                            : navigate('/projects')}
                                                        style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                                                        title="Open in Kanban Signboard"
                                                    >
                                                        Signboard
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(`/projects?team=${encodeURIComponent(team.name)}`)}
                                                        style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}
                                                    >
                                                        Projects
                                                    </button>
                                                    {canManageTeams && team.canManage && (
                                                        <button
                                                            id={`table-delete-team-${team.id}`}
                                                            type="button"
                                                            onClick={() => setTeamToDelete(team)}
                                                            style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', color: '#dc2626', cursor: 'pointer' }}
                                                            title="Delete Team"
                                                        >
                                                            ✕
                                                        </button>
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

            {/* MODAL 1: CREATE TEAM MODAL */}
            {showCreateModal && (
                <div
                    id="create-team-modal"
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
                            maxWidth: '540px',
                            width: '100%',
                            padding: '28px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                            <div>
                                <p className="eyebrow" style={{ margin: 0 }}>Team Organization</p>
                                <h2 style={{ margin: '4px 0 0', fontSize: '20px', color: '#111827' }}>
                                    {editingTeam ? 'Edit Team Details' : 'Create New Squad'}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#6b7280' }}
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleCreateTeam} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                    Team Name *
                                    <input
                                        id="new-team-name-input"
                                        type="text"
                                        required
                                        value={newTeamName}
                                        onChange={(e) => setNewTeamName(e.target.value)}
                                        placeholder="e.g. SRE & Cloud Reliability"
                                        style={{ width: '100%', padding: '8px 12px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                    />
                                </label>

                            </div>

                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                Mission / Description
                                <textarea
                                    id="new-team-desc-input"
                                    rows={3}
                                    value={newTeamDescription}
                                    onChange={(e) => setNewTeamDescription(e.target.value)}
                                    placeholder="What deliverables, repos, or technical capabilities does this team own?"
                                    style={{ width: '100%', padding: '8px 12px', marginTop: '4px', borderRadius: '6px', border: '1px solid #d1d5db', resize: 'vertical' }}
                                />
                            </label>

                            {!editingTeam && <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>

                                {/* Dropdown Members Selection */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                            Squad Members ({newTeamMembers.length} selected)
                                        </label>
                                        {newTeamMembers.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setNewTeamMembers([])}
                                                style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                Clear All
                                            </button>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <select
                                            id="new-team-members-select"
                                            value={memberPickerSelect}
                                            onChange={(e) => {
                                                const selectedId = e.target.value
                                                if (!selectedId) return
                                                const candidate = availableCandidateMembers.find((c) => c.userId === selectedId)
                                                if (candidate && !newTeamMembers.some((m) => m.userId === selectedId)) {
                                                    setNewTeamMembers([...newTeamMembers, candidate])
                                                }
                                                setMemberPickerSelect('')
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: '8px 10px',
                                                borderRadius: '6px',
                                                border: '1px solid #d1d5db',
                                                background: '#fff',
                                                fontSize: '12px',
                                                color: '#374151',
                                            }}
                                        >
                                            <option value="">➕ Select member from dropdown to add...</option>
                                            {eligibleCandidateMembers.map((cand) => {
                                                const isAlreadyAdded = newTeamMembers.some((m) => m.userId === cand.userId)
                                                return (
                                                    <option key={cand.userId} value={cand.userId} disabled={isAlreadyAdded}>
                                                        {cand.name} {cand.email ? `(${cand.email})` : ''} — {cand.role} {isAlreadyAdded ? '✓ Added' : ''}
                                                    </option>
                                                )
                                            })}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const unadded = availableCandidateMembers.filter(
                                                    (cand) => !newTeamMembers.some((m) => m.userId === cand.userId)
                                                )
                                                setNewTeamMembers([...newTeamMembers, ...unadded])
                                            }}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid #e2e8f0',
                                                background: '#f8fafc',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                color: '#475569',
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap',
                                            }}
                                            title="Add all available members to squad"
                                        >
                                            + Add All
                                        </button>
                                    </div>

                                    {/* Selected Member Chips */}
                                    {newTeamMembers.length > 0 ? (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px', maxHeight: '110px', overflowY: 'auto', padding: '6px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            {newTeamMembers.map((m) => (
                                                <span
                                                    key={m.userId}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        background: '#fff',
                                                        border: '1px solid #cbd5e1',
                                                        borderRadius: '16px',
                                                        padding: '3px 10px 3px 6px',
                                                        fontSize: '12px',
                                                        color: '#1e293b',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                                    }}
                                                >
                                                    <span style={{
                                                        width: '20px',
                                                        height: '20px',
                                                        borderRadius: '50%',
                                                        background: '#3b82f6',
                                                        color: '#fff',
                                                        fontSize: '10px',
                                                        fontWeight: 700,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                    }}>
                                                        {(m.name || 'U')[0].toUpperCase()}
                                                    </span>
                                                    <span style={{ fontWeight: 500 }}>{m.name}</span>
                                                    <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#64748b', padding: '1px 5px', borderRadius: '4px' }}>
                                                        {m.role}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setNewTeamMembers(newTeamMembers.filter((item) => item.userId !== m.userId))}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            color: '#94a3b8',
                                                            cursor: 'pointer',
                                                            padding: '0 2px',
                                                            fontSize: '12px',
                                                            lineHeight: 1,
                                                            fontWeight: 700,
                                                        }}
                                                        title={`Remove ${m.name}`}
                                                    >
                                                        ✕
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>
                                            No extra squad members chosen yet. Pick from the dropdown above to add people.
                                        </p>
                                    )}
                                </div>
                            </div>}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    id="submit-create-team-btn"
                                    type="submit"
                                    className="primary-button"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? (editingTeam ? 'Saving...' : 'Creating...') : (editingTeam ? 'Save Changes' : 'Create Team')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: TEAM DETAILS & MEMBER MANAGEMENT MODAL */}
            {detailTeam && (
                <div
                    id="team-details-modal"
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
                    onClick={() => setDetailTeam(null)}
                >
                    <div
                        style={{
                            background: '#fff',
                            borderRadius: '12px',
                            maxWidth: '640px',
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
                                    <span style={{ fontSize: '11px', fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '6px' }}>
                                        {detailTeam.department || 'Engineering'}
                                    </span>
                                    <span style={{ fontSize: '11px', fontWeight: 600, background: '#f3f4f6', color: '#4b5563', padding: '2px 8px', borderRadius: '12px' }}>
                                        👑 Lead: {detailTeam.lead || 'Unassigned'}
                                    </span>
                                </div>
                                <h2 style={{ margin: 0, fontSize: '22px', color: '#111827' }}>
                                    {detailTeam.name}
                                </h2>
                                {canManageTeams && detailTeam.canManage && (
                                    <button
                                        type="button"
                                        className="secondary-button"
                                        onClick={() => handleOpenEditTeam(detailTeam)}
                                        style={{ marginTop: '10px', padding: '6px 10px', fontSize: '11px' }}
                                    >
                                        Edit team details
                                    </button>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setDetailTeam(null)}
                                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#6b7280' }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Description */}
                        <p style={{ fontSize: '13px', color: '#4b5563', lineHeight: '1.6', marginBottom: '20px' }}>
                            {detailTeam.description}
                        </p>

                        {/* Associated Projects */}
                        <div style={{ marginBottom: '20px' }}>
                            <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#374151' }}>Associated Projects</h4>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {(detailTeam.projects || []).map((proj, pIdx) => (
                                    <span
                                        key={pIdx}
                                        onClick={() => {
                                            setDetailTeam(null)
                                            navigate(`/tasks?project=${encodeURIComponent(proj)}`)
                                        }}
                                        style={{
                                            background: '#eff6ff',
                                            color: '#1d4ed8',
                                            border: '1px solid #bfdbfe',
                                            padding: '4px 12px',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                            fontWeight: 500,
                                        }}
                                        title={`Open ${proj} on Signboard ➔`}
                                    >
                                        📁 {proj} ➔
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Member Management Section */}
                        <div style={{ marginBottom: '24px' }}>
                            <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#374151' }}>
                                Squad Roster ({detailTeam.members?.length || 0})
                            </h4>

                            {/* Member Addition Inline Form */}
                            {canManageTeams && detailTeam.canManage ? (
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                                    <select
                                        id="add-team-member-select"
                                        value={selectedMemberToAdd}
                                        onChange={(e) => setSelectedMemberToAdd(e.target.value)}
                                        style={{ flex: 1, padding: '7px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff' }}
                                    >
                                        <option value="">Select organization member to add...</option>
                                        {availableTeamCandidates.map((m) => (
                                            <option key={m.userId} value={m.userId}>
                                                {m.name} {m.email ? `(${m.email})` : ''} — {m.role}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        id="modal-add-team-member-btn"
                                        type="button"
                                        onClick={handleAddMemberToTeam}
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
                                        + Add to Team
                                    </button>
                                </div>
                            ) : (
                                <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 12px', fontStyle: 'italic' }}>
                                    Squad membership modifications require Manager or Admin permissions.
                                </p>
                            )}

                            {/* Members List */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                                {(detailTeam.members || []).map((m, idx) => {
                                    const user = m.user || {}
                                    const name = user.name || user.email || m.userId || 'Team Member'
                                    const email = user.email || ''
                                    const role = user.role || 'MEMBER'

                                    return (
                                        <div
                                            key={m.userId || idx}
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
                                                    {name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <strong style={{ fontSize: '12px', color: '#111827', display: 'block' }}>{name}</strong>
                                                    <small style={{ fontSize: '11px', color: '#6b7280' }}>{email} • <span style={{ fontWeight: 600 }}>{role}</span></small>
                                                </div>
                                            </div>

                                            {canManageTeams && detailTeam.canManage && (
                                                <button
                                                    id={`remove-team-member-${m.userId}`}
                                                    type="button"
                                                    onClick={() => handleRemoveMemberFromTeam(m.userId)}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: '#dc2626',
                                                        fontSize: '11px',
                                                        cursor: 'pointer',
                                                        fontWeight: 600,
                                                    }}
                                                    title="Remove member from squad"
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Modal Footer Actions */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const p = detailTeam.projects?.[0]
                                        setDetailTeam(null)
                                        navigate(p ? `/tasks?project=${encodeURIComponent(p)}` : '/projects')
                                    }}
                                    className="primary-button"
                                    style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <span>📋</span> Open Signboard ➔
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDetailTeam(null)
                                        navigate(`/projects?team=${encodeURIComponent(detailTeam.name)}`)
                                    }}
                                    style={{
                                        background: '#f8fafc',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        padding: '8px 14px',
                                        fontSize: '12px',
                                        color: '#334155',
                                        cursor: 'pointer',
                                    }}
                                >
                                    View Projects
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setDetailTeam(null)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: '1px solid #d1d5db',
                                    background: '#f3f4f6',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 3: CONFIRM DELETE TEAM MODAL */}
            {teamToDelete && (
                <div
                    id="confirm-delete-team-modal"
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
                    onClick={() => setTeamToDelete(null)}
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
                            Delete Team?
                        </h3>
                        <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#4b5563', lineHeight: '1.5' }}>
                            Are you sure you want to delete <b>"{teamToDelete.name}"</b>?
                            All squad associations and project assignments will be unlinked.
                        </p>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button
                                id="cancel-delete-team-btn"
                                type="button"
                                onClick={() => setTeamToDelete(null)}
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
                                id="confirm-delete-team-btn"
                                type="button"
                                onClick={confirmExecuteDeleteTeam}
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
                                Yes, Delete Team
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}
