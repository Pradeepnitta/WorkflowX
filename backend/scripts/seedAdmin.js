import { hashPassword } from '../src/utils/password.js'
import { prisma } from '../src/config/prisma.js'

async function run() {
    const hash = await hashPassword('password123')

    let org = await prisma.organization.findFirst({
        where: { name: 'WorkFlowX Enterprise' },
    })
    if (!org) {
        org = await prisma.organization.create({
            data: {
                name: 'WorkFlowX Enterprise',
                description: 'Main production workspace for agile project and team execution',
            },
        })
    }

    const admin = await prisma.user.upsert({
        where: { email: 'admin@workflowx.dev' },
        update: { passwordHash: hash, name: 'Pradeep Admin' },
        create: {
            name: 'Pradeep Admin',
            email: 'admin@workflowx.dev',
            passwordHash: hash,
        },
    })

    await prisma.organizationMember.upsert({
        where: {
            organizationId_userId: {
                organizationId: org.id,
                userId: admin.id,
            },
        },
        update: { role: 'ADMIN' },
        create: {
            organizationId: org.id,
            userId: admin.id,
            role: 'ADMIN',
        },
    })

    console.log('Admin user configured with ADMIN role:', admin.email, org.name)
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
