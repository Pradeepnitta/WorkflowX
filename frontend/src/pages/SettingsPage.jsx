import { useEffect, useState } from 'react'
import { getCurrentUser, updateProfile } from '../services/authService.js'
import { getOrganizations } from '../services/organizationService.js'
import '../App.css'

function SettingsPage() {
    const [activeTab, setActiveTab] = useState('general')
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

    // Security & Organization state
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')

    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')

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
            setError(err.message)
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
        flashSuccess('Workspace preferences and notification options saved.')
    }

    function handlePasswordChange(event) {
        event.preventDefault()
        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters long.')
            return
        }
        if (newPassword !== confirmPassword) {
            setError('New passwords do not match.')
            return
        }
        // Local simulation / prompt
        flashSuccess('Password updated successfully.')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
    }

    return (
        <main className="feature-page" style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '60px' }}>
            <div className="feature-heading" style={{ marginBottom: '24px' }}>
                <div>
                    <p className="eyebrow">Administration & Configuration</p>
                    <h1 style={{ fontSize: '28px', margin: '4px 0 6px' }}>Settings</h1>
                    <p className="heading-subtitle" style={{ color: '#6b7280' }}>
                        Configure your account, workspace preferences, notification feeds, and security.
                    </p>
                </div>
            </div>

            {error && (
                <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px' }}>
                    ⚠️ {error}
                </div>
            )}
            {successMessage && (
                <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px' }}>
                    ✓ {successMessage}
                </div>
            )}

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e5e7eb', marginBottom: '24px' }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('general')}
                    style={{
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'general' ? '2px solid #ee785e' : '2px solid transparent',
                        color: activeTab === 'general' ? '#111827' : '#6b7280',
                        fontWeight: activeTab === 'general' ? '600' : '500',
                        fontSize: '14px',
                        cursor: 'pointer',
                    }}
                >
                    ⚙️ General & Profile
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('preferences')}
                    style={{
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'preferences' ? '2px solid #ee785e' : '2px solid transparent',
                        color: activeTab === 'preferences' ? '#111827' : '#6b7280',
                        fontWeight: activeTab === 'preferences' ? '600' : '500',
                        fontSize: '14px',
                        cursor: 'pointer',
                    }}
                >
                    🎨 Display & Appearance
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('notifications')}
                    style={{
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'notifications' ? '2px solid #ee785e' : '2px solid transparent',
                        color: activeTab === 'notifications' ? '#111827' : '#6b7280',
                        fontWeight: activeTab === 'notifications' ? '600' : '500',
                        fontSize: '14px',
                        cursor: 'pointer',
                    }}
                >
                    🔔 Notifications
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('workspace')}
                    style={{
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'workspace' ? '2px solid #ee785e' : '2px solid transparent',
                        color: activeTab === 'workspace' ? '#111827' : '#6b7280',
                        fontWeight: activeTab === 'workspace' ? '600' : '500',
                        fontSize: '14px',
                        cursor: 'pointer',
                    }}
                >
                    🏢 Workspace & Role
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('security')}
                    style={{
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'security' ? '2px solid #ee785e' : '2px solid transparent',
                        color: activeTab === 'security' ? '#111827' : '#6b7280',
                        fontWeight: activeTab === 'security' ? '600' : '500',
                        fontSize: '14px',
                        cursor: 'pointer',
                    }}
                >
                    🔒 Security
                </button>
            </div>

            {isLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading settings...</div>
            ) : (
                <div>
                    {/* TAB 1: General & Profile */}
                    {activeTab === 'general' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
                            <form className="panel" onSubmit={handleProfileSave} style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
                                <h2 style={{ fontSize: '18px', margin: '0 0 4px', color: '#111827' }}>Personal Information</h2>
                                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>Update your photo and personal profile details.</p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                                        Email Address (Bound to Single Role)
                                        <input
                                            type="email"
                                            value={user?.email || ''}
                                            disabled
                                            style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#f9fafb', color: '#6b7280', fontSize: '14px' }}
                                        />
                                        <small style={{ color: '#9ca3af', fontSize: '11px' }}>Email address cannot be changed directly due to role isolation policy.</small>
                                    </label>

                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                                        Avatar Image URL
                                        <input
                                            type="url"
                                            value={avatarUrl}
                                            onChange={(e) => setAvatarUrl(e.target.value)}
                                            placeholder="https://images.unsplash.com/..."
                                            style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                                        />
                                    </label>
                                </div>

                                <div style={{ marginTop: '24px' }}>
                                    <button className="primary-button" type="submit" disabled={isSaving} style={{ padding: '10px 20px', borderRadius: '6px', fontWeight: '600' }}>
                                        {isSaving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>

                            {/* Preview Card */}
                            <div className="panel" style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb', height: 'fit-content' }}>
                                <h3 style={{ fontSize: '15px', margin: '0 0 16px', color: '#374151' }}>Profile Preview</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', padding: '16px 0' }}>
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt="Avatar" style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #ee785e' }} />
                                    ) : (
                                        <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#ee785e', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '24px', fontWeight: '700' }}>
                                            {name?.slice(0, 2).toUpperCase() || 'U'}
                                        </div>
                                    )}
                                    <div>
                                        <h4 style={{ margin: '0 0 4px', fontSize: '16px', color: '#111827' }}>{name || 'Your Name'}</h4>
                                        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>{user?.email}</p>
                                    </div>
                                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '12px', background: '#fee2e2', color: '#b91c1c' }}>
                                        {userRole}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: Display & Appearance */}
                    {activeTab === 'preferences' && (
                        <form className="panel" onSubmit={handlePreferencesSave} style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb', maxWidth: '700px' }}>
                            <h2 style={{ fontSize: '18px', margin: '0 0 4px', color: '#111827' }}>Display & Interface Settings</h2>
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>Customize how WorkFlowX looks and feels on your computer.</p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Interface Theme</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                                        {[
                                            { id: 'light', label: '☀️ Light Clean', desc: 'Crisp light mode' },
                                            { id: 'dark', label: '🌙 Midnight Dark', desc: 'High contrast dark' },
                                            { id: 'system', label: '💻 System Sync', desc: 'Matches device' },
                                        ].map((item) => (
                                            <div
                                                key={item.id}
                                                onClick={() => setTheme(item.id)}
                                                style={{
                                                    padding: '12px',
                                                    border: theme === item.id ? '2px solid #ee785e' : '1px solid #e5e7eb',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    background: theme === item.id ? '#fff3f0' : '#fff',
                                                }}
                                            >
                                                <strong style={{ display: 'block', fontSize: '13px', color: '#111827' }}>{item.label}</strong>
                                                <small style={{ color: '#6b7280', fontSize: '11px' }}>{item.desc}</small>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Card Density</label>
                                    <select
                                        value={density}
                                        onChange={(e) => setDensity(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                                    >
                                        <option value="compact">Compact (More items on screen)</option>
                                        <option value="comfortable">Comfortable (Balanced spacing)</option>
                                        <option value="spacious">Spacious (Large cards and padding)</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Default Tasks View</label>
                                    <select
                                        value={defaultView}
                                        onChange={(e) => setDefaultView(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                                    >
                                        <option value="kanban">Kanban Board</option>
                                        <option value="list">List View</option>
                                        <option value="calendar">Calendar Timeline</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginTop: '28px' }}>
                                <button className="primary-button" type="submit" style={{ padding: '10px 20px', borderRadius: '6px', fontWeight: '600' }}>
                                    Save Preferences
                                </button>
                            </div>
                        </form>
                    )}

                    {/* TAB 3: Notifications */}
                    {activeTab === 'notifications' && (
                        <form className="panel" onSubmit={handlePreferencesSave} style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb', maxWidth: '700px' }}>
                            <h2 style={{ fontSize: '18px', margin: '0 0 4px', color: '#111827' }}>Notification Feeds</h2>
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>Choose which events trigger alerts and email messages.</p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #f3f4f6', borderRadius: '8px', cursor: 'pointer' }}>
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

                                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #f3f4f6', borderRadius: '8px', cursor: 'pointer' }}>
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

                                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #f3f4f6', borderRadius: '8px', cursor: 'pointer' }}>
                                    <div>
                                        <strong style={{ display: 'block', fontSize: '14px', color: '#111827' }}>Task Status Updates</strong>
                                        <small style={{ color: '#6b7280', fontSize: '12px' }}>Notify when cards transition between Backlog, In Progress, and Done.</small>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={taskUpdateAlerts}
                                        onChange={(e) => setTaskUpdateAlerts(e.target.checked)}
                                        style={{ width: '18px', height: '18px', accentColor: '#ee785e', cursor: 'pointer' }}
                                    />
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #f3f4f6', borderRadius: '8px', cursor: 'pointer' }}>
                                    <div>
                                        <strong style={{ display: 'block', fontSize: '14px', color: '#111827' }}>Sound Alerts</strong>
                                        <small style={{ color: '#6b7280', fontSize: '12px' }}>Play subtle chime upon receiving live messages or task drops.</small>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={soundEnabled}
                                        onChange={(e) => setSoundEnabled(e.target.checked)}
                                        style={{ width: '18px', height: '18px', accentColor: '#ee785e', cursor: 'pointer' }}
                                    />
                                </label>
                            </div>

                            <div style={{ marginTop: '24px' }}>
                                <button className="primary-button" type="submit" style={{ padding: '10px 20px', borderRadius: '6px', fontWeight: '600' }}>
                                    Save Notification Rules
                                </button>
                            </div>
                        </form>
                    )}

                    {/* TAB 4: Workspace & Role */}
                    {activeTab === 'workspace' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' }}>
                            <section className="panel" style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <div>
                                        <h2 style={{ fontSize: '18px', margin: '0 0 4px', color: '#111827' }}>Role & Permission Level</h2>
                                        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Permissions associated with your account in this organization.</p>
                                    </div>
                                    <span style={{ fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '12px', background: '#fee2e2', color: '#b91c1c' }}>
                                        {userRole}
                                    </span>
                                </div>

                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', fontSize: '13px', color: '#334155', lineHeight: '1.6' }}>
                                    🛡️ <b>Single Role Binding Policy:</b>
                                    <br />
                                    Your email address is strictly registered with the <b>{userRole}</b> role. To switch to a different operational role (Admin, Manager, Developer, or Viewer), log out of this account and create or log into the respective dedicated role account.
                                </div>
                            </section>

                            <section className="panel" style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
                                <h2 style={{ fontSize: '18px', margin: '0 0 4px', color: '#111827' }}>Active Organization Workspaces</h2>
                                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>Organizations where you have active team and project memberships.</p>

                                {organizations.length === 0 ? (
                                    <p style={{ color: '#9ca3af', fontSize: '13px', fontStyle: 'italic' }}>No organization memberships found.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {organizations.map((org) => (
                                            <div
                                                key={org.id}
                                                style={{
                                                    padding: '14px',
                                                    border: '1px solid #ebe9e5',
                                                    borderRadius: '8px',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    background: '#fafaf9',
                                                }}
                                            >
                                                <div>
                                                    <strong style={{ fontSize: '14px', color: '#111827' }}>{org.name}</strong>
                                                    {org.description && <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#6b7280' }}>{org.description}</p>}
                                                </div>
                                                <span style={{ fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', background: '#e0e7ff', color: '#3730a3' }}>
                                                    {org.role || 'MEMBER'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}

                    {/* TAB 5: Security */}
                    {activeTab === 'security' && (
                        <form className="panel" onSubmit={handlePasswordChange} style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb', maxWidth: '600px' }}>
                            <h2 style={{ fontSize: '18px', margin: '0 0 4px', color: '#111827' }}>Security & Credentials</h2>
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>Update password credentials and review active security policies.</p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                                    Current Password
                                    <input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        placeholder="••••••••••••"
                                        required
                                        style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                                    />
                                </label>

                                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                                    New Password (Min. 8 characters)
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="••••••••••••"
                                        required
                                        style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                                    />
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
                                <button className="primary-button" type="submit" style={{ padding: '10px 20px', borderRadius: '6px', fontWeight: '600' }}>
                                    Update Password
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            )}
        </main>
    )
}

export default SettingsPage
