import { randomBytes } from 'node:crypto'
import { sendOtpEmail } from './mailService.js'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes
const RESEND_COOLDOWN_MS = 15 * 1000 // 15 seconds
const MAX_VERIFY_ATTEMPTS = 5

function serviceError(message, statusCode = 400) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

export function createOtpService({ userRepository, mailService = { sendOtpEmail } } = {}) {
    // In-memory OTP storage keyed by normalized email
    const otpStore = new Map()

    return {
        async sendOtp({ email, type = 'SIGNUP' }) {
            const normalized = typeof email === 'string' ? email.trim().toLowerCase() : ''
            const normalizedType = typeof type === 'string' ? type.trim().toUpperCase() : 'SIGNUP'
            if (!normalized || !emailPattern.test(normalized)) {
                throw serviceError('Please provide a valid email address.', 400)
            }

            // If signup, check if email is already taken
            if (normalizedType === 'SIGNUP' && userRepository) {
                const existing = await userRepository.findByEmail(normalized)
                if (existing) {
                    throw serviceError('An account with this email already exists. Each email is strictly bound to a single role.', 409)
                }
            }

            const existingOtp = otpStore.get(normalized)
            const now = Date.now()

            // Cooldown check to prevent spamming
            if (existingOtp && now - existingOtp.lastSentAt < RESEND_COOLDOWN_MS) {
                const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - existingOtp.lastSentAt)) / 1000)
                throw serviceError(`Please wait ${waitSeconds}s before requesting a new verification code.`, 429)
            }

            // Generate real 6-digit numeric OTP
            const otp = String(Math.floor(100000 + Math.random() * 900000))
            const verificationToken = randomBytes(16).toString('hex')

            // Dispatch actual email to real recipient in real-time
            try {
                await mailService.sendOtpEmail({ to: normalized, otp, expiresInMinutes: 5 })
            } catch (mailErr) {
                throw serviceError(
                    mailErr.message || `Unable to send OTP to ${normalized}. Please check server email delivery settings.`,
                    400
                )
            }

            otpStore.set(normalized, {
                otp,
                verificationToken,
                expiresAt: now + OTP_EXPIRY_MS,
                attempts: 0,
                verified: false,
                verifiedAt: null,
                lastSentAt: now,
            })

            console.log(`\n==============================================`)
            console.log(`[WorkFlowX Realtime OTP Dispatched]`)
            console.log(`Email:   ${normalized}`)
            console.log(`Expires: 5 minutes`)
            console.log(`==============================================\n`)

            return {
                success: true,
                message: `A 6-digit OTP code has been sent to ${normalized}. Please check your email inbox.`,
                email: normalized,
                expiresInSeconds: OTP_EXPIRY_MS / 1000,
            }
        },

        async verifyOtp({ email, otp }) {
            const normalized = typeof email === 'string' ? email.trim().toLowerCase() : ''
            const enteredOtp = typeof otp === 'string' ? otp.trim() : ''

            if (!normalized || !emailPattern.test(normalized)) {
                throw serviceError('A valid email address is required.', 400)
            }
            if (!enteredOtp || enteredOtp.length !== 6) {
                throw serviceError('Please provide a valid 6-digit verification code.', 400)
            }

            const record = otpStore.get(normalized)
            if (!record) {
                throw serviceError('No verification code requested for this email or it has expired.', 400)
            }

            const now = Date.now()
            if (now > record.expiresAt) {
                otpStore.delete(normalized)
                throw serviceError('The verification code has expired. Please request a new code.', 400)
            }

            if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
                otpStore.delete(normalized)
                throw serviceError('Too many failed attempts. This code has been invalidated. Please request a new code.', 429)
            }

            // Check code match
            if (record.otp !== enteredOtp) {
                record.attempts += 1
                const remaining = MAX_VERIFY_ATTEMPTS - record.attempts
                if (remaining <= 0) {
                    otpStore.delete(normalized)
                    throw serviceError('Too many failed attempts. Code has been invalidated. Please request a new code.', 429)
                }
                throw serviceError(`Invalid verification code. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`, 400)
            }

            // Mark as verified
            record.verified = true
            record.verifiedAt = now

            return {
                success: true,
                verified: true,
                email: normalized,
                verificationToken: record.verificationToken,
                message: 'Email address verified successfully!',
            }
        },

        isEmailVerified(email, token) {
            const normalized = typeof email === 'string' ? email.trim().toLowerCase() : ''
            const record = otpStore.get(normalized)
            if (!record || !record.verified) return false

            // Verification valid for 15 minutes after verification
            if (Date.now() - record.verifiedAt > 15 * 60 * 1000) {
                otpStore.delete(normalized)
                return false
            }

            if (token && record.verificationToken !== token) {
                return false
            }

            return true
        },

        consumeVerification(email) {
            const normalized = typeof email === 'string' ? email.trim().toLowerCase() : ''
            otpStore.delete(normalized)
        },
    }
}
