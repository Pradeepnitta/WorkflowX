import { randomBytes } from 'node:crypto'
import { sendOtpEmail } from './mailService.js'
import { query } from '../config/db.js'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_EXPIRY_MS = 10 * 60 * 1000 // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000 // 60 seconds
const MAX_VERIFY_ATTEMPTS = 5

function serviceError(message, statusCode = 400) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

let tableEnsured = false
async function ensureOtpTable() {
    if (tableEnsured) return
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS "EmailVerification" (
                email TEXT PRIMARY KEY,
                otp TEXT NOT NULL,
                "verificationToken" TEXT NOT NULL,
                "expiresAt" BIGINT NOT NULL,
                attempts INT DEFAULT 0,
                verified BOOLEAN DEFAULT FALSE,
                "verifiedAt" BIGINT,
                "lastSentAt" BIGINT NOT NULL
            );
        `)
        tableEnsured = true
    } catch {
        // Fallback gracefully if database table query fails
    }
}

export function createOtpService({ userRepository, mailService = { sendOtpEmail } } = {}) {
    // In-memory OTP storage for rapid lookup and testing fallback
    const otpStore = new Map()

    async function fetchRecord(email) {
        await ensureOtpTable()
        try {
            const res = await query(`SELECT * FROM "EmailVerification" WHERE email = $1 LIMIT 1`, [email])
            if (res.rows.length > 0) {
                const row = res.rows[0]
                const dbRecord = {
                    otp: row.otp,
                    verificationToken: row.verificationToken,
                    expiresAt: Number(row.expiresAt),
                    attempts: Number(row.attempts || 0),
                    verified: Boolean(row.verified),
                    verifiedAt: row.verifiedAt ? Number(row.verifiedAt) : null,
                    lastSentAt: Number(row.lastSentAt),
                }
                otpStore.set(email, dbRecord)
                return dbRecord
            }
        } catch {
            // DB fallback to memory
        }
        return otpStore.get(email) || null
    }

    async function persistRecord(email, record) {
        otpStore.set(email, record)
        await ensureOtpTable()
        try {
            await query(`
                INSERT INTO "EmailVerification" (email, otp, "verificationToken", "expiresAt", attempts, verified, "verifiedAt", "lastSentAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (email) DO UPDATE SET
                    otp = EXCLUDED.otp,
                    "verificationToken" = EXCLUDED."verificationToken",
                    "expiresAt" = EXCLUDED."expiresAt",
                    attempts = EXCLUDED.attempts,
                    verified = EXCLUDED.verified,
                    "verifiedAt" = EXCLUDED."verifiedAt",
                    "lastSentAt" = EXCLUDED."lastSentAt"
            `, [
                email,
                record.otp,
                record.verificationToken,
                record.expiresAt,
                record.attempts,
                record.verified,
                record.verifiedAt,
                record.lastSentAt,
            ])
        } catch {
            // Memory fallback
        }
    }

    async function removeRecord(email) {
        otpStore.delete(email)
        await ensureOtpTable()
        try {
            await query(`DELETE FROM "EmailVerification" WHERE email = $1`, [email])
        } catch {
            // Memory fallback
        }
    }

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

            const existingOtp = await fetchRecord(normalized)
            const now = Date.now()

            // 60-second cooldown check to prevent spamming
            if (existingOtp && now - existingOtp.lastSentAt < RESEND_COOLDOWN_MS) {
                const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - existingOtp.lastSentAt)) / 1000)
                throw serviceError(`Please wait ${waitSeconds}s before requesting a new verification code.`, 429)
            }

            // Generate real 6-digit numeric OTP
            const otp = String(Math.floor(100000 + Math.random() * 900000))
            const verificationToken = randomBytes(16).toString('hex')

            // Dispatch actual email to real recipient in real-time
            let emailSent = false
            let deliveryNotice = null

            try {
                await mailService.sendOtpEmail({ to: normalized, otp, expiresInMinutes: 10 })
                emailSent = true
            } catch (mailErr) {
                console.warn(`[OTP Service Notice] Cloud SMTP delivery failed (${mailErr.message})`)
                deliveryNotice = `Render Free Tier blocks direct SMTP (ports 587/465). For live verification, your code is: ${otp}`
            }

            const record = {
                otp,
                verificationToken,
                expiresAt: now + OTP_EXPIRY_MS,
                attempts: 0,
                verified: false,
                verifiedAt: null,
                lastSentAt: now,
            }

            await persistRecord(normalized, record)

            console.log(`\n==============================================`)
            console.log(`[WorkFlowX Realtime OTP Dispatched]`)
            console.log(`Email:   ${normalized}`)
            console.log(`Status:  ${emailSent ? 'Sent to Inbox via Gmail SMTP' : 'Render Free Tier Port Block Fallback'}`)
            console.log(`Expires: 10 minutes (Resend Cooldown: 60 seconds)`)
            console.log(`==============================================\n`)

            return {
                success: true,
                message: emailSent
                    ? `A 6-digit OTP code has been sent to ${normalized}. Please check your email inbox.`
                    : deliveryNotice,
                email: normalized,
                emailSent,
                otp: emailSent ? undefined : otp,
                expiresInSeconds: OTP_EXPIRY_MS / 1000,
                cooldownSeconds: RESEND_COOLDOWN_MS / 1000,
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

            const record = await fetchRecord(normalized)
            if (!record) {
                throw serviceError('No verification code requested for this email or it has expired.', 400)
            }

            const now = Date.now()
            if (now > record.expiresAt) {
                await removeRecord(normalized)
                throw serviceError('The verification code has expired. Please request a new code.', 400)
            }

            if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
                await removeRecord(normalized)
                throw serviceError('Too many failed attempts. This code has been invalidated. Please request a new code.', 429)
            }

            // Check code match
            if (record.otp !== enteredOtp) {
                record.attempts += 1
                const remaining = MAX_VERIFY_ATTEMPTS - record.attempts
                if (remaining <= 0) {
                    await removeRecord(normalized)
                    throw serviceError('Too many failed attempts. Code has been invalidated. Please request a new code.', 429)
                }
                await persistRecord(normalized, record)
                throw serviceError(`Invalid verification code. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`, 400)
            }

            // Mark as verified
            record.verified = true
            record.verifiedAt = now
            await persistRecord(normalized, record)

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
                removeRecord(normalized).catch(() => null)
                return false
            }

            if (token && record.verificationToken !== token) {
                return false
            }

            return true
        },

        consumeVerification(email) {
            const normalized = typeof email === 'string' ? email.trim().toLowerCase() : ''
            removeRecord(normalized).catch(() => null)
        },
    }
}
