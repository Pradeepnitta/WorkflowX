import { io } from 'socket.io-client'

let socket = null

export function connectSocket(token) {
    const authToken = token || 'guest'
    if (socket && socket.connected) return socket
    if (socket) {
        socket.disconnect()
    }

    const backendUrl = import.meta.env.VITE_SOCKET_URL || 
        import.meta.env.VITE_API_URL || 
        (typeof window !== 'undefined' && window.location.hostname === 'localhost' 
            ? 'http://localhost:3001' 
            : 'https://workflowx-bcu9.onrender.com')

    socket = io(backendUrl, {
        auth: { token: authToken },
        transports: ['websocket', 'polling'],
        autoConnect: true,
    })

    return socket
}

export function getSocket() {
    return socket
}

export function joinRoom(roomName) {
    if (socket && roomName) {
        socket.emit('join:room', roomName)
    }
}

export function leaveRoom(roomName) {
    if (socket && roomName) {
        socket.emit('leave:room', roomName)
    }
}

export function disconnectSocket() {
    if (socket) {
        socket.disconnect()
        socket = null
    }
}
