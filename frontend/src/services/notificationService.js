import { authenticatedRequest } from './authService.js'

export async function getNotifications() {
    return authenticatedRequest('/api/notifications')
}

export async function markNotificationRead(notificationId) {
    return authenticatedRequest(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })
}

export async function markAllNotificationsRead() {
    return authenticatedRequest('/api/notifications/read-all', { method: 'PATCH' })
}

export async function deleteNotification(notificationId) {
    return authenticatedRequest(`/api/notifications/${notificationId}`, { method: 'DELETE' })
}

export async function clearAllNotifications() {
    return authenticatedRequest('/api/notifications', { method: 'DELETE' })
}
