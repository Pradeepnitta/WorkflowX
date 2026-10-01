// Vercel serverless entry point
// This file wraps the Express-compatible app for Vercel's Node runtime.

import { createApp } from '../src/app.js'

if (!process.env.AUTH_ACCESS_TOKEN_SECRET) {
    process.env.AUTH_ACCESS_TOKEN_SECRET = 'workflowx-development-access-token-secret-key-2026'
}
if (!process.env.ADMIN_SECRET_KEY) {
    process.env.ADMIN_SECRET_KEY = 'workflowx-admin-key-2026'
}

// createApp() returns a Node-compatible (req, res) => void handler
export default createApp()
