/**
 * Approval-card shell syntax highlighting.
 *
 * A dynamic Cordis Client package. It takes over the `conversation.approval.detail`
 * slot and renders the shell command of the Tool call that is currently waiting
 * for approval, highlighted through the theme's existing shiki token variables.
 *
 * Why it replaces the shipped renderer (packages/client/ui-chat/src/client/chat/ApprovalCommand.tsx):
 * while an approval is pending, the Tool call that triggered it is NOT in the Chat
 * Node list. `snapshot.legacy.nodes` holds only settled records, so matching them
 * by kind or by id finds nothing and the command area renders empty at exactly the
 * moment the user needs to read it. The in-flight call lives in
 * `snapshot.legacy.runningCalls`, where `callId` equals the approval's `callId`.
 *
 * Correlation is by `callId` only. There is deliberately no ambiguous fallback:
 * showing a wrong command inside an approval prompt is worse than showing none.
 *
 * No shiki dependency is needed. `packages/client/ui-theme/src/styles/shiki.css`
 * already defines `--shiki-token-*` on `:root` (light and dark) plus the standard
 * `.shiki-token-*` class names, but nothing in the tree consumes them yet.
 *
 * THIS FILE IS THE SOURCE OF TRUTH and is also the dynamic-plugin body: it is a
 * bare statement list whose last statement returns the Cordis Plugin, so a
 * dynamic definition can evaluate it as-is. `build.mjs` wraps it into the CJS
 * factory form `@deepseek-ai/dsh-client-modules` serves at `lib/client.js`;
 * edit here, then run `node build.mjs`.
 */
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'in', 'function', 'select', 'time', 'coproc'])
/*
 * Reserved words that never open a command, so they are classified as keywords
 * wherever they appear: `then`, `do` and `fi` follow a `;` or a newline, which
 * is not command position, and `in` follows the `for` loop variable.
 */
const CONTINUATION_KEYWORDS = new Set(['then', 'else', 'elif', 'fi', 'do', 'done', 'esac', 'in'])
const OPERATOR_WORDS = new Set(['&&', '||', ';;', '|&'])
const NBSP = '\u00a0'

function tokenizeShell(source) {
  const text = String(source)
  const length = text.length
  const tokens = []
  let index = 0
  let heredoc = null

  while (index < length) {
    if (heredoc !== null) {
      const end = text.indexOf('\n', index)
      const stop = end === -1 ? length : end
      const chunk = text.slice(index, stop)
      const closing = chunk.trim() === heredoc
      tokens.push({ type: closing ? 'punctuation' : 'string', text: chunk })
      if (closing) heredoc = null
      index = stop
      continue
    }

    const ch = text.charAt(index)
    const next = text.charAt(index + 1)

    if (ch === '\n') { tokens.push({ type: 'whitespace', text: '\n' }); index += 1; continue }

    if (ch === ' ' || ch === '\t') {
      let cursor = index
      while (cursor < length && (text.charAt(cursor) === ' ' || text.charAt(cursor) === '\t')) cursor += 1
      tokens.push({ type: 'whitespace', text: text.slice(index, cursor) })
      index = cursor
      continue
    }

    if (ch === '#' && (index === 0 || /[\s;&|()]/.test(text.charAt(index - 1)))) {
      let cursor = index
      while (cursor < length && text.charAt(cursor) !== '\n') cursor += 1
      tokens.push({ type: 'comment', text: text.slice(index, cursor) })
      index = cursor
      continue
    }

    if (ch === '\\' && index + 1 < length) {
      tokens.push({ type: 'string', text: text.slice(index, index + 2) })
      index += 2
      continue
    }

    if (ch === "'" || ch === '"') {
      const quote = ch
      let cursor = index + 1
      while (cursor < length) {
        const current = text.charAt(cursor)
        if (quote === '"' && current === '\\') { cursor += 2; continue }
        if (current === quote) { cursor += 1; break }
        cursor += 1
      }
      tokens.push({ type: 'string', text: text.slice(index, cursor) })
      index = cursor
      continue
    }

    if (ch === '`') {
      let cursor = index + 1
      while (cursor < length) {
        const current = text.charAt(cursor)
        if (current === '\\') { cursor += 2; continue }
        if (current === '`') { cursor += 1; break }
        cursor += 1
      }
      tokens.push({ type: 'embedded', text: text.slice(index, cursor) })
      index = cursor
      continue
    }

    if (ch === '$') {
      if (next === '{') {
        let cursor = index + 2
        let depth = 1
        while (cursor < length && depth > 0) {
          const current = text.charAt(cursor)
          if (current === '{') depth += 1
          else if (current === '}') depth -= 1
          cursor += 1
        }
        tokens.push({ type: 'variable', text: text.slice(index, cursor) })
        index = cursor
        continue
      }
      let cursor = index + 1
      const head = text.charAt(cursor)
      if (head === '(') {
        let depth = 0
        while (cursor < length) {
          const current = text.charAt(cursor)
          if (current === '(') depth += 1
          else if (current === ')') {
            depth -= 1
            if (depth === 0) { cursor += 1; break }
          }
          cursor += 1
        }
        tokens.push({ type: 'string-expression', text: text.slice(index, cursor) })
        index = cursor
        continue
      }
      if (/[A-Za-z_]/.test(head)) {
        while (cursor < length && /[A-Za-z0-9_]/.test(text.charAt(cursor))) cursor += 1
        tokens.push({ type: 'variable', text: text.slice(index, cursor) })
        index = cursor
        continue
      }
      if (/[0-9]/.test(head)) {
        while (cursor < length && /[0-9]/.test(text.charAt(cursor))) cursor += 1
        tokens.push({ type: 'variable', text: text.slice(index, cursor) })
        index = cursor
        continue
      }
      if (/[?@*#!$-]/.test(head)) {
        tokens.push({ type: 'variable', text: text.slice(index, index + 2) })
        index += 2
        continue
      }
      tokens.push({ type: 'punctuation', text: ch })
      index += 1
      continue
    }

    if (ch === '<' && next === '<') {
      let cursor = index + 2
      if (text.charAt(cursor) === '-') cursor += 1
      while (cursor < length && (text.charAt(cursor) === ' ' || text.charAt(cursor) === '\t')) cursor += 1
      const head = text.charAt(cursor)
      if (head === '"' || head === "'") {
        const quote = head
        cursor += 1
        while (cursor < length && text.charAt(cursor) !== quote) cursor += 1
        cursor += 1
      } else {
        while (cursor < length && /[A-Za-z0-9_]/.test(text.charAt(cursor))) cursor += 1
      }
      const whole = text.slice(index, cursor)
      const delimiter = whole.replace(/^<<-?\s*/, '').replace(/["']/g, '')
      tokens.push({ type: 'keyword', text: whole })
      heredoc = delimiter === '' ? null : delimiter
      index = cursor
      continue
    }

    if (/[0-9]/.test(ch)) {
      let cursor = index
      while (cursor < length && /[0-9.]/.test(text.charAt(cursor))) cursor += 1
      tokens.push({ type: 'number', text: text.slice(index, cursor) })
      index = cursor
      continue
    }

    if (ch === '&' || ch === '|' || ch === ';' || ch === '<' || ch === '>') {
      let cursor = index
      while (cursor < length && /[&|;<>]/.test(text.charAt(cursor))) cursor += 1
      const run = text.slice(index, cursor)
      tokens.push({ type: run.length > 1 && !OPERATOR_WORDS.has(run) ? 'keyword' : 'operator', text: run })
      index = cursor
      continue
    }

    if (/[A-Za-z0-9_./~@%+,:=^]/.test(ch) || (ch === '-' && /[A-Za-z0-9_]/.test(next))) {
      let cursor = index
      while (cursor < length && /[A-Za-z0-9_./~@%+,:=^|$\\-]/.test(text.charAt(cursor))) cursor += 1
      tokens.push({ type: 'word', text: text.slice(index, cursor) })
      index = cursor
      continue
    }

    if (/^[{}()\[\]]$/.test(ch)) {
      tokens.push({ type: 'punctuation', text: ch })
      index += 1
      continue
    }

    tokens.push({ type: 'operator', text: ch })
    index += 1
  }

  let commandPending = true
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token.type === 'whitespace') {
      if (token.text.indexOf('\n') !== -1) commandPending = true
      continue
    }
    if (token.type === 'comment') { commandPending = true; continue }
    if (token.type === 'word') {
      const isAssignment = tokens[i + 1] !== undefined && tokens[i + 1].text === '='
      if (isAssignment) token.type = 'parameter'
      else if (token.text.charAt(0) === '-') token.type = 'parameter'
      /*
       * Shell keywords arrive here as ordinary words, so this is where they must
       * be recognised — the `keyword` branch below only ever sees operators and
       * heredoc markers. Without this, `if`/`for` classify as command names and
       * KEYWORDS is dead code.
       */
      else if (KEYWORDS.has(token.text) && (commandPending || CONTINUATION_KEYWORDS.has(token.text))) {
        token.type = 'keyword'
        commandPending = false
      } else if (commandPending) { token.type = 'function'; commandPending = false }
      else token.type = 'plain'
      continue
    }
    if (commandPending && (token.type === 'operator' || token.type === 'punctuation')) continue
    if (commandPending && (token.type === 'variable' || token.type === 'string' || token.type === 'embedded' || token.type === 'number')) {
      commandPending = false
      continue
    }
    if (commandPending && token.type === 'keyword' && KEYWORDS.has(token.text)) {
      commandPending = false
      continue
    }
    if (commandPending) commandPending = false
  }

  return tokens
}

/**
 * Flatten tokens into renderable units. A line break becomes an explicit marker
 * so it can never be lost; runs of spaces become non-breaking characters so a
 * long command cannot collapse its own indentation.
 */
function toUnits(tokens) {
  const units = []
  for (const token of tokens) {
    const pieces = token.text.split('\n')
    for (let i = 0; i < pieces.length; i += 1) {
      if (i > 0) units.push({ newline: true })
      if (pieces[i] === '') continue
      if (token.type === 'whitespace') {
        units.push({ type: 'whitespace', text: pieces[i].split(' ').join(NBSP).split('\t').join(NBSP + NBSP) })
      } else {
        units.push({ type: token.type, text: pieces[i] })
      }
    }
  }
  return units
}

function commandFromArgs(args) {
  if (args === null || typeof args !== 'object') return undefined
  if (typeof args.command === 'string') return args.command
  if (typeof args.cmd === 'string') return args.cmd
  if (typeof args.script === 'string') return args.script
  return undefined
}

function commandOfHead(head) {
  if (head === null || head === undefined) return undefined
  if (typeof head.argsRaw !== 'string') return undefined
  try {
    return commandFromArgs(JSON.parse(head.argsRaw))
  } catch (error) {
    return undefined
  }
}

/**
 * Resolve the pending command by exact callId.
 *
 * `legacy.runningCalls` is the primary source: a call still awaiting approval has
 * not landed in `legacy.nodes`. The Node list is checked second for the settled
 * case, and it also requires an exact id match.
 *
 * @param snapshot - Chat snapshot delivered by the `useChat` selector hook.
 * @param callId - Approval owner prop identifying the correlated Tool call.
 * @returns the shell command, or undefined when no exact correlation exists.
 */
function findCommand(snapshot, callId) {
  if (snapshot === null || snapshot === undefined) return undefined
  const legacy = snapshot.legacy
  if (legacy === null || legacy === undefined) return undefined
  if (callId === undefined) return undefined

  const running = legacy.runningCalls
  if (Array.isArray(running)) {
    for (const call of running) {
      if (call === null || call === undefined) continue
      if (call.callId !== callId) continue
      const found = commandOfHead(call)
      if (found !== undefined) return found
    }
  }

  const nodes = legacy.nodes
  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      if (node === null || node === undefined) continue
      if (node.callId !== callId) continue
      const found = commandOfHead(node.call)
      if (found !== undefined) return found
    }
  }

  return undefined
}

function classOf(type) {
  if (type === 'plain' || type === 'whitespace' || type === 'word') return null
  if (type === 'operator' || type === 'punctuation') return 'shiki-token-punctuation'
  if (type === 'number') return 'shiki-token-constant'
  if (type === 'embedded' || type === 'string-expression' || type === 'variable') return 'shiki-token-string-expression'
  return 'shiki-token-' + type
}

function renderUnits(units) {
  const children = []
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i]
    if (unit.newline === true) {
      children.push(React.createElement('br', { key: 'n' + String(i) }))
      continue
    }
    const cls = classOf(unit.type)
    if (cls === null) children.push(unit.text)
    else children.push(React.createElement('span', { key: 't' + String(i), className: cls }, unit.text))
  }
  return children
}

function ApprovalCommand({ callId, useChat }) {
  const command = useChat((snapshot) => findCommand(snapshot, callId))
  if (typeof command !== 'string' || command.trim() === '') return null
  const tokens = tokenizeShell(command)
  const units = toUnits(tokens)
  const label = 'bash \u00b7 ' + String(command.split('\n').length) + ' lines \u00b7 ' + String(tokens.length) + ' tokens'
  return React.createElement('div', { className: 'hl_root' },
    React.createElement('div', { className: 'hl_head' },
      React.createElement('span', { className: 'hl_lang' }, label)),
    React.createElement('pre', { className: 'hl_pre shiki' }, renderUnits(units)),
  )
}

const CSS = [
  '.hl_root{margin:0;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--shiki-background,var(--dsw-alias-markdown-code-block));overflow:hidden}',
  '.hl_head{display:flex;justify-content:flex-end;padding:6px 10px 0}',
  '.hl_lang{color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code);font-size:11px;line-height:16px}',
  '.hl_pre{margin:0;padding:2px 12px 12px;color:var(--shiki-foreground,var(--dsw-alias-label-primary));font-family:var(--ds-font-family-code);font-size:13px;line-height:20px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal}',
  '.shiki-token-keyword{color:var(--shiki-token-keyword)}',
  '.shiki-token-string{color:var(--shiki-token-string)}',
  '.shiki-token-string-expression{color:var(--shiki-token-string-expression)}',
  '.shiki-token-comment{color:var(--shiki-token-comment)}',
  '.shiki-token-constant{color:var(--shiki-token-constant)}',
  '.shiki-token-function{color:var(--shiki-token-function)}',
  '.shiki-token-parameter{color:var(--shiki-token-parameter)}',
  '.shiki-token-punctuation{color:var(--shiki-token-punctuation)}',
].join('')

/*
 * `styles` is an evaluator Builtin, not a Cordis service. Declaring it in `inject`
 * parks the Plugin in `waiting` forever and apply() never runs. Read `slots` as a
 * soft optional service instead.
 */
return {
  apply(ctx) {
    styles.insert(CSS)
    const slots = ctx.get('slots')
    if (slots === undefined) {
      console.error('ui-approval-hl: slots unavailable')
      return
    }
    /*
     * `conversation.approval.detail` is declared `kind: "single"` by ui-approval,
     * and the shipped ApprovalCommand (ui-chat) already occupies it at the
     * default priority 0. A single slot rejects a same-priority duplicate
     * ("already has a registration at priority 0"), and the LOWEST priority
     * renders — so taking the card over means registering below 0, not at 0.
     */
    slots.inject('conversation.approval.detail', () => slots.register(
      { name: 'conversation.approval.detail', priority: -1 },
      ApprovalCommand,
    ))
  },
}
