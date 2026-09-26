import { authenticatedRequest } from './authService.js'

export async function getNotifications() {
    return authenticatedRequest('/api/notifications')
}

export async function markNotificationRead(notificationId) {
    return authenticatedRequest(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })
}
