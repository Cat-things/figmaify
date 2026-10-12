'use strict'

// Decides in CI whether a push should become a release. A release goes out
// once main has RELEASE_EVERY commits since the last v* tag, or whenever a
// v* tag is pushed by hand. Writes its answer to $GITHUB_OUTPUT.

const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const RELEASE_EVERY = 5

/** @param {string} v */
function parse (v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || ''))
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** @param {number[]} a @param {number[]} b */
function compare (a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/**
 * The patch after the last release, unless package.json was bumped past it by hand.
 * @param {string} pkgVersion
 * @param {string} lastTag
 */
function nextVersion (pkgVersion, lastTag) {
  const pkg = parse(pkgVersion)
  if (!pkg) throw new Error(`package.json version "${pkgVersion}" isn't x.y.z`)
  const last = parse(lastTag)
  if (!last) return pkg.join('.')
  const bumped = [last[0], last[1], last[2] + 1]
  return (compare(pkg, bumped) > 0 ? pkg : bumped).join('.')
}

/**
 * @param {{ event: string, ref: string, lastTag: string, commitsSince: number, pkgVersion: string, every?: number }} input
 * @returns {{ release: boolean, version: string, tag: string }}
 */
function plan (input) {
  const every = input.every || RELEASE_EVERY

  if (input.event === 'push' && input.ref.startsWith('refs/tags/v')) {
    const tag = input.ref.slice('refs/tags/'.length)
    if (!parse(tag)) throw new Error(`Tag ${tag} isn't vX.Y.Z`)
    return { release: true, version: tag.slice(1), tag }
  }

  if (input.event === 'push' && input.ref === 'refs/heads/main' && input.commitsSince >= every) {
    const version = nextVersion(input.pkgVersion, input.lastTag)
    return { release: true, version, tag: 'v' + version }
  }

  return { release: false, version: input.pkgVersion, tag: '' }
}

function main () {
  const event = process.env.GITHUB_EVENT_NAME || ''
  const ref = process.env.GITHUB_REF || ''
  const pkgVersion = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version

  /** @param {string[]} args */
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

  // For a pushed tag, the previous release is the tag before it.
  const from = ref.startsWith('refs/tags/') ? `${ref.slice('refs/tags/'.length)}^` : 'HEAD'
  let lastTag = ''
  try {
    lastTag = git('describe', '--tags', '--abbrev=0', '--match', 'v*', from)
  } catch {}

  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
  const commitsSince = Number(git('rev-list', '--count', range))
  const result = plan({ event, ref, lastTag, commitsSince, pkgVersion })

  const changes = git('log', '--no-merges', '--pretty=format:- %s', range)
  const notes = [
    changes || '- Small fixes',
    '',
    'Builds aren\'t code signed yet, so SmartScreen may warn the first time. Click "More info" and then "Run anyway".'
  ].join('\n')

  const delimiter = 'NOTES_' + crypto.randomBytes(8).toString('hex')
  const output = [
    `release=${result.release}`,
    `version=${result.version}`,
    `tag=${result.tag}`,
    `notes<<${delimiter}`,
    notes,
    delimiter,
    ''
  ].join('\n')

  console.log(`${commitsSince} commits since ${lastTag || 'the start'}, release: ${result.release}${result.release ? ' as ' + result.tag : ''}`)
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, output)
  else process.stdout.write(output)
}

if (require.main === module) main()

module.exports = { plan, nextVersion, RELEASE_EVERY }
