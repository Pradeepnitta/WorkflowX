import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser, updateProfile, logout } from '../services/authService.js'
import { getOrganizations } from '../services/organizationService.js'
import { AVATAR_OPTIONS } from '../constants/avatarOptions.js'
import '../App.css'

function ProfilePage() {
    const navigate = useNavigate()
    const fileInputRef = useRef(null)
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

    function handleFileChange(event) {
        const file = event.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith('image/')) {
            setError('Please select an image file (PNG, JPG, WebP, etc.).')
            return
        }

        setError('')
        const reader = new FileReader()
        reader.onload = (e) => {
            const img = new Image()
            img.onload = () => {
                // Resize image to max 400x400 to keep it crisp and lightweight
                const canvas = document.createElement('canvas')
                const maxDim = 400
                let width = img.width
                let height = img.height

                if (width > height) {
                    if (width > maxDim) {
                        height = Math.round((height * maxDim) / width)
                        width = maxDim
                    }
                } else {
                    if (height > maxDim) {
                        width = Math.round((width * maxDim) / height)
                        height = maxDim
                    }
                }

                canvas.width = width
                canvas.height = height
                const ctx = canvas.getContext('2d')
                ctx.drawImage(img, 0, 0, width, height)
                const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
                setAvatarUrl(dataUrl)
            }
            img.src = e.target.result
        }
        reader.readAsDataURL(file)
    }

    async function submit(event) {
        event.preventDefault()
        setIsSaving(true)
        setMessage('')
        setError('')
        try {
            const updatedProfile = await updateProfile({ name: name.trim(), avatarUrl: avatarUrl || null })
            setProfile(updatedProfile)
            setMessage('Profile and profile picture updated successfully!')
        } catch (requestError) {
            setError(requestError.message || 'Failed to update profile.')
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

    const initials = name?.trim() ? name.trim().slice(0, 2).toUpperCase() : profile?.name?.slice(0, 2).toUpperCase() || 'WX'

    return (
        <main className="feature-page">
            <div className="feature-heading">
                <div>
                    <p className="eyebrow">Account • Identity</p>
                    <h1>Profile & Session</h1>
                    <p className="heading-subtitle">Update your profile picture, display name, or log out to switch workspace roles.</p>
                </div>
            </div>

            {isLoading && <p className="loading-state">Loading profile...</p>}
            {error && <p className="service-error" role="alert">{error}</p>}

            {!isLoading && profile && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px', maxWidth: '960px' }}>
                    {/* Left Column: Profile Information & Photo Upload */}
                    <section className="profile-panel panel" style={{ background: '#fff', borderRadius: '14px', padding: '28px', border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #f1f5f9' }}>
                            {/* Interactive Avatar Container with Photo Upload Overlay */}
                            <div style={{ position: 'relative', width: '84px', height: '84px', flexShrink: 0 }}>
                                <div
                                    style={{
                                        width: '84px',
                                        height: '84px',
                                        borderRadius: '50%',
                                        overflow: 'hidden',
                                        border: '3px solid #ee785e',
                                        boxShadow: '0 4px 14px rgba(238, 120, 94, 0.25)',
                                        background: '#f8fafc',
                                        display: 'grid',
                                        placeItems: 'center',
                                    }}
                                >
                                    {avatarUrl ? (
                                        <img
                                            src={avatarUrl}
                                            alt={name || 'User Avatar'}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            onError={() => setAvatarUrl('')}
                                        />
                                    ) : (
                                        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #ee785e, #f97316)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '26px', fontWeight: 800 }}>
                                            {initials}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Upload new profile picture"
                                    style={{
                                        position: 'absolute',
                                        bottom: '-2px',
                                        right: '-2px',
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        background: '#0f172a',
                                        color: '#ffffff',
                                        border: '2px solid #ffffff',
                                        display: 'grid',
                                        placeItems: 'center',
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                                    }}
                                >
                                    📷
                                </button>
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#0f172a', fontWeight: 700, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                    {name || profile.name}
                                </h3>
                                <p style={{ margin: '0 0 8px', color: '#64748b', fontSize: '13px' }}>{profile.email}</p>
                                <span
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        background: userRole === 'ADMIN' ? '#fee2e2' : userRole === 'MANAGER' ? '#e0e7ff' : '#f0fdf4',
                                        color: userRole === 'ADMIN' ? '#b91c1c' : userRole === 'MANAGER' ? '#4338ca' : '#15803d',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                    }}
                                >
                                    {userRole}
                                </span>
                            </div>
                        </div>

                        {/* Hidden File Input for Native Picture Picker */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                        />

                        {/* Action Buttons for Picture Upload */}
                        <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    borderRadius: '6px',
                                    background: '#f1f5f9',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '12.5px',
                                    fontWeight: 600,
                                    color: '#1e293b',
                                    cursor: 'pointer',
                                }}
                            >
                                📁 Upload Photo from Device
                            </button>

                            {avatarUrl && (
                                <button
                                    type="button"
                                    onClick={() => setAvatarUrl('')}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        background: 'transparent',
                                        border: '1px solid #fee2e2',
                                        fontSize: '12.5px',
                                        fontWeight: 600,
                                        color: '#ef4444',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ✕ Remove Picture
                                </button>
                            )}
                        </div>

                        {/* Avatar Options Selection */}
                        <div style={{ marginTop: '16px', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                                    Or choose an avatar option:
                                </span>
                                {avatarUrl && (
                                    <button
                                        type="button"
                                        onClick={() => setAvatarUrl('')}
                                        style={{ fontSize: '11px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                    >
                                        Reset to Initials
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                {AVATAR_OPTIONS.map((opt) => {
                                    const isSelected = avatarUrl === opt.url
                                    return (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setAvatarUrl(opt.url)}
                                            title={`Select ${opt.label}`}
                                            style={{
                                                position: 'relative',
                                                width: '38px',
                                                height: '38px',
                                                borderRadius: '50%',
                                                padding: 0,
                                                border: isSelected ? '2.5px solid #ee785e' : '1px solid #cbd5e1',
                                                boxShadow: isSelected ? '0 0 0 2px rgba(238, 120, 94, 0.35)' : 'none',
                                                overflow: 'hidden',
                                                cursor: 'pointer',
                                                transform: isSelected ? 'scale(1.12)' : 'scale(1)',
                                                transition: 'all 0.15s ease',
                                                background: '#f8fafc',
                                            }}
                                        >
                                            <img src={opt.url} alt={opt.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Profile Edit Form */}
                        <form className="auth-form" onSubmit={submit}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                                Full Name
                                <input
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder="Enter your name"
                                    required
                                    style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                                />
                            </label>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                                Direct Image URL (Optional)
                                <input
                                    type="text"
                                    value={avatarUrl}
                                    onChange={(event) => setAvatarUrl(event.target.value)}
                                    placeholder="https://... (or use Upload button above)"
                                    style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                                />
                            </label>

                            {message && (
                                <p className="success-message" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', margin: '0 0 16px' }}>
                                    ✓ {message}
                                </p>
                            )}

                            <button className="primary-button" type="submit" disabled={isSaving} style={{ width: '100%', padding: '11px', fontSize: '14px', fontWeight: 600 }}>
                                {isSaving ? 'Saving Changes...' : 'Save Profile & Photo'}
                            </button>
                        </form>
                    </section>

                    {/* Right Column: Role Policy & Session Security */}
                    <section className="panel" style={{ background: '#fff', borderRadius: '14px', padding: '28px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: 700 }}>Role & Identity</h3>
                                <span
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        background: userRole === 'ADMIN' ? '#fee2e2' : userRole === 'MANAGER' ? '#e0e7ff' : '#f0fdf4',
                                        color: userRole === 'ADMIN' ? '#b91c1c' : userRole === 'MANAGER' ? '#4338ca' : '#15803d',
                                        padding: '3px 10px',
                                        borderRadius: '12px',
                                    }}
                                >
                                    {userRole}
                                </span>
                            </div>

                            <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: '1.6', margin: '0 0 16px' }}>
                                Authenticated workspace identity for <b>{profile.email}</b>.
                            </p>

                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', fontSize: '12.5px', color: '#334155', lineHeight: '1.6', marginBottom: '24px' }}>
                                🔒 <b>Single-Role Enterprise Architecture:</b>
                                <br />
                                Each account email is dedicated to one role for audit isolation and security. Your profile picture and display name are shared across all your workspace boards, comments, squads, and activities.
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
                                    padding: '11px 16px',
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                }}
                            >
                                <span>↪</span> Log Out of {userRole} Account
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </main>
    )
}

export default ProfilePage
