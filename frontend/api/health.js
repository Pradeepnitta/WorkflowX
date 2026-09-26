import { createApp } from '../backend/src/app.js'

let app = null

function getApp() {
    if (!app) {
        app = createApp()
    }
    return app
}

export default function handler(req, res) {
    const application = getApp()
    return new Promise((resolve) => {
        const originalEnd = res.end.bind(res)
        res.end = (...args) => {
            originalEnd(...args)
            resolve()
        }
        application(req, res)
    })
}
