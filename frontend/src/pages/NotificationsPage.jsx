import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotifications, markNotificationRead } from '../services/notificationService.js'
import '../App.css'

function NotificationsPage() {
    const navigate = useNavigate()
    const [notifications, setNotifications] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        getNotifications()
            .then(setNotifications)
            .catch((requestError) => setError(requestError.message))
            .finally(() => setIsLoading(false))
    }, [])

    async function markRead(notificationId) {
        try {
            await markNotificationRead(notificationId)
            setNotifications((current) => current.map((notification) => notification.id === notificationId ? { ...notification, isRead: true } : notification))
        } catch (requestError) {
            setError(requestError.message)
        }
    }

    return (
        <main className="feature-page">
            <div className="feature-heading"><div><p className="eyebrow">Workspace</p><h1>Notifications</h1><p className="heading-subtitle">Stay close to the work that needs you.</p></div></div>
            {error && <p className="service-error" role="alert">{error}</p>}
            <section className="notification-panel panel">
                {isLoading && <p className="loading-state">Loading notifications...</p>}
                {!isLoading && notifications.length === 0 && <p className="empty-column">You are all caught up.</p>}
                {notifications.map((notification) => (
                    <article
                        className={`notification-row ${notification.isRead ? 'read' : ''}`}
                        key={notification.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                            if (!notification.isRead) markRead(notification.id)
                            navigate('/tasks')
                        }}
                        title="Click to view in My tasks"
                    >
                        <div>
                            <span className="notification-type">{notification.type}</span>
                            <p>{notification.message}</p>
                            <small>{new Date(notification.createdAt).toLocaleString()}</small>
                        </div>
                        {!notification.isRead && (
                            <button
                                className="secondary-button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    markRead(notification.id)
                                }}
                            >
                                Mark read
                            </button>
                        )}
                    </article>
                ))}
            </section>
        </main>
    )
}

export default NotificationsPage
