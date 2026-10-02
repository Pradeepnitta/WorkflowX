const accessTokenKey = 'workflowx.accessToken'
const refreshTokenKey = 'workflowx.refreshToken'

const API_BASE = import.meta.env.VITE_API_URL || 
    (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' 
        ? 'https://workflowx-bcu9.onrender.com' 
        : '')

async function request(url, options = {}) {
    const targetUrl = url.startsWith('http') ? url : `${API_BASE}${url}`
    const response = await fetch(targetUrl, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers },
    })
    let payload = {}
    const text = await response.text()
    try {
        payload = text ? JSON.parse(text) : {}
    } catch {
        payload = { error: text || `HTTP ${response.status}: Server communication error` }
    }

    if (!response.ok) {
        const error = new Error(payload.error || `Request failed with status ${response.status}`)
        error.statusCode = response.status
        throw error
    }

    return payload.data
}

export async function sendOtp({ email, type = 'signup' }) {
    return request('/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email, type }),
    })
}

export async function verifyOtp({ email, otp }) {
    return request('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, otp }),
    })
}

export async function register(input) {
    const session = await request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
    })
    saveSession(session)
    return session
}

export async function login(input) {
    const session = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
    })
    saveSession(session)
    return session
}

export async function refresh() {
    const refreshToken = getRefreshToken()
    if (!refreshToken) throw new Error('No refresh token available')

    const session = await request('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
    })
    saveSession(session)
    return session
}

export async function logout() {
    const refreshToken = getRefreshToken()
    clearSession()

    if (refreshToken) {
        try {
            await request('/api/auth/logout', {
                method: 'POST',
                body: JSON.stringify({ refreshToken }),
            })
        } catch {
            // Silently ignore server error - client is already cleared
        }
    }
}

export function getCurrentUser() {
    return authenticatedRequest('/api/auth/me').then((me) => {
        try {
            const cached = JSON.parse(window.localStorage.getItem('workflowx_user') || '{}')
            return {
                ...cached,
                ...me,
                name: me.name || cached.name || (me.email ? me.email.split('@')[0] : 'User'),
            }
        } catch {
            return me
        }
    })
}

export async function updateProfile(input) {
    const updated = await authenticatedRequest('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(input),
    })
    try {
        const cached = JSON.parse(window.localStorage.getItem('workflowx_user') || '{}')
        window.localStorage.setItem('workflowx_user', JSON.stringify({ ...cached, ...updated }))
    } catch {
        // fallback
    }
    return updated
}

export function authenticatedRequest(url, options = {}) {
    return request(url, { ...options, headers: { ...withAccessToken(), ...options.headers } }).catch(async (error) => {
        if (error.statusCode !== 401 || url.startsWith('/api/auth/')) throw error

        try {
            await refresh()
            return request(url, { ...options, headers: { ...withAccessToken(), ...options.headers } })
        } catch {
            clearSession()
            throw error
        }
    })
}

export function getAccessToken() {
    try {
        return window.localStorage.getItem(accessTokenKey) || window.sessionStorage.getItem(accessTokenKey)
    } catch {
        return null
    }
}

function getRefreshToken() {
    try {
        return window.localStorage.getItem(refreshTokenKey) || window.sessionStorage.getItem(refreshTokenKey)
    } catch {
        return null
    }
}

function saveSession(session) {
    try {
        if (session.accessToken) {
            window.localStorage.setItem(accessTokenKey, session.accessToken)
            window.sessionStorage.setItem(accessTokenKey, session.accessToken)
        }
        if (session.refreshToken) {
            window.localStorage.setItem(refreshTokenKey, session.refreshToken)
            window.sessionStorage.setItem(refreshTokenKey, session.refreshToken)
        }
        if (session.user) {
            window.localStorage.setItem('workflowx_user', JSON.stringify(session.user))
        }
        // Purge any stale role keys from previous sessions
        window.localStorage.removeItem('workflowx_registered_role')
        window.sessionStorage.removeItem('workflowx_registered_role')
        window.localStorage.removeItem('workflowx_active_role')
        window.sessionStorage.removeItem('workflowx_active_role')
        window.dispatchEvent(new Event('auth-change'))
    } catch {
        // storage fallback
    }
}

export function clearSession() {
    try {
        window.localStorage.removeItem(accessTokenKey)
        window.sessionStorage.removeItem(accessTokenKey)
        window.localStorage.removeItem(refreshTokenKey)
        window.sessionStorage.removeItem(refreshTokenKey)
        window.localStorage.removeItem('workflowx_registered_role')
        window.sessionStorage.removeItem('workflowx_registered_role')
        window.localStorage.removeItem('workflowx_active_role')
        window.sessionStorage.removeItem('workflowx_active_role')
        window.localStorage.removeItem('workflowx_user')
        window.sessionStorage.removeItem('workflowx_user')
        window.localStorage.removeItem('workflowx_cached_tasks')
        window.sessionStorage.removeItem('workflowx_cached_tasks')
        window.dispatchEvent(new Event('auth-change'))
    } catch {
        // storage fallback
    }
}

function withAccessToken() {
    const accessToken = getAccessToken()
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
}

