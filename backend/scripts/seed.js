import { pool, query } from '../src/config/db.js'
import { readTasks } from '../src/repositories/taskRepository.js'
import { hashPassword } from '../src/utils/password.js'
import { randomUUID } from 'node:crypto'

const demoEmail = 'admin@workflowx.local'
const demoOrganizationName = 'Acme Inc.'
const demoProjectName = 'Website refresh'

const taskStatusMap = {
    Todo: 'TODO',
    'In progress': 'IN_PROGRESS',
    Review: 'IN_REVIEW',
    Done: 'COMPLETED',
}

const priorityMap = {
    Low: 'LOW',
    Medium: 'MEDIUM',
    High: 'HIGH',
}

async function seed() {
    try {
        const passwordHash = await hashPassword('workflowx-demo-password')
        const now = new Date()

        let orgRes = await query(`SELECT * FROM "Organization" WHERE name = $1 LIMIT 1`, [demoOrganizationName])
        let organization = orgRes.rows[0]
        if (!organization) {
            const orgId = randomUUID()
            const newOrgRes = await query(
                `INSERT INTO "Organization" (id, name, description, "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [orgId, demoOrganizationName, 'Demo WorkFlowX organization', now, now]
            )
            organization = newOrgRes.rows[0]
        }

        const userRes = await query(
            `INSERT INTO "User" (id, name, email, "passwordHash", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", name = EXCLUDED.name, "updatedAt" = EXCLUDED."updatedAt"
             RETURNING *`,
            [randomUUID(), 'WorkflowX Admin', demoEmail, passwordHash, now, now]
        )
        const user = userRes.rows[0]

        await query(
            `INSERT INTO "OrganizationMember" ("organizationId", "userId", role, "joinedAt")
             VALUES ($1, $2, $3, $4)
             ON CONFLICT ("organizationId", "userId") DO UPDATE SET role = 'ADMIN'`,
            [organization.id, user.id, 'ADMIN', now]
        )

        let projRes = await query(
            `SELECT * FROM "Project" WHERE "organizationId" = $1 AND name = $2 LIMIT 1`,
            [organization.id, demoProjectName]
        )
        let project = projRes.rows[0]
        if (!project) {
            const projId = randomUUID()
            const newProjRes = await query(
                `INSERT INTO "Project" (id, name, "organizationId", "createdById", status, visibility, priority, "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
                [projId, demoProjectName, organization.id, user.id, 'ACTIVE', 'ORGANIZATION', 'MEDIUM', now, now]
            )
            project = newProjRes.rows[0]
        }

        await query(
            `INSERT INTO "ProjectMember" ("projectId", "userId", "joinedAt")
             VALUES ($1, $2, $3)
             ON CONFLICT ("projectId", "userId") DO NOTHING`,
            [project.id, user.id, now]
        )

        const tasks = await readTasks()
        for (const task of tasks) {
            const taskId = randomUUID()
            await query(
                `INSERT INTO "Task" (id, title, status, priority, "projectId", "createdById", "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    taskId,
                    task.title,
                    taskStatusMap[task.status] || 'TODO',
                    priorityMap[task.priority] || 'MEDIUM',
                    project.id,
                    user.id,
                    now,
                    now,
                ]
            )
        }

        console.log(`Seeded organization "${organization.name}" and project "${project.name}" with ${tasks.length} tasks`)
    } finally {
        await pool.end()
    }
}

seed().catch((error) => {
    console.error('Seed failed:', error)
    process.exitCode = 1
})
