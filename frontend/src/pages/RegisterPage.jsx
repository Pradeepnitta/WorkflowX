import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register, sendOtp, verifyOtp } from '../services/authService.js'
import { createOrganization } from '../services/organizationService.js'
import AuthShell from '../components/AuthShell.jsx'
import '../App.css'

const WORKSPACE_ROLES = [
    {
        key: 'MANAGER',
        mark: 'M',
        title: 'Manager',
        description: 'Coordinate assigned teams, projects, and task reviews.',
    },
    {
        key: 'MEMBER',
        mark: 'D',
        title: 'Developer',
        description: 'Work on assigned tasks, share updates, and submit for review.',
    },
    {
        key: 'VIEWER',
        mark: 'V',
        title: 'Viewer',
        description: 'Follow project progress with read-only workspace access.',
    },
]

function RegisterPage() {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [workspaceName, setWorkspaceName] = useState('')
    const [selectedRole, setSelectedRole] = useState('MEMBER')
    const [isSystemAdminSignup, setIsSystemAdminSignup] = useState(false)
    const [adminKey, setAdminKey] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showAdminKey, setShowAdminKey] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')

    const [otpSent, setOtpSent] = useState(false)
    const [otpCode, setOtpCode] = useState('')
    const [isSendingOtp, setIsSendingOtp] = useState(false)
    const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
    const [isEmailVerified, setIsEmailVerified] = useState(false)
    const [verificationToken, setVerificationToken] = useState('')
    const [otpCooldown, setOtpCooldown] = useState(0)
    const [otpError, setOtpError] = useState('')
    const [accountAlreadyExists, setAccountAlreadyExists] = useState(false)
    const navigate = useNavigate()

    useEffect(() => {
        try {
            localStorage.removeItem('workflowx_saved_credentials')
        } catch {
            // Browser storage may be unavailable.
        }
    }, [])

    useEffect(() => {
        if (otpCooldown <= 0) return undefined
        const timer = window.setTimeout(() => setOtpCooldown((remaining) => remaining - 1), 1000)
        return () => window.clearTimeout(timer)
    }, [otpCooldown])

    function handleEmailChange(value) {
        setEmail(value)
        setIsEmailVerified(false)
        setVerificationToken('')
        setOtpSent(false)
        setOtpCode('')
        setOtpCooldown(0)
        setOtpError('')
        setAccountAlreadyExists(false)
    }

    async function handleSendOtp() {
        const trimmedEmail = email.trim()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            setOtpError('Enter a valid email address before requesting a code.')
            return
        }

        setOtpError('')
        setAccountAlreadyExists(false)
        setIsSendingOtp(true)
        try {
            await sendOtp({ email: trimmedEmail, type: 'signup' })
            setOtpSent(true)
            setOtpCode('')
            setOtpCooldown(60)
        } catch (requestError) {
            const alreadyExists = requestError.statusCode === 409
            setAccountAlreadyExists(alreadyExists)
            setOtpError(
                alreadyExists
                    ? 'An account already uses this email.'
                    : requestError.message || 'We could not send a verification code. Please try again.'
            )
        } finally {
            setIsSendingOtp(false)
        }
    }

    async function handleVerifyOtp(codeToVerify = otpCode) {
        const code = codeToVerify.trim()
        if (!/^\d{6}$/.test(code)) {
            setOtpError('Enter the six-digit code from your email.')
            return
        }

        setOtpError('')
        setIsVerifyingOtp(true)
        try {
            const result = await verifyOtp({ email: email.trim(), otp: code })
            setIsEmailVerified(true)
            setVerificationToken(result?.verificationToken || 'verified')
        } catch (requestError) {
            setOtpError(requestError.message || 'That code is invalid or has expired.')
        } finally {
            setIsVerifyingOtp(false)
        }
    }

    function handleOtpInput(event) {
        const code = event.target.value.replace(/\D/g, '').slice(0, 6)
        setOtpCode(code)
        setOtpError('')
        if (code.length === 6) void handleVerifyOtp(code)
    }

    async function submit(event) {
        event.preventDefault()
        setError('')
        if (!isEmailVerified) {
            setError('Verify your email address before creating an account.')
            return
        }

        const accountRole = isSystemAdminSignup ? 'ADMIN' : selectedRole
        const workspaceRole = isSystemAdminSignup ? 'ADMIN' : selectedRole
        setIsSubmitting(true)

        try {
            await register({
                name,
                email: email.trim(),
                password,
                role: accountRole,
                adminKey: isSystemAdminSignup ? adminKey.trim() : undefined,
                otp: otpCode,
                verificationToken,
                requireOtpVerification: true,
            })

            const organizationName = workspaceName.trim() || `${name.trim()}'s Workspace`
            await createOrganization({
                name: organizationName,
                description: `${accountRole} workspace`,
                role: workspaceRole,
            })
            navigate('/', { replace: true })
        } catch (requestError) {
            setError(requestError.message || 'We could not complete registration. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <AuthShell mode="register">
            <header className="auth-heading">
                <span className="auth-eyebrow">Create your workspace</span>
                <h1 id="register-title">Make room for great work</h1>
                <p>Set up your account and choose how you’ll contribute.</p>
            </header>

            <form className="auth-form" onSubmit={submit} aria-labelledby="register-title">
                <label className="auth-field" htmlFor="register-name">
                    Full name
                    <input
                        id="register-name"
                        className="auth-control"
                        name="name"
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        autoComplete="name"
                        placeholder="Your name"
                        minLength={2}
                        required
                    />
                </label>

                <div className="auth-field">
                    <div className="auth-field-heading">
                        <label htmlFor="register-email">Work email</label>
                        {isEmailVerified && <span className="auth-verified-pill">Verified</span>}
                    </div>
                    <input
                        id="register-email"
                        className="auth-control"
                        name="email"
                        type="email"
                        value={email}
                        onChange={(event) => handleEmailChange(event.target.value)}
                        autoComplete="email"
                        placeholder="you@company.com"
                        readOnly={isEmailVerified}
                        required
                    />

                    {!isEmailVerified && (
                        <div className="auth-otp">
                            {!otpSent ? (
                                <div className="auth-otp-start">
                                    <p>Verify your email to protect your new account.</p>
                                    <button
                                        className="auth-secondary-button"
                                        type="button"
                                        onClick={handleSendOtp}
                                        disabled={isSendingOtp || !email.trim()}
                                    >
                                        {isSendingOtp ? 'Sending code...' : 'Send verification code'}
                                    </button>
                                </div>
                            ) : (
                                <div className="auth-otp-enter">
                                    <div className="auth-otp-heading">
                                        <span>Enter the 6-digit code sent to your inbox.</span>
                                        {otpCooldown > 0 ? (
                                            <span className="auth-muted">Resend in {otpCooldown}s</span>
                                        ) : (
                                            <button
                                                className="auth-text-button"
                                                type="button"
                                                onClick={handleSendOtp}
                                                disabled={isSendingOtp}
                                            >
                                                {isSendingOtp ? 'Sending...' : 'Resend'}
                                            </button>
                                        )}
                                    </div>
                                    <div className="auth-otp-controls">
                                        <input
                                            id="register-otp"
                                            className="auth-control auth-otp-input"
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={6}
                                            value={otpCode}
                                            onChange={handleOtpInput}
                                            placeholder="000000"
                                            aria-label="Six-digit email verification code"
                                            disabled={isVerifyingOtp}
                                        />
                                        <button
                                            className="auth-secondary-button"
                                            type="button"
                                            onClick={() => void handleVerifyOtp()}
                                            disabled={isVerifyingOtp || otpCode.length !== 6}
                                        >
                                            {isVerifyingOtp ? 'Verifying...' : 'Verify'}
                                        </button>
                                    </div>
                                </div>
                            )}
                            {otpError && (
                                <p className="auth-inline-alert" role="alert">
                                    {otpError}
                                    {accountAlreadyExists && <> <Link to="/login">Sign in instead</Link></>}
                                </p>
                            )}
                        </div>
                    )}

                    {isEmailVerified && (
                        <div className="auth-verified-banner">
                            <span aria-hidden="true">✓</span>
                            <span>Email verified. You can continue.</span>
                            <button
                                className="auth-text-button"
                                type="button"
                                onClick={() => handleEmailChange(email)}
                            >
                                Change
                            </button>
                        </div>
                    )}
                </div>

                <div className="auth-field">
                    <div className="auth-field-heading">
                        <label htmlFor="register-password">Password</label>
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
                        id="register-password"
                        className="auth-control"
                        name="new-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        minLength={8}
                        required
                    />
                </div>

                {isSystemAdminSignup ? (
                    <div className="auth-system-admin-card">
                        <div className="auth-system-admin-title">
                            <span className="auth-role-mark auth-role-mark-admin">S</span>
                            <div>
                                <strong>System Administrator setup</strong>
                                <p>One-time bootstrap for global application access.</p>
                            </div>
                        </div>
                        <div className="auth-field">
                            <div className="auth-field-heading">
                                <label htmlFor="register-admin-key">System Admin key</label>
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
                                id="register-admin-key"
                                className="auth-control"
                                name="system-admin-key"
                                type={showAdminKey ? 'text' : 'password'}
                                value={adminKey}
                                onChange={(event) => setAdminKey(event.target.value)}
                                autoComplete="off"
                                placeholder="Enter your System Admin key"
                                required
                            />
                        </div>
                        <p className="auth-admin-note">
                            System Admins have global control. Workspace Admin access is assigned separately and does not require this key.
                        </p>
                    </div>
                ) : (
                    <fieldset className="auth-role-fieldset">
                        <legend>Choose your workspace role</legend>
                        <div className="auth-role-grid">
                            {WORKSPACE_ROLES.map((role) => (
                                <button
                                    key={role.key}
                                    className={`auth-role-card${selectedRole === role.key ? ' is-selected' : ''}`}
                                    type="button"
                                    aria-pressed={selectedRole === role.key}
                                    onClick={() => setSelectedRole(role.key)}
                                >
                                    <span className="auth-role-mark">{role.mark}</span>
                                    <span className="auth-role-title">{role.title}</span>
                                    <span className="auth-role-description">{role.description}</span>
                                </button>
                            ))}
                        </div>
                        <p className="auth-role-note">
                            Workspace Admin access is assigned within a workspace. It is separate from global System Admin access.
                        </p>
                    </fieldset>
                )}

                <div className={`auth-bootstrap${isSystemAdminSignup ? ' is-active' : ''}`}>
                    <div>
                        <strong>Setting up the first System Admin?</strong>
                        <p>This restricted account type is separate from workspace roles.</p>
                    </div>
                    <button
                        className="auth-text-button"
                        type="button"
                        aria-expanded={isSystemAdminSignup}
                        onClick={() => {
                            setIsSystemAdminSignup((enabled) => !enabled)
                            setError('')
                        }}
                    >
                        {isSystemAdminSignup ? 'Use workspace role' : 'Set up System Admin'}
                    </button>
                </div>

                <label className="auth-field" htmlFor="register-workspace">
                    Workspace name <span className="auth-muted">(optional)</span>
                    <input
                        id="register-workspace"
                        className="auth-control"
                        name="organization"
                        type="text"
                        value={workspaceName}
                        onChange={(event) => setWorkspaceName(event.target.value)}
                        placeholder={name ? `${name}'s workspace` : 'Your team workspace'}
                    />
                </label>

                {error && <div className="auth-alert" role="alert">{error}</div>}

                <button
                    className="auth-submit"
                    type="submit"
                    disabled={isSubmitting || !isEmailVerified}
                >
                    {isSubmitting ? 'Creating account...' : 'Create account'}
                    {!isSubmitting && <span aria-hidden="true">→</span>}
                </button>
                {!isEmailVerified && (
                    <p className="auth-submit-hint">Verify your email to enable account creation.</p>
                )}
            </form>

            <p className="auth-switch">
                Already have an account? <Link to="/login">Sign in</Link>
            </p>
        </AuthShell>
    )
}

export default RegisterPage
