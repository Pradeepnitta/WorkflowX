import { createApp } from '../backend/src/app.js'

if (!process.env.AUTH_ACCESS_TOKEN_SECRET) {
    process.env.AUTH_ACCESS_TOKEN_SECRET = 'workflowx-development-access-token-secret-key-2026'
}
if (!process.env.ADMIN_SECRET_KEY) {
    process.env.ADMIN_SECRET_KEY = 'workflowx-admin-key-2026'
}

let app = null

function getApp() {
    if (!app) {
        app = createApp()
    }
    return app
}

export default function handler(req, res) {
    const application = getApp()

    const matchedPath = req.headers['x-matched-path'] || req.headers['x-forwarded-url']
    if (matchedPath && !matchedPath.startsWith('/api/index') && !matchedPath.startsWith('/api/entry')) {
        req.url = matchedPath
    }

    return new Promise((resolve) => {
        const originalEnd = res.end.bind(res)
        res.end = (...args) => {
            originalEnd(...args)
            resolve()
        }
        application(req, res)
    })
}
