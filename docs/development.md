# Development

## Layout

| Path | Role |
|---|---|
| `client.js` | **Source of truth.** A bare statement list whose last statement returns the Cordis Plugin, so it is also a valid dynamic-plugin body. |
| `build.mjs` | The whole build: validates the body, then wraps it into the factory form and writes `lib/client.js`. No bundler, no dependency. |
| `lib/client.js` | **Generated** browser half the host serves. Committed, and CI fails if it drifts from `client.js`. |
| `lib/index.js` | Host half (empty `apply`). |
| `cordis.patch.yml` | Profile patch layer shipped with the package. |
| `verify-install.mjs` | Offline installation verification. |
| `tools/load-browser-half.mjs` | Shared harness: materializes `lib/client.js` through the real `ClientModuleSystem`. |

## Build

```sh
node build.mjs        # client.js -> lib/client.js
node verify-install.mjs
```

The build is deterministic: a rebuild that changes nothing changes no bytes, which
keeps the host's artifact revision stable.

## The slot contract

`conversation.approval.detail` is declared `kind: "single", scope: "session"` by
`ui-approval`. Two rules follow, and both are easy to get wrong:

1. A `single` slot **rejects a same-priority duplicate** — registering where the
   shipped `ui-chat` occupant already sits (`priority: 0`) throws.
2. The **lowest priority renders**, so a takeover registers below zero. This plugin
   uses `priority: -1`.

Consequence worth knowing: if another plugin also claims that slot at `-1`, its
registration throws. Only one plugin can take the card over at a given priority.

## The dynamic-plugin form

`client.js` is also a valid dynamic-plugin body. Define a dynamic Plugin whose
**client** half is that body (the file *is* the function body — do not wrap it in
another `function`), then run it. The build does not change that contract.

Two pitfalls cost real debugging time:

- **Do not** declare `inject: ['styles']` in a *dynamic* definition. `styles` is an
  evaluator Builtin (`Builtin.listBuiltins` lists `styles.insert(css)`), not a
  Cordis service. Injecting it parks the Plugin in `state: "waiting"` forever and
  `apply()` never runs. Use the bare `styles` global.
- When checking health of a dynamic definition, read the **top-level `state`** from
  `cordis_inspect_self`, not `runtime.client.status`. Only `state: "running"` means
  `apply()` ran.

In the generated browser bundle there is no `styles` Builtin at all, so `build.mjs`
supplies a local `styles` shim that injects a `<style>` tag the way every shipped
client bundle does, at materialization time.

## Safety

Highlighting must remain **presentation-only**. It must never participate in
command joining, escaping, or truncation — otherwise a highlighting change becomes
a new injection surface. The component reads a string and returns React elements;
it does not transform what is approved.

Correlation is by exact `callId`, with no ambiguous fallback. In an approval
surface, "no command" is acceptable; "the wrong command" is not.

## Limitations

Honest list, not a backlog:

- The tokenizer is a heuristic, not a shell parser. It recognises quoting,
  escapes, command substitution, heredocs, comments, redirections, keywords and
  assignments; it does not model `$'...'`, arithmetic `(( ))`, or nested quoting
  precisely.
- A line is a unit: an unterminated here-document colors the remainder as body
  text, which is the intended reading anyway.
- Token colors come from the theme's `--shiki-token-*` set; there is no per-user
  theme override.
- The plugin intentionally renders nothing when it cannot correlate the approval
  with a call, rather than falling back to a guess.
