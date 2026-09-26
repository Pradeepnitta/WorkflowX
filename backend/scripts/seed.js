import { prisma } from '../src/config/prisma.js'
import { readTasks } from '../src/repositories/taskRepository.js'
import { hashPassword } from '../src/utils/password.js'

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
    const passwordHash = await hashPassword('workflowx-demo-password')
    const organization = await prisma.organization.findFirst({ where: { name: demoOrganizationName } })
        ?? await prisma.organization.create({ data: { name: demoOrganizationName, description: 'Demo WorkFlowX organization' } })

    const user = await prisma.user.upsert({
        where: { email: demoEmail },
        update: {},
        create: {
            name: 'WorkflowX Admin',
            email: demoEmail,
            passwordHash,
        },
    })

    await prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
        update: { role: 'ADMIN' },
        create: { organizationId: organization.id, userId: user.id, role: 'ADMIN' },
    })

    const project = await prisma.project.findFirst({ where: { organizationId: organization.id, name: demoProjectName } })
        ?? await prisma.project.create({
            data: {
                name: demoProjectName,
                organizationId: organization.id,
                createdById: user.id,
                status: 'ACTIVE',
            },
        })

    await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: user.id } },
        update: {},
        create: { projectId: project.id, userId: user.id },
    })

    const tasks = await readTasks()
    for (const task of tasks) {
        const existingTask = await prisma.task.findFirst({ where: { projectId: project.id, title: task.title } })
        if (!existingTask) {
            await prisma.task.create({
                data: {
                    title: task.title,
                    projectId: project.id,
                    createdById: user.id,
                    assigneeId: user.id,
                    status: taskStatusMap[task.status] || 'TODO',
                    priority: priorityMap[task.priority] || 'MEDIUM',
                },
            })
        }
    }

    console.log(`Seeded ${organization.name} with ${tasks.length} tasks.`)
}

seed()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
