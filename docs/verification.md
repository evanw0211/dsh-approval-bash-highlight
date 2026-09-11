# Verification

Two independent layers, both reproducible. Everything below was run against the
`0.1.5-rc.x` line.

## Offline — `node verify-install.mjs` (41 checks)

The harness does not re-implement the bundle contract. It resolves the installed
`@deepseek-ai/dsh-client-modules`, imports that package's own `lib/client.js`
bundle, hands it the same facade the shell's HTML bootstrap hands it, and drives a
`ClientModuleSystem` over a one-row boot manifest whose transport reads
`lib/client.js` from disk. `react` is supplied as the platform seed exactly as the
shell supplies it.

What it asserts:

| Group | Checks |
|---|---|
| Package contract | name, `type: module`, `dsh.client.platform === "web"`, `dsh.client.inject` shape, `dsh.bundle.patch`, `exports["./client"]` resolves, bundle exists, `exports["."]` exists, the shipped patch names the package, the host half exports `apply` |
| Real module system | located, `ClientModuleSystem` exported, facade switched to live registration, transport requested the manifest batch URL, bundle materialized `apply`, `inject === ["slots"]` |
| Slot takeover | stylesheet injected once, stylesheet carries the card rules, the slot declaration is awaited via `inject()`, exactly one occupant, occupant targets `conversation.approval.detail`, `priority === -1` |
| Rendering | card root, code block, one `<br>` per line break, NBSP indentation preserved, label reports lines and tokens, keywords / strings / command substitution / options / redirection / numbers / command names each get their class, assignments are not command names, a prefix assignment does not consume the command |
| No ambiguous fallback | wrong `callId` → nothing, missing `callId` → nothing, a settled node still resolves by exact id, a non-matching node is never used, a call without a command → nothing |

```
$ node build.mjs && node verify-install.mjs
build: wrote lib/client.js (18960 bytes, id dsh-approval-bash-highlight)

# package contract (dsh-approval-bash-highlight@0.1.0)
ok    package name is a string  — dsh-approval-bash-highlight
...
# slot takeover
ok    priority -1 shadows the shipped priority-0 occupant  — -1
# rendering the pending command
ok    line breaks preserved per line  — 7 <br>
ok    label reports lines and tokens  — bash · 8 lines · 61 tokens
ok    assignments are not command names
...
PASS: 0 failing check(s)
```

CI runs `node build.mjs`, `git diff --exit-code -- lib/client.js` (generated
artifact drift), and `node verify-install.mjs`.

## Online — the running host

Verified with the plugin installed into a live `web` profile as a path row
(install path B in the [README](../README.md)).

The host exposes the composed client-plugin graph over an **unauthenticated** SSE
channel, `GET /plugins/events`, served by `@deepseek-ai/dsh-client-hmr`. Before
install it listed 53 entries; after the profile patch was written and the live
reload ran, 54:

```json
{ "id": "dsh-approval-bash-highlight",
  "url": "/plugins/??dsh-approval-bash-highlight/client.js&rev=afe8182303594cf3-53",
  "inject": [] }
```

Fetching that URL returned `200`, served a valid v3 source map, and the executable
body **started byte-for-byte with `lib/client.js`** — the combo transport appends
`;\n` and a `sourceMappingURL` trailer to each bundle. That proves the running host
discovered the package, resolved its client half through the nearest ancestor
`package.json`, read *this checkout's* bundle, and is serving those exact bytes to
the browser.

The revision lifecycle was observed in both states. A newly discovered row gets an
activation-time opaque revision (`afe8182303594cf3-53`, above). After the bundle
was rebuilt, the HMR poller noticed the change, re-hashed it, and the row switched
to a **content-derived** revision:

```json
{ "id": "dsh-approval-bash-highlight",
  "url": "/plugins/??dsh-approval-bash-highlight/client.js&rev=459280377ae5",
  "inject": [] }
```

with the served body again starting byte-for-byte with the current
`lib/client.js`. So the host is not merely holding the bytes it read at install
time; it is tracking the artifact.

Reproduce:

```sh
curl -sN http://127.0.0.1:3080/plugins/events | head -2   # the graph frame
curl -s  "http://127.0.0.1:3080/plugins/??dsh-approval-bash-highlight/client.js&rev=<rev>" | head -c 200
```

### One limit of the online check

The browser half only reaches the DOM after the page reloads. Client bundles are
rebuilt by a dev watcher, not by the production host, so an already-open tab keeps
the graph it booted with. **Refresh the page** to load the plugin.
