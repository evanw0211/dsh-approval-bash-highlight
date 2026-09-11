# dsh-approval-bash-highlight

Approval-card shell syntax highlighting for DSH.

A DSH **client plugin**. Its browser half takes over the single
`conversation.approval.detail` slot and renders the shell command of the Tool
call that is currently waiting for approval as a syntax-highlighted code block.
Its host half is an empty `apply` whose only job is to give the Cordis Loader a
row — which is what lets `@deepseek-ai/dsh-client-modules` find the `dsh.client`
declaration and serve `./client` to the browser.

## Layout

| Path | Role |
|---|---|
| `client.js` | **Source of truth.** A bare statement list whose last statement returns the Cordis Plugin, so it is also a valid dynamic-plugin body. |
| `build.mjs` | The whole build: wraps `client.js` into the factory form, writes `lib/client.js`. No bundler, no dependency. |
| `lib/client.js` | **Generated** browser half the host actually serves. |
| `lib/index.js` | Host half (empty `apply`). |
| `cordis.patch.yml` | Profile patch layer shipped with the package. |
| `verify-install.mjs` | Offline installation verification (39 checks). |

## Install

### A. As a profile dependency

```sh
dsh plugin --profile web add /path/to/dsh-approval-bash-highlight
# or a git URL, or a tarball
```

The manifest declares `dsh.bundle.patch`, so the CLI reconciles the dependency
into `dsh.profile.bundles` and the shipped `cordis.patch.yml` inserts the Loader
row by package name, resolved from the profile's own `node_modules`.

### B. In place, without pnpm (how it was verified here)

Add to `$DSH_HOME/profiles/<name>/cordis.patch.yml`:

```yaml
- insert:
    - id: approval-bash-highlight
      name: /home/blank/test/dsh-approval-bash-highlight/lib/index.js
```

The Loader and the client scanner both accept a path row; the browser half is
found through the nearest ancestor `package.json`. With `patchReload: live` the
running host recomposes without a restart. **Refresh the page** afterwards:
client bundles are only rebuilt by a dev watcher, so an already-open tab keeps
the old graph.

### Build

```sh
node build.mjs      # client.js -> lib/client.js
node verify-install.mjs
```

## Verification

### Offline — `node verify-install.mjs` (39 checks, all passing)

It proves the *installed package*, not a copy of its logic:

1. the DSH install contract — `dsh.client.platform` is `web`, the host half
   exports `apply`, `dsh.bundle.patch` is declared, and `exports["./client"]`
   points at a real bundle;
2. the browser half loads through the **real** module system shipped by
   `@deepseek-ai/dsh-client-modules` (`ClientModuleSystem`), with `react`
   supplied exactly as the shell's platform seed supplies it and a `document`
   for the stylesheet convention;
3. applying it injects its stylesheet once and takes the single
   `conversation.approval.detail` slot over at priority `-1`;
4. the registered component renders the **pending** command resolved from
   `legacy.runningCalls`, preserving line breaks and indentation, and renders
   *nothing* when correlation is absent.

No browser and no running host are required.

```
$ node verify-install.mjs
# package contract (dsh-approval-bash-highlight@0.1.0)
ok    package name is a string  — dsh-approval-bash-highlight
...
# browser half through @deepseek-ai/dsh-client-modules
ok    ClientModuleSystem is exported
ok    bundle exports inject = ["slots"]  — ["slots"]
# slot takeover
ok    priority -1 shadows the shipped priority-0 occupant  — -1
# rendering the pending command
ok    line breaks preserved per line  — 5 <br>
ok    label reports lines and tokens  — bash · 6 lines · 53 tokens
ok    keywords highlighted
...
PASS: 0 failing check(s)
```

### Online — against the running host

Installed into the live `web` profile, the host's unauthenticated HMR channel
(`GET /plugins/events`, the SSE graph feed) shows the plugin composed into the
client module graph — 53 → 54 entries:

```json
{ "id": "dsh-approval-bash-highlight",
  "url": "/plugins/??dsh-approval-bash-highlight/client.js&rev=afe8182303594cf3-53",
  "inject": [] }
```

Fetching that URL returns `200`, serves a valid source map, and the executable
body **starts byte-for-byte with `lib/client.js`** (the combo transport appends
`;` and a `sourceMappingURL` trailer). That proves the running host discovered
this package, read this checkout's bundle, and is serving those exact bytes to
the browser.

## The bug this fixes

The shipped approval card renders its command through the
`conversation.approval.detail` slot, resolved in
`packages/client/ui-approval/src/client/ApprovalPanel.tsx`:

```js
detail: approval.callId === void 0
  ? null
  : props.renderSlot('conversation.approval.detail', { callId: approval.callId })
```

The shipped occupant of that slot is `ApprovalCommand`
(`packages/client/ui-chat/src/client/chat/ApprovalCommand.tsx`). It looks for the
correlated Tool call in the Chat Node list and only accepts a `tool-call` node:

```js
for (const node of snapshot.nodes.values()) {
  const root = node.kind === 'tool-call' ? node.data.root : void 0;
  if (root !== void 0 && root.callId === callId && !('kind' in root)) return commandOf(root);
}
```

**While an approval is pending, that node does not exist yet.** The Chat Node list
holds only settled records, so this lookup finds nothing and the command area
renders **empty at exactly the moment the user needs to read the command they are
approving**.

### Measured evidence

Rendered in-card from the live snapshot during a pending `/etc`-write approval:

```
callId=call_00_ET_73ptgAiz5Aog1lwm4lYt4115
snapshotKeys=order,nodes,locations,navigation,timeline,legacy
legacyKeys=nodes,turnTimings,turnEnds,partial,runningCalls
nodes=202  nodeIdMatch=0
runningCalls=1
  R[0] id=call_00_ET_73ptgAiz5Aog1lwm4lYt4115  name=bash
       keys=callId|name|argsRaw|turn|step|time|subCalls   cmd=true:384
partial=null
```

- `nodeIdMatch=0` — the approval's `callId` appears nowhere in `nodes` (202 settled records)
- `R[0].id` equals the approval's `callId` **exactly**, and carries `argsRaw`

So the in-flight call lives in **`snapshot.legacy.runningCalls`**, not in `nodes`.
Earlier diagnosis along the way was wrong in two ways worth recording:

- the node list contains no `tool-call` entries during a pending approval, so the
  problem is **not** a wrong `kind` predicate that could be fixed by widening it
- `tool-result` nodes do **not** carry the command (`cmd=false` on all 82 sampled),
  so the command is **not** available by backfilling from a settled result

## What the plugin does

1. Registers into `conversation.approval.detail` — a `single` slot, so it shadows
   the shipped occupant. A single slot **rejects a same-priority duplicate** and
   the **lowest priority renders**, so the takeover registers at `priority: -1`
   while the shipped `ui-chat` occupant sits at the default `0`. (This is also
   why an explicit priority is required rather than merely helpful.)
2. Resolves the command by **exact `callId`** from `legacy.runningCalls`, falling
   back to `legacy.nodes` only for the settled case, also requiring an exact id
   match. There is deliberately **no ambiguous fallback** — a wrong command inside
   an approval prompt is worse than none.
3. Tokenizes the shell command and emits spans carrying the theme's existing
   **`.shiki-token-*`** class names. Shell keywords (`if`/`then`/`fi`/`for`/`do`/
   `done`/`else`/`in`/…) are classified here: the tokenizer emits them as plain
   words, so the keyword classification happens in the word pass.
4. Preserves layout: `\n` becomes an explicit `<br>`, and runs of spaces become
   non-breaking characters so indentation cannot collapse.

### Styling

No syntax-highlighting dependency is needed and none exists in the tree.
`packages/client/ui-theme/src/styles/shiki.css` already defines the full token set
on `:root` for both themes:

```css
:root{--shiki-foreground:var(--dsw-alias-label-primary);
      --shiki-background:var(--dsw-alias-markdown-code-block);
      --shiki-token-constant:#1c7ed6; --shiki-token-string:#2f9e44; ...}
```

Nothing in the repository consumes these tokens yet, so the plugin is the first
consumer. Reusing them keeps the card consistent with the product's own theming
and avoids adding a bundler dependency.

## Re-applying the dynamic-plugin form

`client.js` is also a valid dynamic-plugin body. Define a dynamic Plugin whose
**client** half is that body (the file *is* the function body — do not wrap it in
another `function`), then run it. The build does not change the dynamic contract.

Two pitfalls cost real debugging time:

- **Do not** declare `inject: ['styles']` in a *dynamic* definition. `styles` is
  an evaluator Builtin (`Builtin.listBuiltins` lists `styles.insert(css)`), not a
  Cordis service. Injecting it parks the Plugin in `state: "waiting"` forever and
  `apply()` never runs. Use the bare `styles` global. In the generated browser
  bundle there is no Builtin at all, so `build.mjs` supplies a local `styles`
  shim that injects a `<style>` tag the way every shipped client bundle does.
- Register the slot takeover at a **different priority** from the shipped
  occupant. `single` slots throw on a same-priority duplicate; the lowest
  priority renders.

When checking health of a dynamic definition, read the **top-level `state`** from
`cordis_inspect_self`, not `runtime.client.status`; only `state: "running"` means
`apply()` ran.

## Uninstall

Delete the `insert` entry from `$DSH_HOME/profiles/<name>/cordis.patch.yml` (or
the whole file back to `[]`); a live-reload profile drops the row on reload. For
a pnpm install, also `dsh plugin --profile <name> remove <this package>`.

## Upstream fix

A permanent fix belongs in
`packages/client/ui-chat/src/client/chat/ApprovalCommand.tsx`: resolve the command
from `snapshot.legacy.runningCalls` by `callId` when the Node list has no match.
The highlighting itself can reuse the existing `--shiki-token-*` variables, so it
needs no new dependency.

## License

MIT
