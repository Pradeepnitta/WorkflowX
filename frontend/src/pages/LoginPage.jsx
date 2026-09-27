import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { login } from '../services/authService.js'
import '../App.css'

function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isSigningInAsAdmin, setIsSigningInAsAdmin] = useState(false)
    const [adminKey, setAdminKey] = useState('')
    const [showAdminKey, setShowAdminKey] = useState(false)
    const [savedCreds, setSavedCreds] = useState(null)
    const [pendingSaveModal, setPendingSaveModal] = useState(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const navigate = useNavigate()
    const location = useLocation()

    const destination = location.state?.from?.pathname || '/'

    useEffect(() => {
        try {
            const raw = localStorage.getItem('workflowx_saved_credentials')
            if (raw) {
                const creds = JSON.parse(raw)
                // For security, purge any previously stored adminKey from localStorage
                if (creds.adminKey) {
                    delete creds.adminKey
                    localStorage.setItem('workflowx_saved_credentials', JSON.stringify(creds))
                }
                if (creds.email && creds.password) {
                    setSavedCreds(creds)
                }
            }
        } catch {
            // ignore JSON parse error
        }
    }, [])

    function handleEmailPlaceholderClick() {
        if (!email && savedCreds?.email) {
            setEmail(savedCreds.email)
            if (!password && savedCreds.password) {
                setPassword(savedCreds.password)
            }
            if (savedCreds.role === 'ADMIN') {
                setIsSigningInAsAdmin(true)
                // Do NOT auto-fill admin key; master admin key must be entered manually every time
            }
        }
    }

    function handlePasswordPlaceholderClick() {
        if (!password && savedCreds?.password) {
            setPassword(savedCreds.password)
        }
    }

    async function submit(event) {
        event.preventDefault()
        setError('')
        setIsSubmitting(true)

        try {
            await login({
                email,
                password,
                adminKey: isSigningInAsAdmin || adminKey ? adminKey.trim() : undefined,
                isAdminLogin: isSigningInAsAdmin,
            })

            const isAlreadySaved = savedCreds && savedCreds.email === email.trim() && savedCreds.password === password

            if (isAlreadySaved) {
                navigate(destination, { replace: true })
            } else {
                setPendingSaveModal({
                    email: email.trim(),
                    password,
                    role: isSigningInAsAdmin ? 'ADMIN' : undefined,
                })
            }
        } catch (requestError) {
            setError(requestError.message)
            if (requestError.message && requestError.message.toLowerCase().includes('admin secret key')) {
                setIsSigningInAsAdmin(true)
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    function handleConfirmSave() {
        if (pendingSaveModal) {
            localStorage.setItem(
                'workflowx_saved_credentials',
                JSON.stringify({
                    email: pendingSaveModal.email,
                    password: pendingSaveModal.password,
                    role: pendingSaveModal.role,
                    savedAt: new Date().toISOString(),
                })
            )
        }
        setPendingSaveModal(null)
        navigate(destination, { replace: true })
    }

    function handleDismissSave() {
        setPendingSaveModal(null)
        navigate(destination, { replace: true })
    }

    return (
        <main className="auth-page">
            <section className="auth-panel" style={{ maxWidth: '440px', width: '100%' }} aria-labelledby="login-title">
                <div className="brand auth-brand">
                    <span className="brand-mark">W</span>
                    <span>WorkFlow<span className="brand-accent">X</span></span>
                </div>

                <p className="eyebrow" style={{ color: '#ee785e', letterSpacing: '1.2px' }}>Secure Access</p>
                <h1 id="login-title">Welcome back</h1>
                <p className="auth-copy">Sign in to your account with your dedicated role email.</p>

                <form className="auth-form" onSubmit={submit}>
                    <label>
                        Email Address
                        <input
                            id="login-email-input"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            onClick={handleEmailPlaceholderClick}
                            onFocus={handleEmailPlaceholderClick}
                            autoComplete="email"
                            placeholder={savedCreds?.email || "name@company.com"}
                            required
                        />
                    </label>

                    <label style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Password</span>
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#6b7280',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    padding: 0,
                                }}
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>
                        <input
                            id="login-password-input"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            onClick={handlePasswordPlaceholderClick}
                            onFocus={handlePasswordPlaceholderClick}
                            autoComplete="current-password"
                            placeholder="••••••••••••"
                            required
                        />
                    </label>

                    {/* Admin Privileges Toggle */}
                    <div
                        id="login-admin-toggle-card"
                        style={{
                            margin: '8px 0 10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '9px 12px',
                            background: isSigningInAsAdmin ? '#fef2f2' : '#f8fafc',
                            border: isSigningInAsAdmin ? '1px solid #fecaca' : '1px solid #e2e8f0',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                        onClick={() => setIsSigningInAsAdmin(!isSigningInAsAdmin)}
                    >
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: 600, color: isSigningInAsAdmin ? '#991b1b' : '#475569' }}>
                            <input
                                id="login-admin-checkbox"
                                type="checkbox"
                                checked={isSigningInAsAdmin}
                                onChange={(e) => setIsSigningInAsAdmin(e.target.checked)}
                                onClick={(e) => e.stopPropagation()}
                                style={{ accentColor: '#dc2626', width: '15px', height: '15px', cursor: 'pointer' }}
                            />
                            <span>🛡️ Sign in as Administrator</span>
                        </label>
                        <span style={{ fontSize: '10.5px', color: isSigningInAsAdmin ? '#dc2626' : '#94a3b8', fontWeight: 600 }}>
                            {isSigningInAsAdmin ? 'Key Required' : 'Optional'}
                        </span>
                    </div>

                    {/* Master Admin Key (Required for Administrator signin) */}
                    {isSigningInAsAdmin && (
                        <div
                            id="login-admin-key-section"
                            style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                borderRadius: '8px',
                                padding: '12px 14px',
                                marginBottom: '14px',
                                animation: 'fadeIn 0.2s ease-out',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <label style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>🔒</span>
                                    <span>Master Admin Key (from .env)</span>
                                    <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setShowAdminKey(!showAdminKey)}
                                    style={{ background: 'none', border: 'none', color: '#991b1b', fontSize: '11px', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                                >
                                    {showAdminKey ? 'Hide' : 'Show'}
                                </button>
                            </div>
                            <input
                                id="login-admin-key-input"
                                name="master_admin_token"
                                type="text"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                data-lpignore="true"
                                data-form-type="other"
                                data-1p-ignore="true"
                                value={adminKey}
                                onChange={(event) => setAdminKey(event.target.value)}
                                placeholder="Enter ADMIN_SECRET_KEY"
                                required={isSigningInAsAdmin}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    fontSize: '13px',
                                    background: '#ffffff',
                                    border: '1px solid #f87171',
                                    borderRadius: '6px',
                                    color: '#7f1d1d',
                                    outline: 'none',
                                    WebkitTextSecurity: showAdminKey ? 'none' : 'disc',
                                }}
                            />
                            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#b91c1c', lineHeight: '1.4' }}>
                                🔒 Administrator access requires the secret <code>ADMIN_SECRET_KEY</code> configured in <code>.env</code>.
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="service-error" role="alert" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                            <span>⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}

                    <button id="login-submit-btn" className="primary-button auth-submit" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <span>Authenticating...</span>
                        ) : (
                            <>
                                <span>Sign In to Workspace</span>
                                <span style={{ fontSize: '15px' }}>➔</span>
                            </>
                        )}
                    </button>
                </form>

                <p className="auth-switch">
                    Need an account?{' '}
                    <Link to="/register">
                        Create an account & select role
                    </Link>
                </p>
            </section>

            {/* Save Credentials Popup Modal */}
            {pendingSaveModal && (
                <div
                    id="save-credentials-popup-overlay"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        padding: '16px',
                        animation: 'fadeIn 0.15s ease-out',
                    }}
                >
                    <div
                        id="save-credentials-popup"
                        style={{
                            background: '#ffffff',
                            borderRadius: '16px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                            maxWidth: '400px',
                            width: '100%',
                            padding: '24px',
                            textAlign: 'center',
                            border: '1px solid #e2e8f0',
                        }}
                    >
                        <div
                            style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '12px',
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '24px',
                                margin: '0 auto 16px',
                            }}
                        >
                            💾
                        </div>

                        <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                            Save Credentials?
                        </h3>

                        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                            Would you like to save credentials for <strong>{pendingSaveModal.email}</strong> on this device for faster sign-in?
                        </p>

                        <div
                            style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                padding: '10px 14px',
                                marginBottom: '20px',
                                textAlign: 'left',
                                fontSize: '12px',
                            }}
                        >
                            <div style={{ color: '#64748b', marginBottom: '2px' }}>Email:</div>
                            <div style={{ fontWeight: 600, color: '#1e293b' }}>{pendingSaveModal.email}</div>
                            <div style={{ color: '#64748b', marginTop: '6px', marginBottom: '2px' }}>Password:</div>
                            <div style={{ letterSpacing: '2px', color: '#475569' }}>••••••••••••</div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                id="save-credentials-dismiss-btn"
                                type="button"
                                onClick={handleDismissSave}
                                style={{
                                    flex: 1,
                                    padding: '10px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    background: '#ffffff',
                                    color: '#475569',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                Not Now
                            </button>
                            <button
                                id="save-credentials-confirm-btn"
                                type="button"
                                onClick={handleConfirmSave}
                                style={{
                                    flex: 1,
                                    padding: '10px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#16a34a',
                                    color: '#ffffff',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                Save Credentials
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}

export default LoginPage
