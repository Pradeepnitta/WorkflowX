import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register, sendOtp, verifyOtp } from '../services/authService.js'
import { createOrganization } from '../services/organizationService.js'
import '../App.css'

const ROLES = [
    {
        key: 'ADMIN',
        title: 'Administrator',
        icon: '🛡️',
        desc: 'Full organization control, user invitations, role changes, and system settings.',
    },
    {
        key: 'MANAGER',
        title: 'Project Manager',
        icon: '💼',
        desc: 'Plan initiatives, create squads, assign tasks, and monitor delivery progress.',
    },
    {
        key: 'MEMBER',
        title: 'Developer / Member',
        icon: '💻',
        desc: 'Execute assigned tasks, update Signboard statuses, review deliverables, and comment.',
    },
    {
        key: 'VIEWER',
        title: 'Stakeholder / Viewer',
        icon: '👁️',
        desc: 'Read-only access to progress dashboards, project statuses, and timelines.',
    },
]

function RegisterPage() {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [pendingSaveModal, setPendingSaveModal] = useState(null)
    const [selectedRole, setSelectedRole] = useState('ADMIN')
    const [adminKey, setAdminKey] = useState('')
    const [showAdminKey, setShowAdminKey] = useState(false)
    const [workspaceName, setWorkspaceName] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')

    // Realtime Email OTP Verification States
    const [otpSent, setOtpSent] = useState(false)
    const [otpCode, setOtpCode] = useState('')
    const [fallbackOtp, setFallbackOtp] = useState('')
    const [otpNotice, setOtpNotice] = useState('')
    const [isSendingOtp, setIsSendingOtp] = useState(false)
    const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
    const [isEmailVerified, setIsEmailVerified] = useState(false)
    const [verificationToken, setVerificationToken] = useState('')
    const [otpCooldown, setOtpCooldown] = useState(0)
    const [otpError, setOtpError] = useState('')

    const navigate = useNavigate()

    // Realtime OTP Resend Cooldown Countdown
    useEffect(() => {
        if (otpCooldown <= 0) return
        const timer = setInterval(() => {
            setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0))
        }, 1000)
        return () => clearInterval(timer)
    }, [otpCooldown])

    function handleEmailChange(newEmail) {
        setEmail(newEmail)
        if (isEmailVerified || otpSent || otpCode || fallbackOtp) {
            setIsEmailVerified(false)
            setVerificationToken('')
            setOtpSent(false)
            setOtpCode('')
            setFallbackOtp('')
            setOtpNotice('')
            setOtpError('')
        }
    }

    async function handleSendOtp() {
        const trimmedEmail = email.trim()
        if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            setOtpError('Please enter a valid work email address first.')
            return
        }

        setOtpError('')
        setIsSendingOtp(true)
        setOtpCode('')
        setFallbackOtp('')
        setOtpNotice('')
        try {
            const res = await sendOtp({ email: trimmedEmail, type: 'signup' })
            setOtpSent(true)
            setOtpCooldown(res?.cooldownSeconds || 60)
            if (res?.message) {
                setOtpNotice(res.message)
            }
            if (res?.otp) {
                setFallbackOtp(res.otp)
            }
        } catch (err) {
            setOtpError(err.message || 'Failed to send OTP code. Please try again.')
        } finally {
            setIsSendingOtp(false)
        }
    }

    async function handleVerifyOtp(codeToVerify = otpCode) {
        const code = (codeToVerify || otpCode).trim()
        if (!code || code.length !== 6) {
            setOtpError('Please enter a valid 6-digit OTP verification code.')
            return
        }

        setOtpError('')
        setIsVerifyingOtp(true)
        try {
            const result = await verifyOtp({ email: email.trim(), otp: code })
            setIsEmailVerified(true)
            setVerificationToken(result.verificationToken || 'verified')
            setOtpError('')
        } catch (err) {
            setOtpError(err.message || 'Invalid or expired OTP code.')
        } finally {
            setIsVerifyingOtp(false)
        }
    }

    function handleOtpInput(event) {
        const val = event.target.value.replace(/\D/g, '').slice(0, 6)
        setOtpCode(val)
        setOtpError('')
        if (val.length === 6) {
            handleVerifyOtp(val)
        }
    }

    async function submit(event) {
        event.preventDefault()
        setError('')

        // Guard: Enforce Realtime Email Verification
        if (!isEmailVerified) {
            setError('Please verify your email address in real-time before completing registration.')
            if (!otpSent) {
                handleSendOtp()
            }
            return
        }

        setIsSubmitting(true)

        try {
            await register({
                name,
                email: email.trim(),
                password,
                role: selectedRole,
                adminKey: selectedRole === 'ADMIN' ? adminKey.trim() : undefined,
                otp: otpCode,
                verificationToken,
                requireOtpVerification: true,
            })

            // Create initial organization if name provided or defaulted
            const orgTitle = workspaceName.trim() || `${name.trim()}'s Workspace`
            try {
                await createOrganization({ name: orgTitle, description: `${selectedRole} Workspace`, role: selectedRole })
            } catch {
                // If org creation fails or already exists, proceed smoothly
            }

            // Save role preference in localStorage for client-side role presentation
            localStorage.setItem('workflowx_registered_role', selectedRole)

            // Trigger popup to ask user if they want to save credentials on this device (same as LoginPage)
            setPendingSaveModal({
                name: name.trim(),
                email: email.trim(),
                password,
                role: selectedRole,
            })
        } catch (requestError) {
            setError(requestError.message)
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
                    name: pendingSaveModal.name,
                    role: pendingSaveModal.role,
                    savedAt: new Date().toISOString(),
                })
            )

            // Native browser password store (if supported by environment)
            if (window.PasswordCredential && navigator.credentials?.store) {
                try {
                    const cred = new window.PasswordCredential({
                        id: pendingSaveModal.email,
                        password: pendingSaveModal.password,
                        name: pendingSaveModal.name,
                    })
                    navigator.credentials.store(cred).catch(() => null)
                } catch {
                    // ignore unsupported browser environments
                }
            }
        }
        setPendingSaveModal(null)
        navigate('/', { replace: true })
    }

    function handleDismissSave() {
        setPendingSaveModal(null)
        navigate('/', { replace: true })
    }

    return (
        <main className="auth-page" style={{ padding: '32px 16px' }}>
            <section className="auth-panel" style={{ maxWidth: '480px', width: '100%' }} aria-labelledby="register-title">
                <div className="brand auth-brand">
                    <span className="brand-mark">W</span>
                    <span>WorkFlow<span className="brand-accent">X</span></span>
                </div>
                <p className="eyebrow">Create a workspace account</p>
                <h1 id="register-title">Get started</h1>
                <p className="auth-copy">Choose your account role and start collaborating in WorkFlowX.</p>

                {/* Single Role Exclusivity Security Notice */}
                <div
                    id="single-role-policy-notice"
                    style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        marginBottom: '16px',
                        fontSize: '11px',
                        color: '#334155',
                        lineHeight: '1.5',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                    }}
                >
                    <span style={{ fontSize: '14px' }}>🔒</span>
                    <div>
                        <strong style={{ color: '#0f172a' }}>Single Role Policy:</strong> Each email is strictly dedicated to ONE role. Same email cannot hold multiple roles. To switch roles, sign out and sign up with a new dedicated email.
                    </div>
                </div>

                <form className="auth-form" onSubmit={submit}>
                    <label>
                        Full Name
                        <input
                            id="register-name-input"
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            autoComplete="name"
                            placeholder="Alex Morgan"
                            required
                        />
                    </label>

                    {/* Email Input & Realtime OTP Verification */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <label htmlFor="register-email-input" style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                                Work Email
                            </label>
                            {isEmailVerified && (
                                <span
                                    id="email-verified-pill"
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: '#15803d',
                                        background: '#dcfce7',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                    }}
                                >
                                    ✓ Email Verified
                                </span>
                            )}
                        </div>

                        <div style={{ position: 'relative' }}>
                            <input
                                id="register-email-input"
                                type="email"
                                value={email}
                                onChange={(event) => handleEmailChange(event.target.value)}
                                autoComplete="email"
                                placeholder="alex@company.com"
                                required
                                readOnly={isEmailVerified}
                                style={{
                                    width: '100%',
                                    borderColor: isEmailVerified ? '#22c55e' : undefined,
                                    backgroundColor: isEmailVerified ? '#f0fdf4' : undefined,
                                }}
                            />
                            {isEmailVerified && (
                                <button
                                    id="change-verified-email-btn"
                                    type="button"
                                    onClick={() => handleEmailChange(email)}
                                    style={{
                                        position: 'absolute',
                                        right: '10px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 'none',
                                        color: '#2563eb',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        padding: '4px',
                                    }}
                                >
                                    Change
                                </button>
                            )}
                        </div>

                        {/* Realtime OTP Verification Card */}
                        {!isEmailVerified ? (
                            <div
                                id="realtime-otp-container"
                                style={{
                                    marginTop: '8px',
                                    padding: '12px',
                                    background: otpSent ? '#f8fafc' : '#f0f9ff',
                                    border: otpSent ? '1px solid #cbd5e1' : '1px dashed #93c5fd',
                                    borderRadius: '8px',
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                {!otpSent ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                            <div style={{ fontSize: '11.5px', color: '#1e40af' }}>
                                                <span>⚡ Verify email in real-time</span>
                                            </div>
                                            <button
                                                id="send-otp-btn"
                                                type="button"
                                                disabled={isSendingOtp || !email.trim()}
                                                onClick={handleSendOtp}
                                                style={{
                                                    padding: '6px 14px',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    background: '#2563eb',
                                                    color: '#ffffff',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    cursor: isSendingOtp || !email.trim() ? 'not-allowed' : 'pointer',
                                                    opacity: isSendingOtp || !email.trim() ? 0.6 : 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                }}
                                            >
                                                {isSendingOtp ? 'Sending code...' : 'Send OTP'}
                                            </button>
                                        </div>
                                        {otpError && (
                                            <div id="otp-send-error-text" style={{ fontSize: '11.5px', color: '#b91c1c', background: '#fef2f2', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fecaca' }}>
                                                ⚠️ {otpError}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>
                                                Enter 6-digit OTP code
                                            </span>
                                            {otpCooldown > 0 ? (
                                                <span style={{ fontSize: '11px', color: '#64748b' }}>
                                                    Resend in {otpCooldown}s
                                                </span>
                                            ) : (
                                                <button
                                                    id="resend-otp-btn"
                                                    type="button"
                                                    onClick={handleSendOtp}
                                                    disabled={isSendingOtp}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#2563eb',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        padding: 0,
                                                    }}
                                                >
                                                    {isSendingOtp ? 'Sending...' : 'Resend OTP'}
                                                </button>
                                            )}
                                        </div>

                                        {fallbackOtp ? (
                                            <div style={{ fontSize: '12px', color: '#0369a1', background: '#f0f9ff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #bae6fd', lineHeight: 1.5 }}>
                                                <div>⚡ <strong>Cloud Direct Verification:</strong> Outbound SMTP is restricted on this cloud host.</div>
                                                <div style={{ marginTop: '4px' }}>
                                                    Your 6-digit code is: <strong style={{ letterSpacing: '2px', fontSize: '15px', color: '#0284c7', fontFamily: 'monospace' }}>{fallbackOtp}</strong>
                                                </div>
                                                <button
                                                    id="auto-fill-otp-btn"
                                                    type="button"
                                                    onClick={() => {
                                                        setOtpCode(fallbackOtp)
                                                        handleVerifyOtp(fallbackOtp)
                                                    }}
                                                    style={{
                                                        marginTop: '6px',
                                                        fontSize: '11px',
                                                        background: '#0284c7',
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        padding: '4px 10px',
                                                        cursor: 'pointer',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    ⚡ Auto-fill & Verify Code
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '11.5px', color: '#475569', background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', lineHeight: 1.4 }}>
                                                ✉️ We sent a 6-digit verification code to <strong>{email.trim()}</strong>. Please check your inbox and enter it below.
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input
                                                id="otp-code-input"
                                                type="text"
                                                inputMode="numeric"
                                                maxLength="6"
                                                value={otpCode}
                                                onChange={handleOtpInput}
                                                placeholder="6-digit OTP"
                                                autoFocus
                                                style={{
                                                    letterSpacing: '4px',
                                                    fontSize: '16px',
                                                    fontWeight: 700,
                                                    textAlign: 'center',
                                                    fontFamily: 'monospace',
                                                    flex: 1,
                                                    padding: '8px',
                                                }}
                                            />
                                            <button
                                                id="verify-otp-btn"
                                                type="button"
                                                disabled={isVerifyingOtp || otpCode.length !== 6}
                                                onClick={() => handleVerifyOtp(otpCode)}
                                                style={{
                                                    padding: '8px 16px',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    background: '#16a34a',
                                                    color: '#ffffff',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    cursor: isVerifyingOtp || otpCode.length !== 6 ? 'not-allowed' : 'pointer',
                                                    opacity: isVerifyingOtp || otpCode.length !== 6 ? 0.6 : 1,
                                                }}
                                            >
                                                {isVerifyingOtp ? 'Verifying...' : 'Verify'}
                                            </button>
                                        </div>

                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                            Check your inbox for the 6-digit code. Valid for 5 minutes.
                                        </div>

                                        {otpError && (
                                            <div id="otp-error-text" style={{ fontSize: '11.5px', color: '#dc2626' }}>
                                                ⚠️ {otpError}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div
                                id="realtime-otp-verified-banner"
                                style={{
                                    marginTop: '6px',
                                    padding: '8px 12px',
                                    background: '#f0fdf4',
                                    border: '1px solid #86efac',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '12px',
                                    color: '#15803d',
                                }}
                            >
                                <span>✅</span>
                                <span><b>Email verified in real-time!</b> You may now complete your registration.</span>
                            </div>
                        )}
                    </div>

                    <label style={{ marginTop: '8px' }}>
                        Password
                        <input
                            id="register-password-input"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="new-password"
                            placeholder="At least 8 characters"
                            minLength="8"
                            required
                        />
                    </label>

                    {/* Role Selection */}
                    <div style={{ marginTop: '4px' }}>
                        <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                            Select Account Role
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {ROLES.map((r) => {
                                const isSelected = selectedRole === r.key
                                return (
                                    <div
                                        key={r.key}
                                        id={`role-select-${r.key.toLowerCase()}`}
                                        onClick={() => setSelectedRole(r.key)}
                                        style={{
                                            border: isSelected ? '2px solid #2563eb' : '1px solid #d1d5db',
                                            background: isSelected ? '#eff6ff' : '#fff',
                                            borderRadius: '8px',
                                            padding: '10px',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                            <span style={{ fontSize: '14px' }}>{r.icon}</span>
                                            <strong style={{ fontSize: '12px', color: isSelected ? '#1d4ed8' : '#111827' }}>
                                                {r.title}
                                            </strong>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '10px', color: '#6b7280', lineHeight: '1.3' }}>
                                            {r.desc}
                                        </p>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Master Admin Key (Required only for Administrator signup) */}
                    {selectedRole === 'ADMIN' && (
                        <div
                            id="admin-key-section"
                            style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                borderRadius: '8px',
                                padding: '12px 14px',
                                marginTop: '10px',
                                animation: 'fadeIn 0.2s ease-out',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <label style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>🛡️</span>
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
                                id="register-admin-key-input"
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
                                required={selectedRole === 'ADMIN'}
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
                                🔒 Administrator signup requires the secret <code>ADMIN_SECRET_KEY</code> defined in the server's <code>.env</code> file.
                            </p>
                        </div>
                    )}

                    <label style={{ marginTop: '6px' }}>
                        Workspace / Organization Name (Optional)
                        <input
                            id="register-workspace-input"
                            type="text"
                            value={workspaceName}
                            onChange={(event) => setWorkspaceName(event.target.value)}
                            placeholder={name ? `${name}'s Workspace` : 'My Organization'}
                        />
                    </label>


                    {error && <p className="service-error" role="alert">{error}</p>}

                    <button
                        id="register-submit-btn"
                        className="primary-button auth-submit"
                        type="submit"
                        disabled={isSubmitting}
                        style={{
                            marginTop: '8px',
                            opacity: !isEmailVerified ? 0.85 : 1,
                        }}
                    >
                        {isSubmitting
                            ? 'Creating account...'
                            : !isEmailVerified
                                ? `Verify Email to Sign up as ${selectedRole}`
                                : `Sign up as ${selectedRole}`}
                    </button>
                </form>

                <p className="auth-switch" style={{ marginTop: '16px' }}>
                    Already have an account? <Link to="/login">Sign in</Link>
                </p>

                {/* Save Credentials Popup Modal (Same as LoginPage) */}
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
            </section>
        </main>
    )
}

export default RegisterPage
