import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getAccessToken } from '../services/authService.js'

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
        return <Navigate to="/login" state={{ from: location }} replace />
    }
    return <Outlet key={token} />
}

export function PublicRoute({ children }) {
    const [token, setToken] = useState(() => getAccessToken())

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
        return <Navigate to="/" replace />
    }
    return children
}
