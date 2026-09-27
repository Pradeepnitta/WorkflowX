import { query } from '../config/db.js'

export const RoleHierarchy = {
    ADMIN: 4,
    MANAGER: 3,
    MEMBER: 2,
    VIEWER: 1,
}

export async function getUserOrgRole(organizationId, userId) {
    if (!organizationId || !userId) return null
    try {
        const res = await query(
            `SELECT role FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2 LIMIT 1`,
            [organizationId, userId]
        )
        return res.rows[0]?.role || null
    } catch {
        return null
    }
}

export function checkPermission(userRole, requiredRole) {
    if (!userRole) return false
    const userLevel = RoleHierarchy[userRole] || 0
    const requiredLevel = RoleHierarchy[requiredRole] || 0
    return userLevel >= requiredLevel
}

export async function authorizeOrgAction(organizationId, userId, requiredRole = 'MEMBER') {
    const role = await getUserOrgRole(organizationId, userId)
    if (!role) {
        const error = new Error('Forbidden: User is not a member of this organization')
        error.statusCode = 403
        throw error
    }
    if (!checkPermission(role, requiredRole)) {
        const error = new Error(`Forbidden: Action requires ${requiredRole} role or higher`)
        error.statusCode = 403
        throw error
    }
    return role
}
