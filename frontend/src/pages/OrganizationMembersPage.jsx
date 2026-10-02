import { useEffect, useState } from 'react'
import {
    getOrganizations,
    getOrganizationMembers,
    updateOrganizationMemberRole,
    removeOrganizationMember,
    inviteOrganizationMember,
} from '../services/organizationService.js'
import { getCurrentUser } from '../services/authService.js'
import { connectSocket } from '../services/socketService.js'
import '../App.css'

const ROLES = ['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']
const ASSIGNABLE_ROLES = ['MANAGER', 'MEMBER', 'VIEWER']

const ROLE_DESCRIPTIONS = {
    ADMIN: 'Full management of organization members, assign roles to users, manage settings, and organization structure.',
    MANAGER: 'Plan work, create projects, assign tasks to developers, and monitor progress (cannot assign or change user roles).',
    MEMBER: 'Execute assigned tasks, update status, collaborate on comments, and suggest work.',
    VIEWER: 'Read-only access to organization projects, teams, and tasks.',
}

function OrganizationMembersPage() {
    const [organizations, setOrganizations] = useState([])
    const [organizationId, setOrganizationId] = useState('')
    const [members, setMembers] = useState([])
    const [currentUser, setCurrentUser] = useState(null)
    const [overrideRole, setOverrideRole] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isInviting, setIsInviting] = useState(false)
    const [inviteSuccess, setInviteSuccess] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        getCurrentUser().then(setCurrentUser).catch(() => null)
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

    const currentOrg = organizations.find((org) => org.id === organizationId)
    const myMembership = members.find((m) => m.userId === currentUser?.id || m.email === currentUser?.email)
    const baseRole = (myMembership?.role || currentOrg?.role || currentUser?.role || localStorage.getItem('workflowx_registered_role') || 'MEMBER').toUpperCase()
    const activeRole = overrideRole || baseRole
    const isAdmin = activeRole === 'ADMIN'
    const isManager = activeRole === 'MANAGER'

    // Show all members across all roles (Admin, Manager, Member, Viewer)
    const visibleMembers = members

    useEffect(() => {
        if (!organizationId) {
            setMembers([])
            return
        }
        setIsLoading(true)
        getOrganizationMembers(organizationId)
            .then((loadedMembers) => {
                setMembers(Array.isArray(loadedMembers) ? loadedMembers : [])
            })
            .catch((requestError) => setError(requestError.message))
            .finally(() => setIsLoading(false))
    }, [organizationId])

    // Real-time synchronization for new members added to the organization
    useEffect(() => {
        const socket = connectSocket()
        if (!socket) return

        function handleMemberAdded(payload) {
            if (!organizationId) return
            if (payload?.organizationId && payload.organizationId !== organizationId) return
            getOrganizationMembers(organizationId)
                .then((loadedMembers) => {
                    if (Array.isArray(loadedMembers)) {
                        setMembers(loadedMembers)
                    }
                })
                .catch(() => null)
        }

        socket.on('organization:member-added', handleMemberAdded)
        socket.on('member:added', handleMemberAdded)

        return () => {
            socket.off('organization:member-added', handleMemberAdded)
            socket.off('member:added', handleMemberAdded)
        }
    }, [organizationId])

    async function handleRoleChange(targetUserId, newRole) {
        if (!isAdmin) {
            setError('Admin permission required: Managers cannot assign or change user roles.')
            return
        }
        setError('')
        try {
            const updated = await updateOrganizationMemberRole(organizationId, targetUserId, newRole)
            setMembers((currentMembers) =>
                currentMembers.map((member) =>
                    member.userId === targetUserId ? { ...member, role: updated.role } : member
                )
            )
        } catch (requestError) {
            setError(requestError.message)
        }
    }

    async function handleRemoveMember(targetUserId) {
        if (!isAdmin) {
            setError('Admin permission required: Only organization administrators can remove members.')
            return
        }
        if (!window.confirm('Are you sure you want to remove this member from the organization?')) return
        setError('')
        try {
            await removeOrganizationMember(organizationId, targetUserId)
            setMembers((currentMembers) => currentMembers.filter((member) => member.userId !== targetUserId))
        } catch (requestError) {
            setError(requestError.message)
        }
    }

    async function handleInviteSubmit(event) {
        event.preventDefault()
        if (!isAdmin) {
            setError('Admin permission required: Managers cannot assign roles to users.')
            return
        }
        const form = new FormData(event.currentTarget)
        const email = form.get('email')
        const role = form.get('role')

        setIsInviting(true)
        setError('')
        setInviteSuccess('')

        try {
            await inviteOrganizationMember(organizationId, { email, role })
            setInviteSuccess(`Invitation sent to ${email} as ${role}`)
            event.currentTarget.reset()
            const refreshed = await getOrganizationMembers(organizationId).catch(() => null)
            if (Array.isArray(refreshed) && refreshed.length > 0) {
                setMembers(refreshed)
            }
        } catch (requestError) {
            setError(requestError.message)
        } finally {
            setIsInviting(false)
        }
    }

    return (
        <main className="feature-page">
            <div className="feature-heading">
                <div>
                    <p className="eyebrow">Organization</p>
                    <h1>Members & Roles</h1>
                    <p className="heading-subtitle">
                        {isAdmin
                            ? 'Assign each role in organization and manage role-based permissions.'
                            : 'View organization members directory and role permissions.'}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {/* Role Simulator for testing manager vs admin permissions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', background: '#f4f4f2', padding: '4px 8px', borderRadius: '6px' }}>
                        <span style={{ color: '#64748b' }}>Simulate View:</span>
                        <button
                            type="button"
                            onClick={() => setOverrideRole('MANAGER')}
                            style={{
                                padding: '3px 8px',
                                fontSize: '11px',
                                borderRadius: '4px',
                                border: 'none',
                                cursor: 'pointer',
                                background: activeRole === 'MANAGER' ? '#d4a523' : 'transparent',
                                color: activeRole === 'MANAGER' ? '#fff' : '#475569',
                                fontWeight: activeRole === 'MANAGER' ? 700 : 400,
                            }}
                            title="Test as Manager (No Admin Role Assignment Permission)"
                        >
                            Manager
                        </button>
                        <button
                            type="button"
                            onClick={() => setOverrideRole('ADMIN')}
                            style={{
                                padding: '3px 8px',
                                fontSize: '11px',
                                borderRadius: '4px',
                                border: 'none',
                                cursor: 'pointer',
                                background: activeRole === 'ADMIN' ? '#ee785e' : 'transparent',
                                color: activeRole === 'ADMIN' ? '#fff' : '#475569',
                                fontWeight: activeRole === 'ADMIN' ? 700 : 400,
                            }}
                            title="Test as Admin (Full Role Assignment Permission)"
                        >
                            Admin
                        </button>
                    </div>

                    {(organizations?.length || 0) > 0 && (
                        <label className="organization-select">
                            Organization
                            <select
                                value={organizationId}
                                onChange={(event) => setOrganizationId(event.target.value)}
                            >
                                {organizations.map((org) => (
                                    <option key={org.id} value={org.id}>
                                        {org.name} ({org.role})
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>
            </div>

            {error && <p className="service-error" role="alert">{error}</p>}
            {inviteSuccess && <p className="service-success" role="status" style={{ color: '#52a880', background: '#eaf7f0', padding: '10px 14px', borderRadius: '7px', marginBottom: '16px', fontSize: '13px' }}>{inviteSuccess}</p>}

            {/* Permission Restriction Notice for Manager and Non-Admin */}
            {!isAdmin && (
                <div
                    style={{
                        padding: '14px 18px',
                        background: '#fffbf0',
                        border: '1px solid #fde68a',
                        borderRadius: '8px',
                        marginBottom: '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                    }}
                >
                    <div>
                        <h3 style={{ margin: 0, fontSize: '13px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>🛡️</span> Role Assignment Restricted to Administrators
                        </h3>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#b45309' }}>
                            {isManager
                                ? 'Managers do not have admin permission to Assign Role to User. Only Organization Admins can assign or change roles. Managers plan and assign tasks within projects.'
                                : 'Only Organization Administrators have permission to assign or change user roles.'}
                        </p>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '4px', background: '#fef3c7', color: '#92400e' }}>
                        Active Role: {activeRole}
                    </span>
                </div>
            )}

            <section className={isAdmin ? 'feature-grid' : 'feature-single'} style={{ display: isAdmin ? 'grid' : 'block' }}>
                {/* Assign Role to User - Rendered ONLY for Admins */}
                {isAdmin && (
                    <form className="project-create-panel panel" onSubmit={handleInviteSubmit}>
                        <p className="eyebrow">Admin Privilege</p>
                        <h2>Assign Role to User</h2>
                        <label>
                            Email address
                            <input name="email" type="email" placeholder="colleague@example.com" required />
                        </label>
                        <label>
                            Role to Assign
                            <select name="role" defaultValue="MEMBER">
                                {ASSIGNABLE_ROLES.map((role) => (
                                    <option key={role} value={role}>
                                        {role}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div className="role-preview" style={{ margin: '12px 0 18px', padding: '10px', background: '#f7f7f5', borderRadius: '6px', fontSize: '11px', color: '#858996' }}>
                            <strong>Role Hierarchy & Permissions:</strong>
                            <ul style={{ paddingLeft: '16px', margin: '6px 0 0' }}>
                                {ROLES.map((role) => (
                                    <li key={role} style={{ marginBottom: '4px' }}>
                                        <b style={{ color: '#20222b' }}>{role}:</b> {ROLE_DESCRIPTIONS[role]}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <button
                            className="primary-button"
                            type="submit"
                            disabled={isInviting || !organizationId}
                        >
                            {isInviting ? 'Inviting...' : 'Assign Role & Send Invite'}
                        </button>
                    </form>
                )}

                {/* Organization Members List - Admins are hidden; only shows team members */}
                <section className="project-list-panel panel" aria-labelledby="member-list-title" style={{ width: '100%' }}>
                    <div className="panel-heading">
                        <div>
                            <h2 id="member-list-title">Organization Members</h2>
                            <p>{isAdmin ? 'Manage member roles and role-based permissions.' : 'Organization member directory and assigned roles.'}</p>
                        </div>
                        <strong>{visibleMembers?.length || 0}</strong>
                    </div>

                    {isLoading && <p className="loading-state">Loading members...</p>}
                    {!isLoading && (!visibleMembers || visibleMembers.length === 0) && (
                        <p className="empty-column">No team members found</p>
                    )}

                    <div className="project-list">
                        {(visibleMembers || []).map((member) => {
                            const memberName = member.name || member.user?.name || (member.email || member.user?.email || '').split('@')[0] || 'Member'
                            const memberEmail = member.email || member.user?.email || ''
                            const memberRole = (member.role || member.user?.role || 'MEMBER').toUpperCase()
                            const mUserId = member.userId || member.user?.id || member.id

                            return (
                                <article className="project-row" key={mUserId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                                    <div>
                                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                            {memberName}
                                            <span className={`priority ${memberRole.toLowerCase()}`} style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: memberRole === 'ADMIN' ? '#fff0ec' : memberRole === 'MANAGER' ? '#fff8df' : memberRole === 'MEMBER' ? '#eaf7f0' : '#edf4ff', color: memberRole === 'ADMIN' ? '#e96f59' : memberRole === 'MANAGER' ? '#d4a523' : memberRole === 'MEMBER' ? '#4a9e7e' : '#5d8bdb' }}>
                                                {memberRole}
                                            </span>
                                        </h3>
                                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#858996' }}>{memberEmail}</p>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {/* Role selector dropdown: Admins ONLY. For managers, role is read-only. */}
                                        {isAdmin ? (
                                            <>
                                                <select
                                                    value={memberRole}
                                                    onChange={(e) => handleRoleChange(mUserId, e.target.value)}
                                                    style={{
                                                        padding: '6px 10px',
                                                        fontSize: '12px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #ebe9e5',
                                                        background: '#fff',
                                                        cursor: 'pointer',
                                                    }}
                                                    aria-label={`Role for ${memberEmail}`}
                                                >
                                                    {ROLES.map((r) => (
                                                        <option key={r} value={r}>
                                                            {r}
                                                        </option>
                                                    ))}
                                                </select>
                                                {mUserId !== currentUser?.id && (
                                                    <button
                                                        type="button"
                                                        className="secondary-button"
                                                        onClick={() => handleRemoveMember(mUserId)}
                                                        style={{ padding: '6px 10px', fontSize: '11px', color: '#e96f59', background: '#fff0ec' }}
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <span style={{ fontSize: '11px', color: '#858996', fontStyle: 'italic' }}>
                                                Role assigned by Admin
                                            </span>
                                        )}
                                    </div>
                                </article>
                            )
                        })}
                    </div>
                </section>
            </section>
        </main>
    )
}

export default OrganizationMembersPage
