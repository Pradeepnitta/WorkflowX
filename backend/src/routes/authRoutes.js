import { authenticateRequest } from '../middleware/authenticate.js'

export function registerAuthRoutes({ router, authController }) {
    router.add('POST', '/api/auth/send-otp', (req, res) => authController.sendOtp(req, res))
    router.add('POST', '/api/auth/verify-otp', (req, res) => authController.verifyOtp(req, res))
    router.add('POST', '/api/auth/register', (req, res) => authController.register(req, res))
    router.add('POST', '/api/auth/login', (req, res) => authController.login(req, res))
    router.add('POST', '/api/auth/refresh', (req, res) => authController.refresh(req, res))
    router.add('POST', '/api/auth/logout', (req, res) => authController.logout(req, res))
    router.add('GET', '/api/auth/me', (req, res) => {
        const user = authenticateRequest(req)
        return authController.me(req, res, user)
    })
    router.add('PATCH', '/api/auth/me', (req, res) => {
        const user = authenticateRequest(req)
        return authController.updateProfile(req, res, user)
    })
}
