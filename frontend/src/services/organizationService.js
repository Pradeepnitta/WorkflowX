import { authenticatedRequest } from './authService.js'

export async function getOrganizations() {
    const data = await authenticatedRequest('/api/organizations')
    return Array.isArray(data) ? data : data?.data || []
}

export async function createOrganization(input) {
    const data = await authenticatedRequest('/api/organizations', {
        method: 'POST',
        body: JSON.stringify(input),
    })
    return data?.data || data
}

export async function getOrganizationMembers(organizationId) {
    if (!organizationId) return []
    const data = await authenticatedRequest(`/api/organizations/${organizationId}/members`)
    return Array.isArray(data) ? data : data?.data || []
}

export async function updateOrganizationMemberRole(organizationId, targetUserId, role) {
    const data = await authenticatedRequest(`/api/organizations/${organizationId}/members/${targetUserId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
    })
    return data?.data || data
}

export async function removeOrganizationMember(organizationId, targetUserId) {
    const data = await authenticatedRequest(`/api/organizations/${organizationId}/members/${targetUserId}`, {
        method: 'DELETE',
    })
    return data?.data || data
}

export async function inviteOrganizationMember(organizationId, { email, role }) {
    const data = await authenticatedRequest(`/api/organizations/${organizationId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
    })
    return data?.data || data
}

