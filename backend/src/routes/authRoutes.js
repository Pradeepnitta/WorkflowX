import { authenticateRequest } from '../middleware/authenticate.js'

export function registerAuthRoutes({ router, authController }) {
    router.post('/api/auth/send-otp', async (req, res) => {
        await authController.sendOtp(req, res)
    })
    router.post('/api/auth/verify-otp', async (req, res) => {
        await authController.verifyOtp(req, res)
    })
    router.post('/api/auth/register', async (req, res) => {
        await authController.register(req, res)
    })
    router.post('/api/auth/login', async (req, res) => {
        await authController.login(req, res)
    })
    router.post('/api/auth/refresh', async (req, res) => {
        await authController.refresh(req, res)
    })
    router.post('/api/auth/logout', async (req, res) => {
        await authController.logout(req, res)
    })
    router.get('/api/auth/me', async (req, res) => {
        const user = authenticateRequest(req)
        await authController.me(req, res, user)
    })
    router.patch('/api/auth/me', async (req, res) => {
        const user = authenticateRequest(req)
        await authController.updateProfile(req, res, user)
    })
}
