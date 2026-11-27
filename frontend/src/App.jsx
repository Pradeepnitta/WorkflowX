import { BrowserRouter, Navigate, Route, Routes, useOutletContext } from 'react-router-dom'
import AppLayout from './layouts/AppLayout.jsx'
import { ProtectedRoute, PublicRoute } from './routes/ProtectedRoute.jsx'
import DashboardOverviewPage from './pages/DashboardOverviewPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import TasksPage from './pages/TasksPage.jsx'
import ProjectsPage from './pages/ProjectsPage.jsx'
import TeamsPage from './pages/TeamsPage.jsx'
import OrganizationMembersPage from './pages/OrganizationMembersPage.jsx'
import AnalyticsPage from './pages/AnalyticsPage.jsx'
import InboxPage from './pages/InboxPage.jsx'
import SearchPage from './pages/SearchPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import SystemAdminPage from './pages/SystemAdminPage.jsx'
import ManagerDashboardPage from './pages/ManagerDashboardPage.jsx'
import DeveloperDashboardPage from './pages/DeveloperDashboardPage.jsx'
import './App.css'

function DashboardHomeRoute() {
    const { organization, organizationLoaded } = useOutletContext()

    if (!organizationLoaded) {
        return <main className="feature-page"><p className="loading-state">Loading your workspace…</p></main>
    }

    if (String(organization?.role || '').toUpperCase() === 'MANAGER') {
        return <Navigate to="/manager" replace />
    }

    return <DashboardOverviewPage />
}

function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Public Routes */}
                <Route
                    path="/login"
                    element={
                        <PublicRoute>
                            <LoginPage />
                        </PublicRoute>
                    }
                />
                <Route
                    path="/register"
                    element={
                        <PublicRoute>
                            <RegisterPage />
                        </PublicRoute>
                    }
                />

                {/* Protected SPA Application Shell Routes */}
                <Route element={<ProtectedRoute />}>
                    <Route element={<AppLayout />}>
                        <Route path="/" element={<DashboardHomeRoute />} />
                        <Route path="/manager" element={<ManagerDashboardPage />} />
                        <Route path="/manager/reviews" element={<ManagerDashboardPage view="reviews" />} />
                        <Route path="/developer" element={<DeveloperDashboardPage view="overview" />} />
                        <Route path="/developer/tasks" element={<DeveloperDashboardPage view="tasks" />} />
                        <Route path="/developer/projects" element={<DeveloperDashboardPage view="projects" />} />
                        <Route path="/developer/team" element={<DeveloperDashboardPage view="team" />} />
                        <Route path="/developer/submissions" element={<DeveloperDashboardPage view="submissions" />} />
                        <Route path="/developer/performance" element={<DeveloperDashboardPage view="performance" />} />
                        <Route path="/tasks" element={<TasksPage />} />
                        <Route path="/projects" element={<ProjectsPage />} />
                        <Route path="/teams" element={<TeamsPage />} />
                        <Route path="/members" element={<OrganizationMembersPage />} />
                        <Route path="/admin" element={<AdminPage />} />
                        <Route path="/system-admin" element={<SystemAdminPage />} />
                        <Route path="/analytics" element={<AnalyticsPage />} />
                        <Route path="/notifications" element={<InboxPage />} />
                        <Route path="/search" element={<SearchPage />} />
                        <Route path="/profile" element={<ProfilePage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                    </Route>
                </Route>

                {/* Catch-all Fallback Route */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App
