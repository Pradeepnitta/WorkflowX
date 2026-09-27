import { pool, query } from '../src/config/db.js'

async function deleteAllUsers() {
    console.log('Starting deletion of all users and dependent records...')

    try {
        const countBefore = await query(`SELECT COUNT(*)::int as count FROM "User"`)
        console.log(`Current user count: ${countBefore.rows[0].count}`)

        await query(`TRUNCATE TABLE "User" CASCADE;`)

        const countAfter = await query(`SELECT COUNT(*)::int as count FROM "User"`)
        console.log(`User count after deletion: ${countAfter.rows[0].count}`)
        console.log('Successfully deleted all users and dependent records.')
    } catch (error) {
        console.error('Failed to delete users:', error)
        throw error
    } finally {
        await pool.end()
    }
}

deleteAllUsers()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
