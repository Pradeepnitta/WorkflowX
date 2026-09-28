import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getCurrentUser, updateProfile, logout } from '../services/authService.js'
import { getOrganizations } from '../services/organizationService.js'
import '../App.css'

const AVATAR_PRESETS = [
    {
        label: 'Lead 1',
        url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80',
    },
    {
        label: 'Lead 2',
        url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80',
    },
    {
        label: 'Engineer 1',
        url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=160&q=80',
    },
    {
        label: 'Engineer 2',
        url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80',
    },
    {
        label: 'Designer 1',
        url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=160&q=80',
    },
    {
        label: 'Designer 2',
        url: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=160&q=80',
    },
]

function playTestChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (!AudioCtx) return
        const ctx = new AudioCtx()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15) // A5
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.36)
    } catch {
        // AudioContext not allowed or not supported
    }
}

export default function SettingsPage() {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const activeTab = searchParams.get('tab') || 'general'

    function setActiveTab(tabKey) {
        setSearchParams({ tab: tabKey })
    }

    const [user, setUser] = useState(null)
    const [organizations, setOrganizations] = useState([])
    const [name, setName] = useState('')
    const [avatarUrl, setAvatarUrl] = useState('')
    const [userRole, setUserRole] = useState('MEMBER')

    // App Preferences
    const [theme, setTheme] = useState(() => localStorage.getItem('workflowx_theme') || 'light')
    const [density, setDensity] = useState(() => localStorage.getItem('workflowx_density') || 'comfortable')
    const [defaultView, setDefaultView] = useState(() => localStorage.getItem('workflowx_default_view') || 'kanban')

    // Notification toggles
    const [emailAlerts, setEmailAlerts] = useState(() => localStorage.getItem('workflowx_notify_email') !== 'false')
    const [mentionAlerts, setMentionAlerts] = useState(() => localStorage.getItem('workflowx_notify_mentions') !== 'false')
    const [taskUpdateAlerts, setTaskUpdateAlerts] = useState(() => localStorage.getItem('workflowx_notify_tasks') !== 'false')
    const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('workflowx_sound') !== 'false')
    const [browserNotificationStatus, setBrowserNotificationStatus] = useState(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            return Notification.permission
        }
        return 'unsupported'
    })

    // Password State
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showCurrentPw, setShowCurrentPw] = useState(false)
    const [showNewPw, setShowNewPw] = useState(false)

    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')

    // Apply theme changes to document in real time
    useEffect(() => {
        if (theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
        } else {
            document.documentElement.setAttribute('data-theme', theme)
        }
        localStorage.setItem('workflowx_theme', theme)
    }, [theme])

    // Apply density changes to document
    useEffect(() => {
        document.documentElement.setAttribute('data-density', density)
        localStorage.setItem('workflowx_density', density)
    }, [density])

    // Initial User & Organization Load
    useEffect(() => {
        setIsLoading(true)
        Promise.all([
            getCurrentUser().catch(() => null),
            getOrganizations().catch(() => []),
        ])
            .then(([userData, orgsData]) => {
                if (userData) {
                    setUser(userData)
                    setName(userData.name || '')
                    setAvatarUrl(userData.avatarUrl || '')
                }
                const orgs = Array.isArray(orgsData) ? orgsData : []
                setOrganizations(orgs)
                const storedRole = localStorage.getItem('workflowx_registered_role') || orgs[0]?.role || 'MEMBER'
                setUserRole(storedRole.toUpperCase())
            })
            .catch((err) => setError(err.message))
            .finally(() => setIsLoading(false))
    }, [])

    function flashSuccess(msg) {
        setSuccessMessage(msg)
        setError('')
        setTimeout(() => setSuccessMessage(''), 4000)
    }

    async function handleProfileSave(event) {
        event.preventDefault()
        setIsSaving(true)
        setError('')
        try {
            const updated = await updateProfile({ name, avatarUrl: avatarUrl || null })
            setUser((current) => ({ ...current, ...updated }))
            flashSuccess('Profile details saved successfully.')
        } catch (err) {
            setError(err.message || 'Failed to update profile.')
        } finally {
            setIsSaving(false)
        }
    }

    function handlePreferencesSave(event) {
        event.preventDefault()
        localStorage.setItem('workflowx_theme', theme)
        localStorage.setItem('workflowx_density', density)
        localStorage.setItem('workflowx_default_view', defaultView)
        localStorage.setItem('workflowx_notify_email', String(emailAlerts))
        localStorage.setItem('workflowx_notify_mentions', String(mentionAlerts))
        localStorage.setItem('workflowx_notify_tasks', String(taskUpdateAlerts))
        localStorage.setItem('workflowx_sound', String(soundEnabled))
        flashSuccess('Display and workflow preferences saved.')
    }

    async function handleRequestBrowserNotifications() {
        if (!('Notification' in window)) {
            setError('Desktop notifications are not supported in this browser.')
            return
        }
        try {
            const permission = await Notification.requestPermission()
            setBrowserNotificationStatus(permission)
            if (permission === 'granted') {
                flashSuccess('Desktop notifications granted! You will receive live alerts.')
                new Notification('WorkFlowX', {
                    body: 'Desktop notifications are actively connected to your workspace.',
                    icon: '/favicon.ico',
                })
            } else {
                setError('Notification permission was denied.')
            }
        } catch (err) {
            setError(err.message)
        }
    }

    async function handlePasswordChange(event) {
        event.preventDefault()
        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters long.')
            return
        }
        if (newPassword !== confirmPassword) {
            setError('New passwords do not match.')
            return
        }
        setIsUpdatingPassword(true)
        setError('')
        try {
            await updateProfile({ currentPassword, newPassword })
            flashSuccess('Password updated successfully. Please use your new password next time you sign in.')
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
        } catch (err) {
            setError(err.message || 'Failed to update password. Please check your current password.')
        } finally {
            setIsUpdatingPassword(false)
        }
    }

    async function handleLogout() {
        if (window.confirm('Are you sure you want to sign out of WorkFlowX?')) {
            try {
                await logout().catch(() => null)
            } finally {
                navigate('/login')
            }
        }
    }

    function handleClearCache() {
        if (window.confirm('Clear local preferences and reload the workspace?')) {
            localStorage.removeItem('workflowx_theme')
            localStorage.removeItem('workflowx_density')
            localStorage.removeItem('workflowx_default_view')
            window.location.reload()
        }
    }

    return (
        <main className="feature-page" style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '60px' }}>
            <div className="feature-heading" style={{ marginBottom: '24px' }}>
                <div>
                    <p className="eyebrow">Administration & Configuration</p>
                    <h1 style={{ fontSize: '28px', margin: '4px 0 6px' }}>Settings</h1>
                    <p className="heading-subtitle" style={{ color: '#6b7280' }}>
                        Configure your account, appearance, notifications, workspace role, and security credentials.
                    </p>
                </div>
            </div>

            {error && (
                <div
                    role="alert"
                    style={{
                        background: '#fef2f2',
                        border: '1px solid #fee2e2',
                        color: '#991b1b',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        marginBottom: '20px',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <span>⚠️ {error}</span>
                    <button
                        type="button"
                        onClick={() => setError('')}
                        style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 700 }}
                    >
                        ✕
                    </button>
                </div>
            )}
            {successMessage && (
                <div
                    role="status"
                    style={{
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        color: '#166534',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        marginBottom: '20px',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <span>✓ {successMessage}</span>
                    <button
                        type="button"
                        onClick={() => setSuccessMessage('')}
                        style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontWeight: 700 }}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Navigation Tabs */}
            <div
                style={{
                    display: 'flex',
                    gap: '4px',
                    borderBottom: '1px solid #e5e7eb',
                    marginBottom: '24px',
                    overflowX: 'auto',
                }}
            >
                {[
                    { id: 'general', label: '⚙️ General & Profile' },
                    { id: 'preferences', label: '🎨 Display & Appearance' },
                    { id: 'notifications', label: '🔔 Notifications' },
                    { id: 'workspace', label: '🏢 Workspace & Role' },
                    { id: 'security', label: '🔒 Security & Access' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '10px 16px',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid #ee785e' : '2px solid transparent',
                            color: activeTab === tab.id ? '#111827' : '#6b7280',
                            fontWeight: activeTab === tab.id ? '600' : '500',
                            fontSize: '13.5px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>Loading account settings...</div>
            ) : (
                <div>
                    {/* TAB 1: General & Profile */}
                    {activeTab === 'general' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: '24px' }}>
                            <form className="panel" onSubmit={handleProfileSave} style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
                                <h2 style={{ fontSize: '18px', margin: '0 0 4px', color: '#111827' }}>Personal Information</h2>
                                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>
                                    Update your name and profile avatar across all assigned teams and boards.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                                        Full Name
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Your full name"
                                            required
                                            style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                                        />
                                    </label>

                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                                        Email Address (Single Role Binding)
                                        <input
                                            type="email"
                                            value={user?.email || ''}
                                            disabled
                                            style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#f9fafb', color: '#6b7280', fontSize: '14px' }}
                                        />
                                        <small style={{ color: '#9ca3af', fontSize: '11px' }}>
                                            Email is locked to role <b>{userRole}</b> for enterprise security and audit isolation.
                                        </small>
                                    </label>

                                    <div>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                                            Avatar Image URL
                                            <input
                                                type="url"
                                                value={avatarUrl}
                                                onChange={(e) => setAvatarUrl(e.target.value)}
                                                placeholder="https://images.unsplash.com/..."
                                                style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                                            />
                                        </label>

                                        {/* Avatar Quick Presets */}
                                        <div style={{ marginTop: '10px' }}>
                                            <small style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '6px', fontWeight: 600 }}>
                                                Or pick a preset avatar:
                                            </small>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                {AVATAR_PRESETS.map((preset, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => setAvatarUrl(preset.url)}
                                                        title={`Pick ${preset.label}`}
                                                        style={{
                                                            width: '36px',
                                                            height: '36px',
                                                            borderRadius: '50%',
                                                            border: avatarUrl === preset.url ? '2px solid #ee785e' : '1px solid #e5e7eb',
                                                            padding: 0,
                                                            overflow: 'hidden',
                                                            cursor: 'pointer',
                                                            transform: avatarUrl === preset.url ? 'scale(1.1)' : 'scale(1)',
                                                            transition: 'transform 0.15s ease',
                                                        }}
                                                    >
                                                        <img src={preset.url} alt={preset.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    </button>
                                                ))}
                                                {avatarUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setAvatarUrl('')}
                                                        style={{
                                                            fontSize: '11px',
                                                            color: '#ef4444',
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            padding: '4px 8px',
                                                        }}
                                                    >
                                                        ✕ Clear
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginTop: '24px', display: 'flex', gap: '10px' }}>
                                    <button className="primary-button" type="submit" disabled={isSaving} style={{ padding: '10px 20px', borderRadius: '6px', fontWeight: '600' }}>
                                        {isSaving ? 'Saving...' : 'Save Profile Changes'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setName(user?.name || '')
                                            setAvatarUrl(user?.avatarUrl || '')
                                        }}
                                        style={{ padding: '10px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', fontSize: '13px', cursor: 'pointer' }}
                                    >
                                        Reset
                                    </button>
                                </div>
                            </form>

                            {/* Reactive Profile Preview Card */}
                            <div className="panel" style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb', height: 'fit-content' }}>
                                <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 16px', color: '#6b7280' }}>
                                    Live Profile Preview
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', padding: '16px 0', borderBottom: '1px solid #f3f4f6' }}>
                                    {avatarUrl ? (
                                        <img
                                            src={avatarUrl}
                                            alt="Avatar"
                                            onError={(e) => {
                                                e.target.style.display = 'none'
                                            }}
                                            style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #ee785e', boxShadow: '0 4px 12px rgba(238, 120, 94, 0.25)' }}
                                        />
                                    ) : (
                                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#ee785e', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '28px', fontWeight: '700', boxShadow: '0 4px 12px rgba(238, 120, 94, 0.25)' }}>
                                            {name?.slice(0, 2).toUpperCase() || 'WX'}
                                        </div>
                                    )}
                                    <div>
                                        <h4 style={{ margin: '0 0 4px', fontSize: '17px', color: '#111827', fontWeight: 700 }}>{name || 'Workspace Member'}</h4>
                                        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>{user?.email || 'user@workflowx.dev'}</p>
                                    </div>
                                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 12px', borderRadius: '12px', background: '#fee2e2', color: '#b91c1c' }}>
                                        {userRole}
                                    </span>
                                </div>

                                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <small style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>
                                        Quick Navigation
                                    </small>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/tasks')}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '8px 12px',
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '12.5px',
                                            color: '#334155',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                        }}
                                    >
                                        <span>📋 My Signboard Tasks</span>
                                        <span>➔</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/members')}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '8px 12px',
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '12.5px',
                                            color: '#334155',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                        }}
                                    >
                                        <span>👥 Team Directory</span>
                                        <span>➔</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: Display & Appearance */}
                    {activeTab === 'preferences' && (
                        <form className="panel" onSubmit={handlePreferencesSave} style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb', maxWidth: '750px' }}>
                            <h2 style={{ fontSize: '18px', margin: '0 0 4px', color: '#111827' }}>Display & Appearance Settings</h2>
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>
                                Customize color theme, card spacing density, and default sprint views across your device.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                                        Interface Theme
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                                        {[
                                            { id: 'light', label: '☀️ Light Clean', desc: 'Crisp minimal palette' },
                                            { id: 'dark', label: '🌙 Midnight Dark', desc: 'Sleek high contrast' },
                                            { id: 'system', label: '💻 System Sync', desc: 'Follows OS preference' },
                                        ].map((item) => (
                                            <div
                                                key={item.id}
                                                onClick={() => setTheme(item.id)}
                                                style={{
                                                    padding: '14px',
                                                    border: theme === item.id ? '2px solid #ee785e' : '1px solid #e5e7eb',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    background: theme === item.id ? '#fff3f0' : '#fff',
                                                    transition: 'all 0.15s ease',
                                                }}
                                            >
                                                <strong style={{ display: 'block', fontSize: '13px', color: '#111827', marginBottom: '2px' }}>{item.label}</strong>
                                                <small style={{ color: '#6b7280', fontSize: '11px' }}>{item.desc}</small>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                                        Signboard Card Density
                                    </label>
                                    <select
                                        value={density}
                                        onChange={(e) => setDensity(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                                    >
                                        <option value="compact">Compact (Dense layout, more cards per column)</option>
                                        <option value="comfortable">Comfortable (Balanced breathing room)</option>
                                        <option value="spacious">Spacious (Large cards with extra padding)</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                                        Default Tasks Workspace View
                                    </label>
                                    <select
                                        value={defaultView}
                                        onChange={(e) => setDefaultView(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                                    >
                                        <option value="kanban">Signboard Columns (Kanban)</option>
                                        <option value="list">Structured List View</option>
                                        <option value="calendar">Sprint Timeline Calendar</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginTop: '28px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <button className="primary-button" type="submit" style={{ padding: '10px 20px', borderRadius: '6px', fontWeight: '600' }}>
                                    Save Preferences
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate('/tasks')}
                                    style={{ padding: '10px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', fontSize: '13px', cursor: 'pointer' }}
                                >
                                    Open Signboard ➔
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTheme('light')
                                        setDensity('comfortable')
                                        setDefaultView('kanban')
                                    }}
                                    style={{ padding: '10px 12px', background: 'none', border: 'none', color: '#6b7280', fontSize: '12px', cursor: 'pointer', marginLeft: 'auto' }}
                                >
                                    Reset to Defaults
                                </button>
                            </div>
                        </form>
                    )}

                    {/* TAB 3: Notifications */}
                    {activeTab === 'notifications' && (
                        <div style={{ maxWidth: '750px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <form className="panel" onSubmit={handlePreferencesSave} style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <div>
                                        <h2 style={{ fontSize: '18px', margin: '0 0 4px', color: '#111827' }}>Notification Feeds & Rules</h2>
                                        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Configure real-time alerts and activity broadcasts.</p>
                                    </div>
                                    <button
                                        type="button"
                                        className="primary-button"
                                        onClick={() => navigate('/notifications')}
                                        style={{ fontSize: '12px', padding: '6px 12px' }}
                                    >
                                        View Inbox ➔
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', border: '1px solid #f3f4f6', borderRadius: '8px', cursor: 'pointer', background: '#fafaf9' }}>
                                        <div>
                                            <strong style={{ display: 'block', fontSize: '14px', color: '#111827' }}>Email Notifications</strong>
                                            <small style={{ color: '#6b7280', fontSize: '12px' }}>Receive summary emails about assigned tasks and milestone deadlines.</small>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={emailAlerts}
                                            onChange={(e) => setEmailAlerts(e.target.checked)}
                                            style={{ width: '18px', height: '18px', accentColor: '#ee785e', cursor: 'pointer' }}
                                        />
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', border: '1px solid #f3f4f6', borderRadius: '8px', cursor: 'pointer', background: '#fafaf9' }}>
                                        <div>
                                            <strong style={{ display: 'block', fontSize: '14px', color: '#111827' }}>Mentions & Comments</strong>
                                            <small style={{ color: '#6b7280', fontSize: '12px' }}>Instant browser badge when someone @mentions your name or replies.</small>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={mentionAlerts}
                                            onChange={(e) => setMentionAlerts(e.target.checked)}
                                            style={{ width: '18px', height: '18px', accentColor: '#ee785e', cursor: 'pointer' }}
                                        />
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', border: '1px solid #f3f4f6', borderRadius: '8px', cursor: 'pointer', background: '#fafaf9' }}>
                                        <div>
                                            <strong style={{ display: 'block', fontSize: '14px', color: '#111827' }}>Task Status Transitions</strong>
                                            <small style={{ color: '#6b7280', fontSize: '12px' }}>Notify when cards transition between Backlog, In Progress, and Done.</small>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={taskUpdateAlerts}
                                            onChange={(e) => setTaskUpdateAlerts(e.target.checked)}
                                            style={{ width: '18px', height: '18px', accentColor: '#ee785e', cursor: 'pointer' }}
                                        />
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', border: '1px solid #f3f4f6', borderRadius: '8px', cursor: 'pointer', background: '#fafaf9' }}>
                                        <div>
                                            <strong style={{ display: 'block', fontSize: '14px', color: '#111827' }}>Sound Alerts</strong>
                                            <small style={{ color: '#6b7280', fontSize: '12px' }}>Play subtle chime upon receiving live messages or task drops.</small>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault()
                                                    playTestChime()
                                                }}
                                                style={{
                                                    background: '#fff',
                                                    border: '1px solid #d1d5db',
                                                    borderRadius: '4px',
                                                    padding: '3px 8px',
                                                    fontSize: '11px',
                                                    cursor: 'pointer',
                                                }}
                                                title="Play chime sound"
                                            >
                                                🔊 Test Chime
                                            </button>
                                            <input
                                                type="checkbox"
                                                checked={soundEnabled}
                                                onChange={(e) => setSoundEnabled(e.target.checked)}
                                                style={{ width: '18px', height: '18px', accentColor: '#ee785e', cursor: 'pointer' }}
                                            />
                                        </div>
                                    </label>
                                </div>

                                <div style={{ marginTop: '24px', display: 'flex', gap: '10px' }}>
                                    <button className="primary-button" type="submit" style={{ padding: '10px 20px', borderRadius: '6px', fontWeight: '600' }}>
                                        Save Notification Rules
                                    </button>
                                </div>
                            </form>

                            {/* Desktop Web Push Notifications Card */}
                            <div className="panel" style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 style={{ fontSize: '16px', margin: '0 0 4px', color: '#111827' }}>Browser Desktop Push</h3>
                                        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                                            Allow native OS notifications even when the WorkFlowX tab is running in the background.
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span
                                            style={{
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                padding: '4px 10px',
                                                borderRadius: '12px',
                                                background: browserNotificationStatus === 'granted' ? '#ecfdf5' : '#fef2f2',
                                                color: browserNotificationStatus === 'granted' ? '#065f46' : '#991b1b',
                                            }}
                                        >
                                            {browserNotificationStatus === 'granted' ? 'Active ✓' : 'Permission Required'}
                                        </span>
                                        {browserNotificationStatus !== 'granted' && (
                                            <button
                                                type="button"
                                                onClick={handleRequestBrowserNotifications}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    background: '#111827',
                                                    color: '#fff',
                                                    border: 'none',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Enable
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 4: Workspace & Role */}
                    {activeTab === 'workspace' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '850px' }}>
                            <section className="panel" style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <div>
                                        <h2 style={{ fontSize: '18px', margin: '0 0 4px', color: '#111827' }}>Operational Role & Permissions</h2>
                                        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                                            Role capabilities and enterprise access isolation level.
                                        </p>
                                    </div>
                                    <span style={{ fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '12px', background: '#fee2e2', color: '#b91c1c' }}>
                                        {userRole}
                                    </span>
                                </div>

                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', fontSize: '13px', color: '#334155', lineHeight: '1.6', marginBottom: '16px' }}>
                                    🛡️ <b>Single Role Binding Policy:</b>
                                    <br />
                                    Your email address <code>{user?.email}</code> is securely bound to the <b>{userRole}</b> role.
                                    {userRole === 'MANAGER' && (
                                        <span> As a <b>Manager</b>, you have administrative command over projects, member task allocations, and sprint metrics.</span>
                                    )}
                                </div>

                                {/* Manager / Role Capabilities Checklist */}
                                <div>
                                    <h4 style={{ fontSize: '13px', color: '#475569', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Active Capabilities in Workspace:
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                                        {[
                                            'Create & edit project initiatives',
                                            'Assign and re-route signboard tasks',
                                            'Invite teammates to organization',
                                            'View team velocity & analytics reports',
                                            'Broadcast organization notifications',
                                            'Manage status columns and sprint stages',
                                        ].map((cap, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1f2937' }}>
                                                <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
                                                {cap}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                                    <button
                                        type="button"
                                        className="primary-button"
                                        onClick={() => navigate('/members')}
                                        style={{ fontSize: '13px' }}
                                    >
                                        Manage Team Members ➔
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/projects')}
                                        style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', fontSize: '13px', cursor: 'pointer' }}
                                    >
                                        View Projects Directory
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/analytics')}
                                        style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', fontSize: '13px', cursor: 'pointer' }}
                                    >
                                        View Analytics
                                    </button>
                                </div>
                            </section>

                            <section className="panel" style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
                                <h2 style={{ fontSize: '18px', margin: '0 0 4px', color: '#111827' }}>Active Organization Workspaces</h2>
                                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>Organizations where you have active team and project memberships.</p>

                                {organizations.length === 0 ? (
                                    <div style={{ padding: '14px', border: '1px solid #ebe9e5', borderRadius: '8px', background: '#fafaf9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <strong style={{ fontSize: '14px', color: '#111827' }}>WorkFlowX Primary Organization</strong>
                                            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#6b7280' }}>Core workspace deployment</p>
                                        </div>
                                        <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', background: '#e0e7ff', color: '#3730a3' }}>
                                            {userRole}
                                        </span>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {organizations.map((org) => (
                                            <div
                                                key={org.id}
                                                style={{
                                                    padding: '16px',
                                                    border: '1px solid #ebe9e5',
                                                    borderRadius: '8px',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    background: '#fafaf9',
                                                }}
                                            >
                                                <div>
                                                    <strong style={{ fontSize: '15px', color: '#111827' }}>{org.name}</strong>
                                                    {org.description && <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#6b7280' }}>{org.description}</p>}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '4px', background: '#e0e7ff', color: '#3730a3' }}>
                                                        {org.role || userRole}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate('/projects')}
                                                        style={{
                                                            padding: '5px 10px',
                                                            borderRadius: '6px',
                                                            border: '1px solid #d1d5db',
                                                            background: '#fff',
                                                            fontSize: '12px',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        Open Board
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}

                    {/* TAB 5: Security */}
                    {activeTab === 'security' && (
                        <div style={{ maxWidth: '650px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <form className="panel" onSubmit={handlePasswordChange} style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
                                <h2 style={{ fontSize: '18px', margin: '0 0 4px', color: '#111827' }}>Security & Credentials</h2>
                                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>
                                    Update your password credentials and verify active authentication tokens.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                                        Current Password
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type={showCurrentPw ? 'text' : 'password'}
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                placeholder="••••••••••••"
                                                required
                                                style={{ width: '100%', padding: '10px 40px 10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowCurrentPw((prev) => !prev)}
                                                style={{
                                                    position: 'absolute',
                                                    right: '10px',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#9ca3af',
                                                    fontSize: '12px',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {showCurrentPw ? 'Hide' : 'Show'}
                                            </button>
                                        </div>
                                    </label>

                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                                        New Password (Min. 8 characters)
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type={showNewPw ? 'text' : 'password'}
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                placeholder="••••••••••••"
                                                required
                                                style={{ width: '100%', padding: '10px 40px 10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowNewPw((prev) => !prev)}
                                                style={{
                                                    position: 'absolute',
                                                    right: '10px',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#9ca3af',
                                                    fontSize: '12px',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {showNewPw ? 'Hide' : 'Show'}
                                            </button>
                                        </div>
                                    </label>

                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                                        Confirm New Password
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="••••••••••••"
                                            required
                                            style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                                        />
                                    </label>
                                </div>

                                <div style={{ marginTop: '24px' }}>
                                    <button className="primary-button" type="submit" disabled={isUpdatingPassword} style={{ padding: '10px 20px', borderRadius: '6px', fontWeight: '600' }}>
                                        {isUpdatingPassword ? 'Updating Password...' : 'Update Password'}
                                    </button>
                                </div>
                            </form>

                            {/* Active Sessions & Security Audit */}
                            <div className="panel" style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
                                <h3 style={{ fontSize: '16px', margin: '0 0 4px', color: '#111827' }}>Active Device Sessions</h3>
                                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>
                                    Devices currently authenticated with access to this account.
                                </p>

                                <div style={{ padding: '14px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
                                        <div>
                                            <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>Current Web Browser (Active Now)</strong>
                                            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                                                Windows • Localhost Environment • Secure JWT Token
                                            </p>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#059669', background: '#d1fae5', padding: '3px 8px', borderRadius: '4px' }}>
                                        This Device
                                    </span>
                                </div>

                                <div style={{ marginTop: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: '6px',
                                            background: '#fef2f2',
                                            color: '#b91c1c',
                                            border: '1px solid #fecaca',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Sign Out of Account
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleClearCache}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: '6px',
                                            background: '#fff',
                                            color: '#6b7280',
                                            border: '1px solid #d1d5db',
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Reset Local Cache & Reload
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </main>
    )
}
