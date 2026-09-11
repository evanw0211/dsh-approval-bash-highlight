#!/usr/bin/env node
/**
 * Installation verification for dsh-approval-bash-highlight.
 *
 * The point is to prove the *installed package*, not a copy of its logic:
 *
 *  1. the DSH install contract — `dsh.client.platform` is `web`, the host half
 *     exports `apply`, and `exports["./client"]` points at a real bundle;
 *  2. the browser half loads through the REAL module system shipped by
 *     `@deepseek-ai/dsh-client-modules` (`ClientModuleSystem`), with `react`
 *     supplied the way the shell's platform seed supplies it;
 *  3. applying it injects its stylesheet and takes over the single
 *     `conversation.approval.detail` slot at priority -1;
 *  4. the registered component renders the *pending* command resolved from
 *     `legacy.runningCalls`, and renders nothing when correlation is absent.
 *
 * No browser and no running host are required. Run `node build.mjs` first.
 *
 * @module dsh-approval-bash-highlight/verify-install
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadBrowserHalf } from './tools/load-browser-half.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

let failures = 0
/** Record one assertion without aborting, so a run reports every problem at once. */
function check(label, condition, detail) {
  if (!condition) failures += 1
  const suffix = detail === undefined ? '' : `  — ${detail}`
  process.stdout.write(`${condition ? 'ok  ' : 'FAIL'}  ${label}${suffix}\n`)
  return condition
}

// ---------------------------------------------------------------------------
// 1. The package contract the Loader and the client scanner read.
// ---------------------------------------------------------------------------
process.stdout.write(`\n# package contract (${pkg.name}@${pkg.version})\n`)
check('package name is a string', typeof pkg.name === 'string' && pkg.name.length > 0, pkg.name)
check('type is module (host half is ESM)', pkg.type === 'module')
check('dsh.client.platform is web', pkg.dsh?.client?.platform === 'web', pkg.dsh?.client?.platform)
check(
  'dsh.client.inject is a string array',
  Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.every((item) => typeof item === 'string'),
)
check('dsh.bundle.patch is declared', typeof pkg.dsh?.bundle?.patch === 'string', pkg.dsh?.bundle?.patch)

const clientRel = typeof pkg.exports?.['./client'] === 'string' ? pkg.exports['./client'] : pkg.exports?.['./client']?.default
check('exports["./client"] resolves to a string', typeof clientRel === 'string', clientRel)
const clientPath = resolve(root, clientRel ?? '')
check('client bundle exists', clientRel !== undefined && existsSync(clientPath), clientPath)

const hostRel = typeof pkg.exports?.['.'] === 'string' ? pkg.exports['.'] : pkg.exports?.['.']?.default
check('exports["."] exists', hostRel !== undefined && existsSync(resolve(root, hostRel)))

const patchPath = join(root, pkg.dsh?.bundle?.patch ?? 'cordis.patch.yml')
const patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
check('profile patch inserts this package by name', patchText.includes(`name: ${pkg.name}`), pkg.dsh?.bundle?.patch)

const hostHalf = await import(pathToFileURL(resolve(root, hostRel)).href)
check('host half exports apply()', typeof hostHalf.apply === 'function')

// ---------------------------------------------------------------------------
// 2. Load the browser half through the real client module system.
// ---------------------------------------------------------------------------
process.stdout.write('\n# browser half through @deepseek-ai/dsh-client-modules\n')

// Platform seeds: the shell hands every factory `react`, plus a `document` for
// the stylesheet convention. Only these two are needed by this bundle.
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
}
const styleTags = []
const documentStub = {
  querySelector: (selector) => styleTags.find((tag) => `style[data-plugin-css=${JSON.stringify(tag.dataset.pluginCss)}]` === selector) ?? null,
  createElement: () => ({ dataset: {} }),
  head: { appendChild: (tag) => styleTags.push(tag) },
}

let batchUrl
const loaded = await loadBrowserHalf({
  packageName: pkg.name,
  clientPath,
  staticModules: { react: reactStub },
  document: documentStub,
  onBatchUrl: (url) => {
    batchUrl = url
  },
})
check('module system located', typeof loaded.clientModulesDir === 'string', loaded.clientModulesDir)
check('ClientModuleSystem exported by the shipped bundle', typeof loaded.clientModules.ClientModuleSystem === 'function')
check('facade switched to live registration', loaded.target.mode === 'live', loaded.target.mode)
check('transport asked for the manifest batch URL', batchUrl === '/__preview_batch__', batchUrl)

const bundleExports = loaded.exports
check('bundle materialized exports.apply()', typeof bundleExports.apply === 'function')
check(
  'bundle exports inject = ["slots"]',
  Array.isArray(bundleExports.inject) && bundleExports.inject.length === 1 && bundleExports.inject[0] === 'slots',
  JSON.stringify(bundleExports.inject),
)

// ---------------------------------------------------------------------------
// 3. Applying takes the single approval-detail slot over.
// ---------------------------------------------------------------------------
process.stdout.write('\n# slot takeover\n')
const injections = []
const registrations = []
const slots = {
  inject(name, callback) {
    injections.push(name)
    callback()
  },
  register(options, component) {
    registrations.push({ options, component })
  },
}
bundleExports.apply({
  get: (name) => (name === 'slots' ? slots : undefined),
  slots,
})

check('stylesheet injected once', styleTags.length === 1, `${String(styleTags.length)} tag(s)`)
check('stylesheet carries the card rules', String(styleTags[0]?.textContent ?? '').includes('.hl_root'))
check('slot declaration is awaited via inject()', injections[0] === 'conversation.approval.detail', injections[0])
check('exactly one occupant is registered', registrations.length === 1, `${String(registrations.length)}`)
check('occupant targets conversation.approval.detail', registrations[0]?.options?.name === 'conversation.approval.detail')
check(
  'priority -1 shadows the shipped priority-0 occupant',
  registrations[0]?.options?.priority === -1,
  String(registrations[0]?.options?.priority),
)

// ---------------------------------------------------------------------------
// 4. The occupant renders the pending command from legacy.runningCalls.
// ---------------------------------------------------------------------------
process.stdout.write('\n# rendering the pending command\n')
const command = [
  'set -e',
  'OUT=/etc/out.txt',
  'if [ -f "$PROBE" ]; then',
  "  printf '%s\\n' \"$PROBE\" >> \"$OUT\" 2> err",
  'fi',
  'FOO=bar printf ok',
  'for i in $(seq 1 3); do echo "$i"; done',
  '',
].join('\n')

/** A snapshot shaped like the live one: the pending call is NOT in `nodes`. */
const snapshot = {
  legacy: {
    nodes: [],
    runningCalls: [{ callId: 'call_verify_1', name: 'bash', argsRaw: JSON.stringify({ command }) }],
  },
}
const render = (callId, live = snapshot) => registrations[0].component({ callId, useChat: (selector) => selector(live) })

const tree = render('call_verify_1')
const pre = tree?.children?.find((child) => child?.type === 'pre')
// React flattens nested child arrays; the stub does not, so flatten here.
const units = (pre?.children ?? []).flat(Infinity)
const spans = units.filter((child) => child?.type === 'span')
const brs = units.filter((child) => child?.type === 'br')
const classes = new Set(spans.map((span) => span.props.className))
const textOf = (cls) => spans.filter((span) => span.props.className === cls).map((span) => span.children.join('')).join('')
const label = String(tree?.children?.[0]?.children?.[0]?.children?.[0] ?? '')

check('card root rendered', tree?.type === 'div' && tree.props.className === 'hl_root', tree?.props?.className)
check('code block rendered', pre?.props?.className?.includes('hl_pre') === true, pre?.props?.className)
check('line breaks preserved per line', brs.length === command.split('\n').length - 1, `${String(brs.length)} <br>`)
check('indentation preserved (NBSP runs)', units.some((unit) => typeof unit === 'string' && unit.includes('\u00a0')))
check('label reports lines and tokens', new RegExp(`^bash · ${String(command.split('\n').length)} lines · \\d+ tokens$`).test(label), label)
check('keywords highlighted', classes.has('shiki-token-keyword') && textOf('shiki-token-keyword').includes('if'))
check('quoted strings highlighted', classes.has('shiki-token-string') && textOf('shiki-token-string').includes('"$PROBE"'))
check('command substitution highlighted', classes.has('shiki-token-string-expression') && textOf('shiki-token-string-expression').includes('$(seq 1 3)'))
check('options highlighted', classes.has('shiki-token-parameter') && textOf('shiki-token-parameter').includes('-e'))
check('redirection operators highlighted', classes.has('shiki-token-keyword') && textOf('shiki-token-keyword').includes('>>'))
check('numbers highlighted', classes.has('shiki-token-constant') && textOf('shiki-token-constant').includes('2'))
check('command names distinguished', classes.has('shiki-token-function') && textOf('shiki-token-function').includes('printf'))
check('assignments are not command names', textOf('shiki-token-parameter').includes('OUT=/etc/out.txt'))
check(
  'a prefix assignment does not consume the command',
  spans.filter((span) => span.props.className === 'shiki-token-function' && span.children.join('') === 'printf').length === 2,
  textOf('shiki-token-function'),
)

// No ambiguous fallback: a wrong id must render nothing, never another command.
check('wrong callId renders nothing', render('call_other') === null)
check('missing callId renders nothing', render(undefined) === null)
check(
  'a settled node still resolves by exact id',
  render('call_settled', { legacy: { runningCalls: [], nodes: [{ callId: 'call_settled', call: { argsRaw: JSON.stringify({ command: 'echo settled' }) } }] } }) !== null,
)
check(
  'a non-matching node is not used as a fallback',
  render('call_missing', { legacy: { runningCalls: [], nodes: [{ callId: 'call_settled', call: { argsRaw: JSON.stringify({ command: 'echo settled' }) } }] } }) === null,
)
check(
  'a call without a command renders nothing',
  render('call_empty', { legacy: { runningCalls: [{ callId: 'call_empty', argsRaw: JSON.stringify({ cwd: '/tmp' }) }], nodes: [] } }) === null,
)

process.stdout.write(`\n${failures === 0 ? 'PASS' : `FAIL (${String(failures)})`}: ${String(failures)} failing check(s)\n`)
process.exit(failures === 0 ? 0 : 1)
