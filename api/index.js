import { createApp } from '../backend/src/app.js'

let app = null

function getApp() {
    if (!app) {
        app = createApp()
    }
    return app
}

export default async function handler(req, res) {
    const application = getApp()
    return application(req, res)
}
