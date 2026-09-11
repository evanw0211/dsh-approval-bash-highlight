#!/usr/bin/env node
/**
 * Build the browser half this package serves.
 *
 * `client.js` is the source of truth: a bare statement list that returns the
 * Cordis Plugin, which is exactly what a dynamic client-plugin definition
 * evaluates. `@deepseek-ai/dsh-client-modules`, however, serves a *package*
 * client half as a plain-CJS factory registered on the HTML-installed
 * `window.__ModuleLoader__` facade, with its CSS injected at materialization.
 *
 * This script is the whole build: no bundler and no dependency. It
 *  1. checks the body parses as a function body (the dynamic contract),
 *  2. checks the single-slot takeover stays at priority -1 (the shipped
 *     ui-chat occupant sits at 0 and the lowest priority renders),
 *  3. wraps the body verbatim in the factory form and writes `lib/client.js`.
 *
 * The output is deterministic, so a rebuild that changes nothing changes no
 * bytes — which keeps the host's content revision stable.
 *
 * @module dsh-approval-bash-highlight/build
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const body = readFileSync(join(root, 'client.js'), 'utf8')

/** Fail loudly rather than write a bundle that cannot load. */
function assert(condition, message) {
  if (!condition) throw new Error(`build: ${message}`)
}

// 1. The dynamic contract: `new Function` compiles (and does not run) the body,
//    so a top-level `return` is legal and a syntax error is caught here.
assert(typeof pkg.name === 'string' && pkg.name.length > 0, 'package.json has no name')
try {
  // eslint-disable-next-line no-new-func
  new Function(body)
} catch (error) {
  throw new Error(`build: client.js does not parse as a function body: ${String(error)}`)
}

// 2. The slot contract: a same-priority duplicate on a `single` slot throws,
//    and the lowest priority renders. The takeover must sit below the shipped 0.
assert(/priority:\s*-1/.test(body), 'client.js must register the approval slot at priority -1')

/** Indent every non-empty line of the wrapped body for readability. */
function indent(text, prefix) {
  return text
    .split('\n')
    .map((line) => (line === '' ? line : prefix + line))
    .join('\n')
    .replace(/\s+$/, '')
}

const tagId = `${pkg.name}/client.js`
const output = `/**
 * GENERATED FILE — do not edit by hand. Run \`node build.mjs\`.
 *
 * Browser half of ${pkg.name}: the \`client.js\` body wrapped in the
 * plain-CJS factory form \`@deepseek-ai/dsh-client-modules\` evaluates in the
 * shell. The body is inlined verbatim so this artifact and the dynamic-plugin
 * source cannot drift.
 */
window.__ModuleLoader__.load({
\tid: ${JSON.stringify(pkg.name)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
\t\tlet react = require("react");
\t\tconst React = react;
\t\t// No \`styles\` Builtin exists in the browser half; inject the stylesheet the
\t\t// same way every shipped client bundle does, at materialization time.
\t\tconst styles = {
\t\t\tinsert(css) {
\t\t\t\tconst tagId = ${JSON.stringify(tagId)};
\t\t\t\tif (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
\t\t\t\t\tconst tag = document.createElement("style");
\t\t\t\t\ttag.dataset.plugin = ${JSON.stringify(pkg.name)};
\t\t\t\t\ttag.dataset.pluginCss = tagId;
\t\t\t\t\ttag.textContent = css;
\t\t\t\t\tdocument.head.appendChild(tag);
\t\t\t\t}
\t\t\t}
\t\t};
\t\tconst plugin = (function () {
${indent(body, '\t\t\t')}
\t\t})();
\t\texports.apply = plugin.apply;
\t\texports.inject = ["slots"];
\t\treturn module.exports;
\t}
});
`

mkdirSync(join(root, 'lib'), { recursive: true })
writeFileSync(join(root, 'lib', 'client.js'), output)
process.stdout.write(`build: wrote lib/client.js (${String(Buffer.byteLength(output))} bytes, id ${pkg.name})\n`)
