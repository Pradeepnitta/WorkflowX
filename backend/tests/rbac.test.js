import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPermission, RoleHierarchy } from '../src/middleware/rbac.js'

test('checkPermission accurately evaluates role levels', () => {
    assert.equal(checkPermission('ADMIN', 'MANAGER'), true)
    assert.equal(checkPermission('MANAGER', 'MANAGER'), true)
    assert.equal(checkPermission('MEMBER', 'MANAGER'), false)
    assert.equal(checkPermission('VIEWER', 'MEMBER'), false)
    assert.equal(checkPermission('VIEWER', 'VIEWER'), true)
})
