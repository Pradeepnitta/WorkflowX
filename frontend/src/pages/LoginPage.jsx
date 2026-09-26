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
    const [rememberMe, setRememberMe] = useState(true)
    const [hasSavedCredentials, setHasSavedCredentials] = useState(false)
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
                if (creds.email && creds.password) {
                    setEmail(creds.email)
                    setPassword(creds.password)
                    if (creds.role === 'ADMIN' || creds.adminKey) {
                        setIsSigningInAsAdmin(true)
                        if (creds.adminKey) setAdminKey(creds.adminKey)
                    }
                    setHasSavedCredentials(true)
                    setRememberMe(true)
                }
            }
        } catch {
            // ignore JSON parse error
        }
    }, [])

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

            // Update saved credentials if rememberMe is enabled
            if (rememberMe) {
                localStorage.setItem(
                    'workflowx_saved_credentials',
                    JSON.stringify({
                        email: email.trim(),
                        password,
                        adminKey: isSigningInAsAdmin && adminKey ? adminKey.trim() : '',
                        savedAt: new Date().toISOString(),
                    })
                )
            } else {
                localStorage.removeItem('workflowx_saved_credentials')
            }

            navigate(destination, { replace: true })
        } catch (requestError) {
            setError(requestError.message)
            if (requestError.message && requestError.message.toLowerCase().includes('admin secret key')) {
                setIsSigningInAsAdmin(true)
            }
        } finally {
            setIsSubmitting(false)
        }
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

                {hasSavedCredentials && (
                    <div
                        id="saved-creds-banner"
                        style={{
                            margin: '0 0 14px',
                            padding: '10px 14px',
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '12px',
                            color: '#166534',
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>💾</span>
                            <span>Auto-filled from saved credentials</span>
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                localStorage.removeItem('workflowx_saved_credentials')
                                setEmail('')
                                setPassword('')
                                setHasSavedCredentials(false)
                            }}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#dc2626',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '2px 4px',
                            }}
                            title="Remove saved credentials from this device"
                        >
                            Clear
                        </button>
                    </div>
                )}

                <form className="auth-form" onSubmit={submit}>
                    <label>
                        Email Address
                        <input
                            id="login-email-input"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                            placeholder="name@company.com"
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
                            autoComplete="current-password"
                            placeholder="••••••••••••"
                            required
                        />
                    </label>

                    {/* Remember / Save Credentials Option */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontSize: '12px', color: '#4b5563' }}>
                            <input
                                id="login-save-creds-checkbox"
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                style={{ accentColor: '#16a34a', width: '15px', height: '15px', cursor: 'pointer' }}
                            />
                            <span>💾 Save email and password</span>
                        </label>
                    </div>

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
                                type={showAdminKey ? 'text' : 'password'}
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
        </main>
    )
}

export default LoginPage
