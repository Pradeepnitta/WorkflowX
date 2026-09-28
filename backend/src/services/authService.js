import { hashPassword, verifyPassword } from '../utils/password.js'
import { createAccessToken } from '../utils/token.js'
import { createRefreshToken, hashRefreshToken } from '../utils/refreshToken.js'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const refreshTokenLifetimeMs = 30 * 24 * 60 * 60 * 1000

function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

function normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function validateCredentials(input) {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    const email = normalizeEmail(input.email)
    const password = typeof input.password === 'string' ? input.password : ''

    if (name.length < 2) throw serviceError('Name must be at least 2 characters', 400)
    if (!emailPattern.test(email)) throw serviceError('A valid email is required', 400)
    if (password.length < 8) throw serviceError('Password must be at least 8 characters', 400)

    return { name, email, password }
}

function publicUser(user) {
    return { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl || null }
}

export function createAuthService(userRepository, refreshTokenRepository, otpService) {
    async function createSession(user) {
        const session = { user: publicUser(user), accessToken: createAccessToken(user) }
        if (!refreshTokenRepository) return session

        const refreshToken = createRefreshToken()
        await refreshTokenRepository.create({
            tokenHash: hashRefreshToken(refreshToken),
            userId: user.id,
            expiresAt: new Date(Date.now() + refreshTokenLifetimeMs),
        })
        return { ...session, refreshToken }
    }

    return {
        async sendOtp(input) {
            if (!otpService) throw serviceError('OTP verification service is unavailable', 500)
            return otpService.sendOtp(input)
        },

        async verifyOtp(input) {
            if (!otpService) throw serviceError('OTP verification service is unavailable', 500)
            return otpService.verifyOtp(input)
        },

        async register(input) {
            const { name, email, password } = validateCredentials(input)
            const role = typeof input.role === 'string' ? input.role.trim().toUpperCase() : ''
            const adminKey = typeof input.adminKey === 'string' ? input.adminKey.trim() : ''

            // Enforce Realtime OTP Verification if OTP or verification token or flag is passed
            if (otpService && (input.otp || input.verificationToken || input.requireOtpVerification)) {
                if (input.otp) {
                    await otpService.verifyOtp({ email, otp: input.otp })
                } else if (!otpService.isEmailVerified(email, input.verificationToken)) {
                    throw serviceError('Email verification required: Please verify your email with the 6-digit OTP code before completing signup.', 400)
                }
            }

            if (role === 'ADMIN') {
                const expectedKey = process.env.ADMIN_SECRET_KEY || process.env.ADMIN_KEY || 'workflowx-admin-key-2026'
                if (!adminKey) {
                    throw serviceError('Admin Secret Key is required to create an Administrator account.', 403)
                }
                if (adminKey !== expectedKey) {
                    throw serviceError('Invalid Admin Secret Key. Administrator privileges denied.', 403)
                }
            }

            const existingUser = await userRepository.findByEmail(email)
            if (existingUser) throw serviceError('An account with that email already exists. Each email is strictly bound to a single role and cannot hold multiple roles. If you want to use a different role, please log out and sign up with a new dedicated email for that role.', 409)

            const user = await userRepository.create({
                name,
                email,
                passwordHash: await hashPassword(password),
            })

            if (otpService) {
                otpService.consumeVerification(email)
            }

            return createSession(user)
        },

        async login(input) {
            const email = normalizeEmail(input.email)
            const password = typeof input.password === 'string' ? input.password : ''
            const adminKey = typeof input.adminKey === 'string' ? input.adminKey.trim() : ''
            const isAdminLogin = Boolean(input.isAdminLogin || input.role === 'ADMIN')

            const user = await userRepository.findByEmail(email)
            if (!user || !(await verifyPassword(password, user.passwordHash))) {
                throw serviceError('Invalid email or password', 401)
            }

            const hasAdminMembership = user.memberships?.some((m) => m.role === 'ADMIN')
            const requiresAdminKey = isAdminLogin || hasAdminMembership || (input.adminKey !== undefined && input.adminKey !== '')

            if (requiresAdminKey) {
                const expectedKey = process.env.ADMIN_SECRET_KEY || process.env.ADMIN_KEY || 'workflowx-admin-key-2026'
                if (!adminKey) {
                    throw serviceError('Admin Secret Key is required for Administrator sign-in.', 403)
                }
                if (adminKey !== expectedKey) {
                    throw serviceError('Invalid Admin Secret Key. Administrator sign-in denied.', 403)
                }
            }

            return createSession(user)
        },

        async updateProfile(input, userId) {
            if (!userId) throw serviceError('Authentication required', 401)
            const changes = {}
            if (input.name !== undefined) {
                changes.name = typeof input.name === 'string' ? input.name.trim() : ''
                if (changes.name.length < 2) throw serviceError('Name must be at least 2 characters', 400)
            }
            if (input.avatarUrl !== undefined) {
                if (input.avatarUrl !== null && typeof input.avatarUrl !== 'string') throw serviceError('Avatar URL must be a string or null', 400)
                changes.avatarUrl = input.avatarUrl
            }
            if (input.newPassword !== undefined && input.newPassword.trim()) {
                if (typeof input.newPassword !== 'string' || input.newPassword.length < 8) {
                    throw serviceError('New password must be at least 8 characters', 400)
                }
                const existingUser = await userRepository.findById(userId)
                if (!existingUser) throw serviceError('User not found', 404)
                if (existingUser.passwordHash && input.currentPassword) {
                    const matches = await verifyPassword(input.currentPassword, existingUser.passwordHash)
                    if (!matches) throw serviceError('Current password is incorrect', 400)
                }
                changes.passwordHash = await hashPassword(input.newPassword)
            }
            if (Object.keys(changes).length === 0) throw serviceError('At least one profile field is required', 400)

            const user = await userRepository.updateProfile({ userId, ...changes })
            return publicUser(user)
        },

        async refresh(input) {
            if (!refreshTokenRepository || typeof input.refreshToken !== 'string') {
                throw serviceError('Refresh token is required', 400)
            }

            const tokenHash = hashRefreshToken(input.refreshToken)
            const storedToken = await refreshTokenRepository.findActiveByHash(tokenHash)
            if (!storedToken) throw serviceError('Invalid or expired refresh token', 401)

            await refreshTokenRepository.revoke(storedToken.id)
            return createSession(storedToken.user)
        },

        async logout(input) {
            if (refreshTokenRepository && typeof input.refreshToken === 'string' && input.refreshToken) {
                const storedToken = await refreshTokenRepository.findActiveByHash(hashRefreshToken(input.refreshToken))
                if (storedToken) await refreshTokenRepository.revoke(storedToken.id)
            }
            return { loggedOut: true }
        },
    }
}
