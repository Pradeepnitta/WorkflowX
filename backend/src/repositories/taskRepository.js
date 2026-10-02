import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { query } from '../config/db.js'

const defaultDataFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'tasks.json')
const tmpDataFile = join(tmpdir(), 'workflowx-tasks.json')

let inMemoryTasks = null

async function getPreferredDataFile() {
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        return tmpDataFile
    }
    return defaultDataFile
}

export async function readTasks() {
    if (inMemoryTasks) {
        return [...inMemoryTasks]
    }

    // 1. Try PostgreSQL persistent store on cold start
    try {
        const res = await query(`
            SELECT 
                id, title, project, status, priority, assignee, due,
                "isSuggestion", "approvalStatus", "suggestedBy", "suggestionReason",
                "createdAt", "updatedAt"
            FROM "GeneralTask"
            ORDER BY "createdAt" DESC
        `)
        if (res && res.rows) {
            const dbTasks = res.rows.map((row) => ({
                id: isNaN(Number(row.id)) ? row.id : Number(row.id),
                title: row.title,
                project: row.project || 'General',
                status: row.status || 'Todo',
                priority: row.priority || 'Medium',
                assignee: row.assignee || 'Unassigned',
                due: row.due || 'Next week',
                isSuggestion: Boolean(row.isSuggestion),
                approvalStatus: row.approvalStatus || 'APPROVED',
                suggestedBy: row.suggestedBy || null,
                suggestionReason: row.suggestionReason || null,
            }))

            // Also join any tasks from the "Task" table if present
            try {
                const projectTasksRes = await query(`
                    SELECT 
                        t.id, t.title, t.description, t.status, t.priority,
                        t."dueDate", p.name as "projectName", u.name as "assigneeName"
                    FROM "Task" t
                    LEFT JOIN "Project" p ON t."projectId" = p.id
                    LEFT JOIN "User" u ON t."assigneeId" = u.id
                    ORDER BY t."createdAt" DESC
                `)
                if (projectTasksRes && projectTasksRes.rows) {
                    const statusMap = {
                        TODO: 'Todo',
                        IN_PROGRESS: 'In progress',
                        IN_REVIEW: 'Review',
                        COMPLETED: 'Done',
                    }
                    const priorityMap = {
                        LOW: 'Low',
                        MEDIUM: 'Medium',
                        HIGH: 'High',
                        URGENT: 'Critical',
                    }
                    for (const pt of projectTasksRes.rows) {
                        if (!dbTasks.some((t) => String(t.id) === String(pt.id))) {
                            dbTasks.push({
                                id: pt.id,
                                title: pt.title,
                                project: pt.projectName || 'General',
                                status: statusMap[pt.status] || 'Todo',
                                priority: priorityMap[pt.priority] || 'Medium',
                                assignee: pt.assigneeName || 'Unassigned',
                                due: pt.dueDate ? new Date(pt.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Next week',
                                isSuggestion: false,
                                approvalStatus: 'APPROVED',
                            })
                        }
                    }
                }
            } catch {
                // Ignore Project Task join if table is empty or different
            }

            inMemoryTasks = dbTasks
            return [...dbTasks]
        }
    } catch {
        // Fallback to in-memory / file if DB is not reachable
    }

    if (inMemoryTasks) {
        return [...inMemoryTasks]
    }

    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        try {
            const content = await readFile(tmpDataFile, 'utf8')
            inMemoryTasks = JSON.parse(content)
            return [...inMemoryTasks]
        } catch {}
    }

    try {
        const content = await readFile(defaultDataFile, 'utf8')
        inMemoryTasks = JSON.parse(content)
        return [...inMemoryTasks]
    } catch {
        inMemoryTasks = []
        return inMemoryTasks
    }
}

export async function saveTasks(tasks) {
    inMemoryTasks = Array.isArray(tasks) ? [...tasks] : []
    const targetFile = await getPreferredDataFile()

    try {
        await mkdir(dirname(targetFile), { recursive: true })
        await writeFile(targetFile, `${JSON.stringify(inMemoryTasks, null, 2)}\n`)
    } catch (err) {
        if (targetFile !== tmpDataFile) {
            try {
                await mkdir(dirname(tmpDataFile), { recursive: true })
                await writeFile(tmpDataFile, `${JSON.stringify(inMemoryTasks, null, 2)}\n`)
            } catch (tmpErr) {
                console.warn('[taskRepository] tmp fallback write failed:', tmpErr.message)
            }
        } else {
            console.warn('[taskRepository] write failed:', err.message)
        }
    }

    // Persist to PostgreSQL database for cross-instance and Vercel permanence
    try {
        const currentIds = inMemoryTasks.map((t) => String(t.id))
        if (currentIds.length > 0) {
            const placeholders = currentIds.map((_, idx) => `$${idx + 1}`).join(',')
            await query(`DELETE FROM "GeneralTask" WHERE id NOT IN (${placeholders})`, currentIds)
        } else {
            await query(`DELETE FROM "GeneralTask"`)
        }

        for (const t of inMemoryTasks) {
            await query(
                `INSERT INTO "GeneralTask" (
                    id, title, project, status, priority, assignee, due,
                    "isSuggestion", "approvalStatus", "suggestedBy", "suggestionReason",
                    "updatedAt"
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    project = EXCLUDED.project,
                    status = EXCLUDED.status,
                    priority = EXCLUDED.priority,
                    assignee = EXCLUDED.assignee,
                    due = EXCLUDED.due,
                    "isSuggestion" = EXCLUDED."isSuggestion",
                    "approvalStatus" = EXCLUDED."approvalStatus",
                    "suggestedBy" = EXCLUDED."suggestedBy",
                    "suggestionReason" = EXCLUDED."suggestionReason",
                    "updatedAt" = CURRENT_TIMESTAMP`,
                [
                    String(t.id),
                    t.title || 'Untitled Task',
                    t.project || 'General',
                    t.status || 'Todo',
                    t.priority || 'Medium',
                    t.assignee || 'Unassigned',
                    t.due || 'Next week',
                    Boolean(t.isSuggestion),
                    t.approvalStatus || 'APPROVED',
                    t.suggestedBy || null,
                    t.suggestionReason || null,
                ]
            )
        }
    } catch (dbErr) {
        console.warn('[taskRepository] DB sync warning:', dbErr.message)
    }
}
