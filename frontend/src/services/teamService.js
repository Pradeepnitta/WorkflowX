import { authenticatedRequest } from './authService.js'

export async function getTeams(organizationId) {
    if (!organizationId) return []
    const params = new URLSearchParams({ organizationId })
    const data = await authenticatedRequest(`/api/teams?${params}`)
    return Array.isArray(data) ? data : data?.data || []
}

export async function createTeam(input) {
    const data = await authenticatedRequest('/api/teams', {
        method: 'POST',
        body: JSON.stringify(input),
    })
    return data?.data || data
}

export async function addTeamMember(teamId, userId) {
    const data = await authenticatedRequest(`/api/teams/${teamId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
    })
    return data?.data || data
}

export async function removeTeamMember(teamId, userId) {
    const data = await authenticatedRequest(`/api/teams/${teamId}/members/${userId}`, {
        method: 'DELETE',
    })
    return data?.data || data
}

export async function deleteTeam(teamId) {
    const data = await authenticatedRequest(`/api/teams/${teamId}`, {
        method: 'DELETE',
    })
    return data?.data || data
}


