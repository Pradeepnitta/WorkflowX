import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

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
}
