import { prisma } from '../src/config/prisma.js'
import { hashPassword } from '../src/utils/password.js'

const defaultPassword = 'Password123!'

const seedUsersList = [
    {
        name: 'Pradeep Admin',
        email: 'admin@workflowx.dev',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        orgRole: 'ADMIN',
        teamName: 'Executive Team',
    },
    {
        name: 'Rahul Sharma',
        email: 'rahul.sharma@workflowx.dev',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
        orgRole: 'MANAGER',
        teamName: 'Core Engineering',
    },
    {
        name: 'Sneha Patel',
        email: 'sneha.patel@workflowx.dev',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
        orgRole: 'MEMBER',
        teamName: 'Core Engineering',
    },
    {
        name: 'Vikram Rao',
        email: 'vikram.rao@workflowx.dev',
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
        orgRole: 'MEMBER',
        teamName: 'Core Engineering',
    },
    {
        name: 'Ananya Gupta',
        email: 'ananya.gupta@workflowx.dev',
        avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
        orgRole: 'MEMBER',
        teamName: 'Product Design',
    },
    {
        name: 'David Miller',
        email: 'david.miller@workflowx.dev',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
        orgRole: 'VIEWER',
        teamName: 'Product Design',
    },
]

async function seedUsers() {
    console.log('🌱 Starting user seeding process...')

    const passwordHash = await hashPassword(defaultPassword)

    // 1. Ensure primary Organization exists
    let organization = await prisma.organization.findFirst({
        where: { name: 'WorkFlowX Enterprise' },
    })

    if (!organization) {
        organization = await prisma.organization.create({
            data: {
                name: 'WorkFlowX Enterprise',
                description: 'Main collaborative workspace for engineering, product, and design teams.',
            },
        })
        console.log(`✅ Created Organization: ${organization.name} (${organization.id})`)
    } else {
        console.log(`ℹ️ Using existing Organization: ${organization.name}`)
    }

    // 2. Ensure Teams exist
    const teamsMap = {}
    const teamNames = ['Executive Team', 'Core Engineering', 'Product Design']
    for (const teamName of teamNames) {
        let team = await prisma.team.findFirst({
            where: { organizationId: organization.id, name: teamName },
        })
        if (!team) {
            team = await prisma.team.create({
                data: {
                    name: teamName,
                    description: `${teamName} division at WorkFlowX Enterprise`,
                    organizationId: organization.id,
                },
            })
            console.log(`  + Created Team: ${team.name}`)
        }
        teamsMap[teamName] = team
    }

    // 3. Ensure default Project exists
    let project = await prisma.project.findFirst({
        where: { organizationId: organization.id, name: 'WorkFlowX Web Platform' },
    })
    const adminUser = seedUsersList.find(u => u.orgRole === 'ADMIN')

    // Seed Users and assign Organization/Team/Project Memberships
    const createdUsers = []

    for (const userData of seedUsersList) {
        const user = await prisma.user.upsert({
            where: { email: userData.email },
            update: {
                name: userData.name,
                avatarUrl: userData.avatarUrl,
                passwordHash,
            },
            create: {
                name: userData.name,
                email: userData.email,
                avatarUrl: userData.avatarUrl,
                passwordHash,
            },
        })

        // Organization membership
        await prisma.organizationMember.upsert({
            where: {
                organizationId_userId: {
                    organizationId: organization.id,
                    userId: user.id,
                },
            },
            update: { role: userData.orgRole },
            create: {
                organizationId: organization.id,
                userId: user.id,
                role: userData.orgRole,
            },
        })

        // Team membership
        if (userData.teamName && teamsMap[userData.teamName]) {
            await prisma.teamMember.upsert({
                where: {
                    teamId_userId: {
                        teamId: teamsMap[userData.teamName].id,
                        userId: user.id,
                    },
                },
                update: {},
                create: {
                    teamId: teamsMap[userData.teamName].id,
                    userId: user.id,
                },
            })
        }

        createdUsers.push(user)
        console.log(`👤 Seeded User: ${user.name} <${user.email}> [Role: ${userData.orgRole}]`)
    }

    // Create project if missing
    if (!project) {
        const creatorId = createdUsers[0].id
        project = await prisma.project.create({
            data: {
                name: 'WorkFlowX Web Platform',
                description: 'Main project for full-stack collaboration web app development',
                organizationId: organization.id,
                createdById: creatorId,
                status: 'ACTIVE',
                visibility: 'ORGANIZATION',
            },
        })
        console.log(`🚀 Created Project: ${project.name}`)
    }

    // Add all seeded users to the project
    for (const user of createdUsers) {
        await prisma.projectMember.upsert({
            where: {
                projectId_userId: {
                    projectId: project.id,
                    userId: user.id,
                },
            },
            update: {},
            create: {
                projectId: project.id,
                userId: user.id,
            },
        })
    }

    console.log('\n🎉 User seeding completed successfully!')
    console.log(`🔑 All user passwords set to: ${defaultPassword}\n`)
}

seedUsers()
    .catch((error) => {
        console.error('❌ Seeding failed:', error)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
