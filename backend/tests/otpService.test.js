import test from 'node:test'
import assert from 'node:assert/strict'
import { createOtpService } from '../src/services/otpService.js'

test('otpService generates, sends via mailService, and verifies user-entered 6-digit OTP code', async () => {
    let deliveredOtp = null
    const mailService = {
        async sendOtpEmail({ to, otp }) {
            deliveredOtp = otp
            return { success: true, messageId: 'msg-123' }
        },
    }
    const userRepository = {
        async findByEmail() {
            return null
        },
    }
    const otpService = createOtpService({ userRepository, mailService })

    const sendRes = await otpService.sendOtp({ email: 'test@example.com', type: 'signup' })
    assert.equal(sendRes.email, 'test@example.com')
    assert.equal(typeof deliveredOtp, 'string')
    assert.equal(deliveredOtp.length, 6)

    // Verify OTP with user-entered code
    const verifyRes = await otpService.verifyOtp({ email: 'test@example.com', otp: deliveredOtp })
    assert.equal(verifyRes.verified, true)
    assert.ok(verifyRes.verificationToken)
    assert.equal(otpService.isEmailVerified('test@example.com', verifyRes.verificationToken), true)

    // Consume verification
    otpService.consumeVerification('test@example.com')
    assert.equal(otpService.isEmailVerified('test@example.com', verifyRes.verificationToken), false)
})

test('otpService rejects invalid and expired OTP codes', async () => {
    const mailService = {
        async sendOtpEmail() {
            return { success: true }
        },
    }
    const userRepository = {
        async findByEmail() {
            return null
        },
    }
    const otpService = createOtpService({ userRepository, mailService })

    await otpService.sendOtp({ email: 'test2@example.com', type: 'signup' })

    await assert.rejects(
        () => otpService.verifyOtp({ email: 'test2@example.com', otp: '999999' }),
        /Invalid verification code/
    )
})

test('otpService rejects signup OTP for already registered email', async () => {
    const mailService = {
        async sendOtpEmail() {
            return { success: true }
        },
    }
    const userRepository = {
        async findByEmail(email) {
            if (email === 'taken@example.com') return { id: 'u1', email }
            return null
        },
    }
    const otpService = createOtpService({ userRepository, mailService })

    await assert.rejects(
        () => otpService.sendOtp({ email: 'taken@example.com', type: 'signup' }),
        /An account with this email already exists/
    )
})
