export function createInvitationAcceptanceService(invitationRepository) {
    return {
        async accept(token, userId) {
            if (typeof token !== 'string' || !token) {
                const error = new Error('Invitation token is required')
                error.statusCode = 400
                throw error
            }
            if (!userId) {
                const error = new Error('Authentication required')
                error.statusCode = 401
                throw error
            }
            const invitation = await invitationRepository.accept({ token, userId })
            return { organizationId: invitation.organizationId, role: invitation.role, accepted: true }
        },
    }
}
