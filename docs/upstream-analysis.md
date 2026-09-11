# The defect this plugin works around

This is the analysis behind [dsh-approval-bash-highlight](../README.md). It
documents a real rendering defect in the shipped approval card, the measurement
that located its cause, two diagnoses along the way that were **wrong**, and the
change upstream should make.

## Where the command is rendered

The approval card renders its command through the
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
renders empty at exactly the moment the user needs to read the command they are
approving.

## Measured evidence

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

- `nodeIdMatch=0` — the approval's `callId` appears nowhere in `nodes` (202 settled
  records)
- `R[0].id` equals the approval's `callId` **exactly**, and carries `argsRaw`

So the in-flight call lives in **`snapshot.legacy.runningCalls`**, not in `nodes`.

## Two diagnoses that were wrong

Recorded because they cost real time and each looks plausible:

- The node list contains no `tool-call` entries during a pending approval, so the
  problem is **not** a wrong `kind` predicate that could be fixed by widening it.
- `tool-result` nodes do **not** carry the command (`cmd=false` on all 82
  sampled), so the command is **not** available by backfilling from a settled
  result.

## Suggested upstream fix

A permanent fix belongs in
`packages/client/ui-chat/src/client/chat/ApprovalCommand.tsx`: resolve the command
from `snapshot.legacy.runningCalls` by `callId` when the Node list has no match.

Requiring an exact id match with no fuzzy fallback is deliberate — in an approval
surface, "no command" is acceptable, "the wrong command" is not, because the
latter lets a user approve B while reading A.

The highlighting itself can reuse the existing `--shiki-token-*` variables
(defined in `packages/client/ui-theme/src/styles/shiki.css` on `:root`, light and
dark), so it needs no new dependency. Nothing in the tree consumes those
variables yet; this plugin is the first consumer.

Source paths above refer to the `0.1.5-rc.x` line and will move with upstream.
