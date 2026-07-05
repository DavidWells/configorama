/* Tests for 1Password field selection and inference
   Fixtures mirror op item get --format json --reveal output shapes */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { selectField } = require('./fields')

const loginItem = {
  id: 'login-1',
  title: 'My Database Login',
  fields: [
    { id: 'username', type: 'STRING', purpose: 'USERNAME', label: 'username', value: 'admin@example.com' },
    { id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', label: 'password', value: 'pw-secret' },
    { id: 'notesPlain', type: 'STRING', purpose: 'NOTES', label: 'notesPlain' },
    { id: 'website', type: 'URL', label: 'website', value: 'https://db.example.com' },
  ],
}

const secureNoteItem = {
  id: 'note-1',
  title: 'npm automation',
  fields: [
    { id: 'notesPlain', type: 'STRING', purpose: 'NOTES', label: 'notesPlain', value: 'NPM_TOKEN=npm_xxx' },
  ],
}

const ambiguousItem = {
  id: 'ambig-1',
  title: 'Mixed Item',
  fields: [
    { id: 'notesPlain', type: 'STRING', purpose: 'NOTES', label: 'notesPlain', value: 'NOTE=1' },
    { id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', label: 'password', value: 'hunter2' },
  ],
}

const apiCredentialItem = {
  id: 'api-1',
  title: 'Service API',
  fields: [
    { id: 'u1', type: 'STRING', label: 'username', value: 'svc-user' },
    { id: 'c1', type: 'CONCEALED', label: 'credential', value: 'api-secret' },
  ],
}

const duplicateLabelItem = {
  id: 'dup-1',
  title: 'Two Tokens',
  fields: [
    { id: 't1', type: 'CONCEALED', label: 'token', value: 'token-one', section: { id: 's1', label: 'staging' } },
    { id: 't2', type: 'CONCEALED', label: 'token', value: 'token-two', section: { id: 's2', label: 'production' } },
  ],
}

const noSecretItem = {
  id: 'plain-1',
  title: 'Plain Info',
  fields: [
    { id: 'username', type: 'STRING', purpose: 'USERNAME', label: 'username', value: 'someone' },
    { id: 'website', type: 'URL', label: 'website', value: 'https://example.com' },
  ],
}

/* Explicit selection */

test('explicit field matches id', () => {
  assert.is(selectField(loginItem, { field: 'password' }).value, 'pw-secret')
})

test('explicit field matches label case-insensitively', () => {
  assert.is(selectField(apiCredentialItem, { field: 'CREDENTIAL' }).value, 'api-secret')
})

test('explicit field matches purpose', () => {
  assert.is(selectField(loginItem, { field: 'PASSWORD' }).value, 'pw-secret')
})

test('explicit field wins over inference', () => {
  assert.is(selectField(ambiguousItem, { field: 'notesPlain' }).value, 'NOTE=1')
})

test('explicit section disambiguates duplicate labels', () => {
  assert.is(selectField(duplicateLabelItem, { field: 'token', section: 'production' }).value, 'token-two')
})

test('duplicate labels without section throw section ambiguity', () => {
  try {
    selectField(duplicateLabelItem, { field: 'token' })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /multiple fields labeled "token". Set section explicitly/)
  }
})

test('missing explicit field throws not-found', () => {
  try {
    selectField(loginItem, { field: 'nope' })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /Field "nope" was not found in 1Password item "My Database Login"/)
  }
})

/* Inference */

test('single password candidate is inferred (empty notesPlain ignored)', () => {
  assert.is(selectField(loginItem, {}).value, 'pw-secret')
})

test('single notesPlain candidate is inferred', () => {
  assert.is(selectField(secureNoteItem, {}).value, 'NPM_TOKEN=npm_xxx')
})

test('single concealed credential-like candidate is inferred', () => {
  assert.is(selectField(apiCredentialItem, {}).value, 'api-secret')
})

test('notesPlain plus password throws ambiguity naming candidates', () => {
  try {
    selectField(ambiguousItem, {})
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /multiple candidate secret fields/)
    assert.match(err.message, /notesPlain/)
    assert.match(err.message, /password/)
    assert.match(err.message, /Set field explicitly/)
    assert.is(err.message.includes('hunter2'), false)
  }
})

test('username, email, and url fields are ignored for inference', () => {
  try {
    selectField(noSecretItem, {})
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /has no obvious secret field. Set field explicitly/)
  }
})

test.run()
