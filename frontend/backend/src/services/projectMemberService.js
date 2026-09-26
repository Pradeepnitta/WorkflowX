function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

function presentMember(member) {
    return { id: member.user.id, name: member.user.name, email: member.user.email, joinedAt: member.joinedAt }
}

export function createProjectMemberService(projectMemberRepository) {
    return {
        async add(projectId, memberUserId, userId) {
            if (!projectId || !memberUserId) throw serviceError('Project and member are required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            await projectMemberRepository.addMember({ projectId, userId, memberUserId })
            return { projectId, userId: memberUserId }
        },

        async remove(projectId, memberUserId, userId) {
            if (!projectId || !memberUserId) throw serviceError('Project and member are required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            await projectMemberRepository.removeMember({ projectId, userId, memberUserId })
            return { projectId, userId: memberUserId }
        },

        async list(projectId, userId) {
            if (!projectId) throw serviceError('Project is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            const members = await projectMemberRepository.findForMember({ projectId, userId })
            return members.map(presentMember)
        },
    }
}
