export function createAuthController({ authService, sendJson, readBody }) {
    return {
        async sendOtp(request, response) {
            const input = await readBody(request)
            const result = await authService.sendOtp(input)
            sendJson(response, 200, { data: result })
        },

        async verifyOtp(request, response) {
            const input = await readBody(request)
            const result = await authService.verifyOtp(input)
            sendJson(response, 200, { data: result })
        },

        async register(request, response) {
            const input = await readBody(request)
            const result = await authService.register(input)
            sendJson(response, 201, { data: result })
        },

        async login(request, response) {
            const input = await readBody(request)
            const result = await authService.login(input)
            sendJson(response, 200, { data: result })
        },

        async refresh(request, response) {
            const input = await readBody(request)
            const result = await authService.refresh(input)
            sendJson(response, 200, { data: result })
        },

        async logout(request, response) {
            let input = {}
            try {
                input = (await readBody(request)) || {}
            } catch {
                input = {}
            }
            const result = await authService.logout(input)
            sendJson(response, 200, { data: result })
        },

        async me(request, response, user) {
            sendJson(response, 200, { data: { id: user.sub, email: user.email } })
        },

        async updateProfile(request, response, user) {
            const input = await readBody(request)
            const result = await authService.updateProfile(input, user.sub)
            sendJson(response, 200, { data: result })
        },
    }
}
