/**
 * Load a package client half through the REAL module system DSH ships.
 *
 * This is the shared harness behind `verify-install.mjs` and
 * `tools/render-preview.mjs`. It does not reimplement the bundle contract: it
 * imports `@deepseek-ai/dsh-client-modules`' own `lib/client.js` bundle, hands
 * it the same facade the shell's HTML bootstrap hands it, and drives a
 * `ClientModuleSystem` over a one-row boot manifest whose transport reads the
 * bundle from disk.
 *
 * @module dsh-approval-bash-highlight/tools/load-browser-half
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

/** Locate the installed `@deepseek-ai/dsh-client-modules` package directory. */
export function locateClientModules() {
  const candidates = []
  if (process.env.DSH_INSTALL !== undefined && process.env.DSH_INSTALL !== '') candidates.push(process.env.DSH_INSTALL)
  try {
    candidates.push(dirname(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-client-modules/package.json')))
  } catch {}
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    candidates.push(join(globalRoot, '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-client-modules'))
  } catch {}
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  throw new Error('load-browser-half: cannot locate @deepseek-ai/dsh-client-modules; set DSH_INSTALL to its package directory')
}

/**
 * Materialize one package's client bundle and return its exports.
 *
 * @param options - Target package, bundle path, platform seed table, a
 *   `document` for the stylesheet convention, and an optional transport hook.
 * @returns The materialized exports plus the module system that produced them.
 */
export async function loadBrowserHalf({ packageName, clientPath, staticModules, document, onBatchUrl }) {
  const clientModulesDir = locateClientModules()
  const factories = new Map()
  globalThis.window = globalThis
  globalThis.__ModuleLoader__ = {
    load: (registration) => {
      factories.set(registration.id, registration.factory)
    },
  }
  await import(pathToFileURL(join(clientModulesDir, 'lib', 'client.js')).href)

  const bootstrapFactory = factories.get('@deepseek-ai/dsh-client-modules')
  if (typeof bootstrapFactory !== 'function') {
    throw new Error('load-browser-half: the module-system bundle did not register its factory')
  }
  const clientModules = bootstrapFactory(() => {
    throw new Error('load-browser-half: the module-system bundle requires nothing')
  })

  const batchUrl = '/__preview_batch__'
  const boot = {
    rev: 'preview',
    entries: [{ id: packageName, url: `/plugins/??${packageName}/client.js&rev=preview`, rev: 'preview', inject: [], external: [] }],
    batches: [{ phase: 'application', url: batchUrl, rev: 'preview', entries: [packageName] }],
  }
  const target = {
    mode: 'queue',
    pendingQueue: [],
    load(registration) {
      this.pendingQueue.push(registration)
    },
  }

  const system = new clientModules.ClientModuleSystem({
    manifest: clientModules.parseBootManifest(boot),
    staticModules,
    registrationTarget: target,
    bootstrapModule: { id: '@deepseek-ai/dsh-client-modules', exports: clientModules },
    loadBundle: async (url) => {
      if (onBatchUrl !== undefined) onBatchUrl(url)
      const sandbox = { window: { __ModuleLoader__: target }, document, console }
      vm.createContext(sandbox)
      vm.runInContext(readFileSync(clientPath, 'utf8'), sandbox, { filename: clientPath })
    },
  })

  const exports = await system.import(packageName)
  return { exports, clientModules, system, target, clientModulesDir }
}
