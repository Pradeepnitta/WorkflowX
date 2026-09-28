import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getAccessToken } from '../services/authService.js'

/**
 * ProtectedRoute — wraps authenticated sections of the app.
 * Redirects unauthenticated users to /login, preserving their intended destination.
 */
export function ProtectedRoute() {
    const [token, setToken] = useState(() => getAccessToken())
    const location = useLocation()

    useEffect(() => {
        function checkAuth() {
            setToken(getAccessToken())
        }
        window.addEventListener('auth-change', checkAuth)
        window.addEventListener('storage', checkAuth)
        return () => {
            window.removeEventListener('auth-change', checkAuth)
            window.removeEventListener('storage', checkAuth)
        }
    }, [])

    if (!token) {
        // Preserve the page they were trying to visit so login can redirect back
        return <Navigate to="/login" state={{ from: location }} replace />
    }

    return <Outlet key={token} />
}

/**
 * PublicRoute — wraps login/register pages.
 * If the user is already authenticated, redirect them to the app (or where they came from).
 * Prevents redirect loops: if the saved `from` is itself a public route, go to `/`.
 */
export function PublicRoute({ children }) {
    const [token, setToken] = useState(() => getAccessToken())
    const location = useLocation()

    useEffect(() => {
        function checkAuth() {
            setToken(getAccessToken())
        }
        window.addEventListener('auth-change', checkAuth)
        window.addEventListener('storage', checkAuth)
        return () => {
            window.removeEventListener('auth-change', checkAuth)
            window.removeEventListener('storage', checkAuth)
        }
    }, [])

    if (token) {
        // Avoid redirect loops: don't go back to /login or /register
        const from = location.state?.from?.pathname || '/'
        const isPublicPath = from === '/login' || from === '/register'
        const destination = isPublicPath ? '/' : from
        return <Navigate to={destination} replace />
    }

    return children
}
