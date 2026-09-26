import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dataFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'tasks.json')

export async function readTasks() {
    return JSON.parse(await readFile(dataFile, 'utf8'))
}

export async function saveTasks(tasks) {
    await mkdir(dirname(dataFile), { recursive: true })
    await writeFile(dataFile, `${JSON.stringify(tasks, null, 2)}\n`)
}
