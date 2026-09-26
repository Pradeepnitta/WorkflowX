import nodemailer from 'nodemailer'

function reloadEnv() {
    try {
        process.loadEnvFile()
    } catch {}
    try {
        process.loadEnvFile('../.env')
    } catch {}
}

let cachedTransporter = null

async function getTransporter() {
    reloadEnv()

    const {
        SMTP_HOST,
        SMTP_PORT,
        SMTP_SECURE,
        SMTP_USER,
        SMTP_PASS,
        GMAIL_USER,
        GMAIL_APP_PASSWORD,
    } = process.env

    // 1. Direct Gmail SMTP Configuration
    if (GMAIL_USER && GMAIL_APP_PASSWORD) {
        const normalizedUser = GMAIL_USER.trim().includes('@') ? GMAIL_USER.trim() : `${GMAIL_USER.trim()}@gmail.com`
        const normalizedPass = GMAIL_APP_PASSWORD.replace(/\s+/g, '')

        if (!cachedTransporter || cachedTransporter._user !== normalizedUser || cachedTransporter._pass !== normalizedPass) {
            cachedTransporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 587,
                secure: false, // Use STARTTLS on port 587 for cloud compatibility
                requireTLS: true,
                family: 4, // Force IPv4 resolution to prevent ENETUNREACH on Render/Linux
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 15000,
                auth: {
                    user: normalizedUser,
                    pass: normalizedPass,
                },
                tls: {
                    rejectUnauthorized: false,
                },
            })
            cachedTransporter._user = normalizedUser
            cachedTransporter._pass = normalizedPass
            console.log(`[MailService] Configured with Gmail SMTP over port 587 IPv4 (${normalizedUser})`)
        }
        return cachedTransporter
    }

    // 2. Standard SMTP Configuration (SendGrid, Mailgun, Brevo, AWS SES, Resend, Custom)
    if (SMTP_HOST) {
        if (!cachedTransporter || cachedTransporter._host !== SMTP_HOST || cachedTransporter._pass !== SMTP_PASS) {
            cachedTransporter = nodemailer.createTransport({
                host: SMTP_HOST.trim(),
                port: Number(SMTP_PORT || 587),
                secure: SMTP_SECURE === 'true' || Number(SMTP_PORT) === 465,
                family: 4,
                auth: SMTP_USER && SMTP_PASS ? {
                    user: SMTP_USER.trim(),
                    pass: SMTP_PASS.trim(),
                } : undefined,
            })
            cachedTransporter._host = SMTP_HOST
            cachedTransporter._pass = SMTP_PASS
            console.log(`[MailService] Configured with SMTP host: ${SMTP_HOST}:${SMTP_PORT || 587}`)
        }
        return cachedTransporter
    }

    // If running in test runner without SMTP
    if (process.env.NODE_ENV === 'test') {
        cachedTransporter = nodemailer.createTransport({
            jsonTransport: true,
        })
        return cachedTransporter
    }

    // No SMTP credentials configured: fail explicitly so user knows credentials are required
    throw new Error(
        'Email sender not configured. Please add GMAIL_USER and GMAIL_APP_PASSWORD (or SMTP credentials) to your .env file to send real OTP emails.'
    )
}

export async function sendOtpEmail({ to, otp, expiresInMinutes = 5 }) {
    const transporter = await getTransporter()
    const fromAddress = process.env.EMAIL_FROM || process.env.GMAIL_USER || '"WorkFlowX Security" <noreply@workflowx.dev>'

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WorkFlowX Verification Code</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 24px 12px; margin: 0;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07);">
        <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 28px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">WorkFlow<span style="color: #38bdf8;">X</span></h1>
          <p style="color: #94a3b8; margin: 6px 0 0; font-size: 13px; font-weight: 500;">Real-Time Email Verification</p>
        </div>
        <div style="padding: 32px 28px;">
          <p style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 12px;">Hello,</p>
          <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
            Here is your 6-digit verification code to authenticate your email address in real-time. This OTP is valid for <strong>${expiresInMinutes} minutes</strong>.
          </p>
          <div style="text-align: center; margin: 28px 0; background: #f8fafc; border-radius: 8px; padding: 20px; border: 2px dashed #94a3b8;">
            <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0f172a; font-family: 'Courier New', Courier, monospace; display: inline-block;">
              ${otp}
            </span>
          </div>
          <p style="color: #64748b; font-size: 12.5px; line-height: 1.5; margin: 24px 0 0;">
            🔒 Security Notice: Never share this OTP code with anyone. WorkFlowX employees will never ask for your verification code.
          </p>
        </div>
        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; color: #94a3b8; font-size: 11.5px;">
          &copy; ${new Date().getFullYear()} WorkFlowX Platform. If you did not request this, please disregard this email.
        </div>
      </div>
    </body>
    </html>
    `

    // Option A: Resend API over HTTPS (Bypasses all cloud SMTP port blocking on Render)
    if (process.env.RESEND_API_KEY) {
        const from = process.env.MAIL_FROM || 'WorkFlowX <onboarding@resend.dev>'
        try {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.RESEND_API_KEY.trim()}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from,
                    to: [to],
                    subject: `Your WorkFlowX Verification Code: ${otp}`,
                    html: htmlContent,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || 'Resend delivery failed')
            console.log(`[MailService] Successfully dispatched via Resend HTTPS API (${data.id}) to ${to}`)
            return { success: true, messageId: data.id }
        } catch (err) {
            console.error('[MailService Error] Resend API failed:', err.message)
            throw new Error(`Resend email delivery failed: ${err.message}`)
        }
    }

    const transporter = await getTransporter()
    const fromAddress = process.env.MAIL_FROM || process.env.GMAIL_USER || 'no-reply@workflowx.local'

    const mailOptions = {
        from: fromAddress,
        to,
        subject: `Your WorkFlowX Verification Code: ${otp}`,
        text: `Your WorkFlowX verification code is: ${otp}\n\nThis OTP will expire in ${expiresInMinutes} minutes.\n\nIf you did not request this code, please ignore this email.`,
        html: htmlContent,
    }

    try {
        const info = await transporter.sendMail(mailOptions)

        console.log(`\n==============================================`)
        console.log(`[WorkFlowX Real Email Delivered]`)
        console.log(`To:          ${to}`)
        console.log(`Subject:     ${mailOptions.subject}`)
        console.log(`MessageId:   ${info.messageId}`)
        console.log(`==============================================\n`)

        return {
            success: true,
            messageId: info.messageId,
        }
    } catch (err) {
        console.error(`[MailService Error] Failed to send email to ${to}:`, err.message)
        const isTimeout = err.code === 'ETIMEDOUT' || err.message.toLowerCase().includes('timeout')
        if (isTimeout && process.env.NODE_ENV === 'production') {
            throw new Error(`Email delivery timed out. Cloud platforms (like Render Free Tier) block direct SMTP ports. To send emails from Render, add RESEND_API_KEY to your Render environment variables.`)
        }
        throw new Error(`Email delivery to ${to} failed: ${err.message}`)
    }
}
