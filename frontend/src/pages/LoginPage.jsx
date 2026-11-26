import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { login } from '../services/authService.js'
import AuthShell from '../components/AuthShell.jsx'
import '../App.css'

function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [adminKey, setAdminKey] = useState('')
    const [isSystemAdminLogin, setIsSystemAdminLogin] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [showAdminKey, setShowAdminKey] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')
    const navigate = useNavigate()
    const location = useLocation()
    const destination = location.state?.from?.pathname || '/'

    useEffect(() => {
        try {
            localStorage.removeItem('workflowx_saved_credentials')
        } catch {
            // Browser storage may be unavailable.
        }
    }, [])

    async function submit(event) {
        event.preventDefault()
        setError('')
        setIsSubmitting(true)

        try {
            await login({
                email: email.trim(),
                password,
                isAdminLogin: isSystemAdminLogin,
                adminKey: isSystemAdminLogin ? adminKey.trim() : undefined,
            })
            navigate(destination, { replace: true })
        } catch (requestError) {
            const message = requestError.message || 'Unable to sign in. Please try again.'
            if (message.toLowerCase().includes('admin secret key')) {
                setIsSystemAdminLogin(true)
            }
            setError(message)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <AuthShell mode="login">
            <header className="auth-heading">
                <span className="auth-eyebrow">Workspace access</span>
                <h1 id="login-title">Welcome back</h1>
                <p>Sign in to pick up where your team left off.</p>
            </header>

            <form className="auth-form" onSubmit={submit} aria-labelledby="login-title">
                <label className="auth-field" htmlFor="login-email">
                    Email address
                    <input
                        id="login-email"
                        className="auth-control"
                        name="username"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="username"
                        placeholder="you@company.com"
                        required
                    />
                </label>

                <div className="auth-field">
                    <div className="auth-field-heading">
                        <label htmlFor="login-password">Password</label>
                        <button
                            className="auth-text-button"
                            type="button"
                            onClick={() => setShowPassword((visible) => !visible)}
                            aria-label={`${showPassword ? 'Hide' : 'Show'} password`}
                            aria-pressed={showPassword}
                        >
                            {showPassword ? 'Hide' : 'Show'}
                        </button>
                    </div>
                    <input
                        id="login-password"
                        className="auth-control"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        required
                    />
                </div>

                <div className="auth-admin-access">
                    <div className="auth-admin-access-heading">
                        <div>
                            <strong>System administrator?</strong>
                            <p>Global access uses a separate, protected sign-in.</p>
                        </div>
                        <button
                            className="auth-text-button"
                            type="button"
                            aria-expanded={isSystemAdminLogin}
                            aria-controls="system-admin-login-fields"
                            onClick={() => {
                                setIsSystemAdminLogin((isEnabled) => !isEnabled)
                                setError('')
                            }}
                        >
                            {isSystemAdminLogin ? 'Standard sign in' : 'System Admin'}
                        </button>
                    </div>

                    {isSystemAdminLogin && (
                        <div className="auth-admin-fields" id="system-admin-login-fields">
                            <div className="auth-field">
                                <div className="auth-field-heading">
                                    <label htmlFor="login-admin-key">System Admin key</label>
                                    <button
                                        className="auth-text-button"
                                        type="button"
                                        onClick={() => setShowAdminKey((visible) => !visible)}
                                        aria-label={`${showAdminKey ? 'Hide' : 'Show'} System Admin key`}
                                        aria-pressed={showAdminKey}
                                    >
                                        {showAdminKey ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                                <input
                                    id="login-admin-key"
                                    className="auth-control"
                                    name="system_admin_key"
                                    type={showAdminKey ? 'text' : 'password'}
                                    value={adminKey}
                                    onChange={(event) => setAdminKey(event.target.value)}
                                    autoComplete="off"
                                    placeholder="Enter your System Admin key"
                                    required={isSystemAdminLogin}
                                />
                            </div>
                            <p className="auth-admin-note">
                                Workspace Admins, Managers, and Members use standard sign in. This key is only for global System Admin accounts.
                            </p>
                        </div>
                    )}
                </div>

                {error && <div className="auth-alert" role="alert">{error}</div>}

                <button className="auth-submit" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Signing in...' : 'Sign in'}
                    {!isSubmitting && <span aria-hidden="true">→</span>}
                </button>
            </form>

            <p className="auth-switch">
                New to WorkflowX? <Link to="/register">Create an account</Link>
            </p>
        </AuthShell>
    )
}

export default LoginPage
