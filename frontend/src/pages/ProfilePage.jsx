import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser, updateProfile, logout } from '../services/authService.js'
import { getOrganizations } from '../services/organizationService.js'
import '../App.css'

function ProfilePage() {
    const navigate = useNavigate()
    const [profile, setProfile] = useState(null)
    const [userRole, setUserRole] = useState('')
    const [name, setName] = useState('')
    const [avatarUrl, setAvatarUrl] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        setIsLoading(true)
        Promise.all([
            getCurrentUser().catch(() => null),
            getOrganizations().catch(() => []),
        ])
            .then(([user, orgs]) => {
                if (user) {
                    setProfile(user)
                    setName(user.name || '')
                    setAvatarUrl(user.avatarUrl || '')
                }
                const role = (orgs?.[0]?.role || localStorage.getItem('workflowx_registered_role') || 'MEMBER').toUpperCase()
                setUserRole(role)
            })
            .catch((requestError) => setError(requestError.message))
            .finally(() => setIsLoading(false))
    }, [])

    async function submit(event) {
        event.preventDefault()
        setIsSaving(true)
        setMessage('')
        setError('')
        try {
            const updatedProfile = await updateProfile({ name, avatarUrl: avatarUrl || null })
            setProfile(updatedProfile)
            setMessage('Profile updated.')
        } catch (requestError) {
            setError(requestError.message)
        } finally {
            setIsSaving(false)
        }
    }

    async function handleLogout() {
        try {
            await logout().catch(() => null)
        } finally {
            navigate('/login', { replace: true })
        }
    }

    return (
        <main className="feature-page">
            <div className="feature-heading">
                <div>
                    <p className="eyebrow">Account • Security</p>
                    <h1>Profile & Session</h1>
                    <p className="heading-subtitle">Keep your workspace identity current or log out to switch roles.</p>
                </div>
            </div>

            {isLoading && <p className="loading-state">Loading profile...</p>}
            {error && <p className="service-error" role="alert">{error}</p>}

            {!isLoading && profile && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', maxWidth: '880px' }}>
                    <section className="profile-panel panel" style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                            <div className="user-avatar profile-avatar" style={{ width: '48px', height: '48px', fontSize: '18px' }}>
                                {profile.name?.slice(0, 2).toUpperCase() || 'JD'}
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '16px', color: '#111827' }}>{profile.name}</h3>
                                <p className="profile-email" style={{ margin: '2px 0 0', color: '#6b7280', fontSize: '13px' }}>{profile.email}</p>
                            </div>
                        </div>

                        <form className="auth-form" onSubmit={submit}>
                            <label>
                                Name
                                <input value={name} onChange={(event) => setName(event.target.value)} required />
                            </label>
                            <label>
                                Avatar URL
                                <input type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." />
                            </label>
                            {message && <p className="success-message">{message}</p>}
                            <button className="primary-button" type="submit" disabled={isSaving}>
                                {isSaving ? 'Saving...' : 'Save Profile'}
                            </button>
                        </form>
                    </section>

                    <section className="panel" style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px', color: '#111827' }}>Role & Session</h3>
                                <span
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        background: userRole === 'ADMIN' ? '#fee2e2' : userRole === 'MANAGER' ? '#e0e7ff' : '#f0fdf4',
                                        color: userRole === 'ADMIN' ? '#b91c1c' : userRole === 'MANAGER' ? '#4338ca' : '#15803d',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                    }}
                                >
                                    {userRole}
                                </span>
                            </div>

                            <p style={{ fontSize: '13px', color: '#4b5563', lineHeight: '1.5', margin: '0 0 16px' }}>
                                You are signed in as <b>{profile.email}</b> with the permanent role <b>{userRole}</b>.
                            </p>

                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#334155', lineHeight: '1.5', marginBottom: '20px' }}>
                                🔒 <b>Single-Role Policy:</b>
                                <br />
                                Each email address is strictly bound to one role. To switch to another role (Admin, Manager, Developer, or Viewer), log out of this account and sign in or sign up with the dedicated email for that role.
                            </div>
                        </div>

                        <div>
                            <button
                                id="profile-signout-btn"
                                type="button"
                                onClick={handleLogout}
                                style={{
                                    width: '100%',
                                    background: '#fef2f2',
                                    color: '#dc2626',
                                    border: '1px solid #fecaca',
                                    borderRadius: '8px',
                                    padding: '10px 16px',
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                }}
                            >
                                <span>↪</span> Log Out of {userRole} Role
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </main>
    )
}

export default ProfilePage
