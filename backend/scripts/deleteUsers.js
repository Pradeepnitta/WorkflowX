import { prisma } from '../src/config/prisma.js'

async function deleteAllUsers() {
    console.log('Starting deletion of all users and dependent records...')

    try {
        const countBefore = await prisma.user.count()
        console.log(`Current user count: ${countBefore}`)

        // Using TRUNCATE TABLE "User" CASCADE to cleanly and atomically
        // wipe all users and any table referencing User via foreign keys.
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User" CASCADE;`)

        const countAfter = await prisma.user.count()
        console.log(`User count after deletion: ${countAfter}`)
        console.log('Successfully deleted all users and dependent records.')
    } catch (error) {
        console.error('Failed to delete users:', error)
        throw error
    }
}

deleteAllUsers()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
