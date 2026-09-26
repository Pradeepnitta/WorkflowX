import { promisify } from 'node:util'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

const scrypt = promisify(scryptCallback)
const keyLength = 64
const saltLength = 16

export async function hashPassword(password) {
    const salt = randomBytes(saltLength).toString('hex')
    const derivedKey = await scrypt(password, salt, keyLength)
    return `scrypt:${salt}:${Buffer.from(derivedKey).toString('hex')}`
}

export async function verifyPassword(password, storedHash) {
    const [algorithm, salt, keyHex] = storedHash.split(':')
    if (algorithm !== 'scrypt' || !salt || !keyHex) return false

    const expectedKey = Buffer.from(keyHex, 'hex')
    const derivedKey = Buffer.from(await scrypt(password, salt, expectedKey.length))
    return expectedKey.length === derivedKey.length && timingSafeEqual(expectedKey, derivedKey)
}
