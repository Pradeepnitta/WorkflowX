import pg from 'pg'
import { pool as defaultPool, resolveDatabaseUrl } from '../src/config/db.js'

const { Pool } = pg

async function deleteAllUsers() {
    const customUrl = process.argv[2] || process.env.TARGET_DATABASE_URL
    const targetUrl = customUrl ? customUrl.trim() : resolveDatabaseUrl()

    // Mask credentials for display
    const maskedUrl = targetUrl.replace(/:([^:@]+)@/, ':****@')
    console.log(`Target database: ${maskedUrl}`)
    console.log('Starting deletion of all users and dependent records...')

    const pool = customUrl
        ? new Pool({
              connectionString: targetUrl,
              ssl: targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
          })
        : defaultPool

    try {
        const countBefore = await pool.query(`SELECT COUNT(*)::int as count FROM "User"`)
        console.log(`Current user count: ${countBefore.rows[0].count}`)

        await pool.query(`TRUNCATE TABLE "User" CASCADE;`)

        const countAfter = await pool.query(`SELECT COUNT(*)::int as count FROM "User"`)
        console.log(`User count after deletion: ${countAfter.rows[0].count}`)
        console.log('Successfully deleted all users and dependent records.')
    } catch (error) {
        console.error('Failed to delete users:', error.message || error)
        throw error
    } finally {
        await pool.end()
    }
}

deleteAllUsers()
    .catch((err) => {
        process.exit(1)
    })

