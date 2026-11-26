import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveDatabaseUrl } from '../src/config/db.js'

test('database URL resolution uses only the configured URL', () => {
    const originalDatabaseUrl = process.env.DATABASE_URL

    try {
        delete process.env.DATABASE_URL
        assert.equal(resolveDatabaseUrl(), undefined)

        process.env.DATABASE_URL = 'postgresql://localhost:5432/workflowx_test'
        assert.equal(resolveDatabaseUrl(), process.env.DATABASE_URL)
    } finally {
        if (originalDatabaseUrl === undefined) {
            delete process.env.DATABASE_URL
        } else {
            process.env.DATABASE_URL = originalDatabaseUrl
        }
    }
})
