import { hashPassword } from '../src/utils/password.js'
import { prisma } from '../src/config/prisma.js'

async function run() {
    const passwordHash = await hashPassword('password123')

    // 1. Create or get default Organization
    let org = await prisma.organization.findFirst({
        where: { name: 'WorkFlowX Enterprise' },
    })

    if (!org) {
        org = await prisma.organization.findFirst()
    }

    if (!org) {
        org = await prisma.organization.create({
            data: {
                name: 'WorkFlowX Enterprise',
                description: 'Main production workspace for agile project and team execution',
            },
        })
    }
    console.log('Target Organization:', org.name, org.id)

    // 2. Define standard role accounts
    const roleAccounts = [
        { email: 'admin@workflowx.dev', name: 'Pradeep Admin', role: 'ADMIN' },
        { email: 'rahul@workflowx.dev', name: 'Rahul Sharma', role: 'MANAGER' },
        { email: 'pradeep@workflowx.dev', name: 'Pradeep Kumar', role: 'MEMBER' },
        { email: 'sneha@workflowx.dev', name: 'Sneha Patel', role: 'VIEWER' },
    ]

    for (const acc of roleAccounts) {
        const user = await prisma.user.upsert({
            where: { email: acc.email },
            update: { passwordHash, name: acc.name },
            create: {
                name: acc.name,
                email: acc.email,
                passwordHash,
            },
        })

        await prisma.organizationMember.upsert({
            where: {
                organizationId_userId: {
                    organizationId: org.id,
                    userId: user.id,
                },
            },
            update: { role: acc.role },
            create: {
                organizationId: org.id,
                userId: user.id,
                role: acc.role,
            },
        })

        console.log(`Configured: ${acc.email} -> Role: ${acc.role}`)
    }

    console.log('All role accounts configured successfully with password123!')
    process.exit(0)
}

run().catch((err) => {
    console.error('Seeding error:', err)
    process.exit(1)
})
