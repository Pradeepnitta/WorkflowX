import { query } from '../src/config/db.js'

async function migrate() {
    try {
        await query('ALTER TABLE "GeneralTask" ADD COLUMN IF NOT EXISTS description TEXT;')
        await query('ALTER TABLE "GeneralTask" ADD COLUMN IF NOT EXISTS tags TEXT[];')
        await query('ALTER TABLE "GeneralTask" ADD COLUMN IF NOT EXISTS "estimatedHours" TEXT;')
        console.log('Successfully altered GeneralTask table with description, tags, estimatedHours.')
    } catch (err) {
        console.error('Migration error:', err.message)
    } finally {
        process.exit(0)
    }
}

migrate()
