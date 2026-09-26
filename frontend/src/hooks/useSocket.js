import { useEffect } from 'react'
import { getAccessToken } from '../services/authService.js'
import { connectSocket, disconnectSocket } from '../services/socketService.js'

export function useSocket() {
    useEffect(() => {
        const token = getAccessToken()
        if (token) {
            connectSocket(token)
        }
        return () => {
            disconnectSocket()
        }
    }, [])
}
