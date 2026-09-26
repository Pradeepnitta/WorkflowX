function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

function presentTeam(team) {
    return {
        id: team.id,
        name: team.name,
        description: team.description || null,
        organizationId: team.organizationId,
        members: team.members ? team.members.map((m) => ({ userId: m.userId, user: m.user })) : [],
    }
}

export function createTeamService(teamRepository) {
    return {
        async create(input, userId) {
            const name = typeof input.name === 'string' ? input.name.trim() : ''
            const description = typeof input.description === 'string' ? input.description.trim() : null
            const organizationId = typeof input.organizationId === 'string' ? input.organizationId.trim() : ''
            const memberUserIds = Array.isArray(input.memberUserIds)
                ? input.memberUserIds.filter((id) => typeof id === 'string' && id.trim())
                : []

            if (name.length < 2) throw serviceError('Team name must be at least 2 characters', 400)
            if (!organizationId) throw serviceError('Organization is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            return presentTeam(await teamRepository.createForMember({ name, description, organizationId, userId, memberUserIds }))
        },

        async list(organizationId, userId) {
            if (!organizationId) throw serviceError('Organization is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            const teams = await teamRepository.findForMember({ organizationId, userId })
            return teams.map(presentTeam)
        },

        async addMember(teamId, memberUserId, userId) {
            if (!teamId || !memberUserId) throw serviceError('Team and member are required', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            await teamRepository.addMember({ teamId, userId, memberUserId })
            return { teamId, userId: memberUserId }
        },

        async removeMember(teamId, memberUserId, userId) {
            if (!teamId || !memberUserId) throw serviceError('Team and member are required', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            await teamRepository.removeMember({ teamId, userId, memberUserId })
            return { teamId, userId: memberUserId }
        },

        async removeTeam(teamId, userId) {
            if (!teamId) throw serviceError('Team is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            await teamRepository.deleteTeam({ teamId, userId })
            return { id: teamId, deleted: true }
        },
    }
}
