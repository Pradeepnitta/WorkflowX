import { pool, query } from '../src/config/db.js'
import { hashPassword } from '../src/utils/password.js'
import { randomUUID } from 'node:crypto'

const defaultPassword = 'Password123!'

const seedUsersList = [
    {
        name: 'Nitta Pradeep',
        email: 'pradeepnitta6@gmail.com',
        avatarUrl: null,
        orgRole: 'ADMIN',
        teamName: 'Executive Team',
    },
    {
        name: 'Nitta Pradeep',
        email: 'pradeepnitta199@gmail.com',
        avatarUrl: null,
        orgRole: 'MEMBER',
        teamName: 'Core Engineering',
    },
    {
        name: 'Pradeep Admin',
        email: 'admin@workflowx.dev',
        avatarUrl: null,
        orgRole: 'ADMIN',
        teamName: 'Executive Team',
    },
    {
        name: 'Rahul Sharma',
        email: 'rahul.sharma@workflowx.dev',
        avatarUrl: null,
        orgRole: 'MANAGER',
        teamName: 'Core Engineering',
    },
    {
        name: 'Sneha Patel',
        email: 'sneha.patel@workflowx.dev',
        avatarUrl: null,
        orgRole: 'MEMBER',
        teamName: 'Core Engineering',
    },
    {
        name: 'Vikram Rao',
        email: 'vikram.rao@workflowx.dev',
        avatarUrl: null,
        orgRole: 'MEMBER',
        teamName: 'Core Engineering',
    },
    {
        name: 'Ananya Gupta',
        email: 'ananya.gupta@workflowx.dev',
        avatarUrl: null,
        orgRole: 'MEMBER',
        teamName: 'Product Design',
    },
    {
        name: 'David Miller',
        email: 'david.miller@workflowx.dev',
        avatarUrl: null,
        orgRole: 'VIEWER',
        teamName: 'Product Design',
    },
]

async function seedUsers() {
    console.log('🌱 Starting user seeding process...')

    try {
        const passwordHash = await hashPassword(defaultPassword)
        const now = new Date()

        // 1. Ensure primary Organization exists
        let orgRes = await query(`SELECT * FROM "Organization" WHERE name = $1 LIMIT 1`, ['WorkFlowX Enterprise'])
        let organization = orgRes.rows[0]

        if (!organization) {
            const orgId = randomUUID()
            const newOrgRes = await query(
                `INSERT INTO "Organization" (id, name, description, "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [orgId, 'WorkFlowX Enterprise', 'Main collaborative workspace for engineering, product, and design teams.', now, now]
            )
            organization = newOrgRes.rows[0]
            console.log(`✅ Created Organization: ${organization.name} (${organization.id})`)
        } else {
            console.log(`ℹ️ Using existing Organization: ${organization.name}`)
        }

        // 2. Ensure Teams exist
        const teamsMap = {}
        const teamNames = ['Executive Team', 'Core Engineering', 'Product Design']
        for (const teamName of teamNames) {
            let teamRes = await query(
                `SELECT * FROM "Team" WHERE "organizationId" = $1 AND name = $2 LIMIT 1`,
                [organization.id, teamName]
            )
            let team = teamRes.rows[0]
            if (!team) {
                const teamId = randomUUID()
                const newTeamRes = await query(
                    `INSERT INTO "Team" (id, name, description, "organizationId", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                    [teamId, teamName, `${teamName} division at WorkFlowX Enterprise`, organization.id, now, now]
                )
                team = newTeamRes.rows[0]
                console.log(`  + Created Team: ${team.name}`)
            }
            teamsMap[teamName] = team
        }

        // 3. Ensure default Project exists
        let projRes = await query(
            `SELECT * FROM "Project" WHERE "organizationId" = $1 AND name = $2 LIMIT 1`,
            [organization.id, 'WorkFlowX Web Platform']
        )
        let project = projRes.rows[0]

        // Seed Users and assign Organization/Team/Project Memberships
        const createdUsers = []

        for (const userData of seedUsersList) {
            const userRes = await query(
                `INSERT INTO "User" (id, name, email, "avatarUrl", "passwordHash", "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (email) DO UPDATE SET
                   name = EXCLUDED.name,
                   "avatarUrl" = EXCLUDED."avatarUrl",
                   "passwordHash" = EXCLUDED."passwordHash",
                   "updatedAt" = EXCLUDED."updatedAt"
                 RETURNING *`,
                [randomUUID(), userData.name, userData.email, userData.avatarUrl, passwordHash, now, now]
            )
            const user = userRes.rows[0]

            // Organization membership
            await query(
                `INSERT INTO "OrganizationMember" ("organizationId", "userId", role, "joinedAt")
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT ("organizationId", "userId") DO UPDATE SET role = EXCLUDED.role`,
                [organization.id, user.id, userData.orgRole, now]
            )

            // Team membership
            if (userData.teamName && teamsMap[userData.teamName]) {
                await query(
                    `INSERT INTO "TeamMember" ("teamId", "userId", "joinedAt")
                     VALUES ($1, $2, $3)
                     ON CONFLICT ("teamId", "userId") DO NOTHING`,
                    [teamsMap[userData.teamName].id, user.id, now]
                )
            }

            createdUsers.push(user)
            console.log(`👤 Seeded User: ${user.name} <${user.email}> [Role: ${userData.orgRole}]`)
        }

        // Create project if missing
        if (!project) {
            const creatorId = createdUsers[0].id
            const projId = randomUUID()
            const newProjRes = await query(
                `INSERT INTO "Project" (id, name, description, "organizationId", "createdById", status, visibility, "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
                [projId, 'WorkFlowX Web Platform', 'Main project for full-stack collaboration web app development', organization.id, creatorId, 'ACTIVE', 'ORGANIZATION', now, now]
            )
            project = newProjRes.rows[0]
            console.log(`🚀 Created Project: ${project.name}`)
        }

        // Add all seeded users to the project
        for (const user of createdUsers) {
            await query(
                `INSERT INTO "ProjectMember" ("projectId", "userId", "joinedAt")
                 VALUES ($1, $2, $3)
                 ON CONFLICT ("projectId", "userId") DO NOTHING`,
                [project.id, user.id, now]
            )
        }

        console.log('\n🎉 User seeding completed successfully!')
        console.log(`🔑 All user passwords set to: ${defaultPassword}\n`)
    } finally {
        await pool.end()
    }
}

seedUsers()
    .catch((error) => {
        console.error('❌ Seeding failed:', error)
        process.exitCode = 1
    })
