/* TaskTracker — vanilla JS app. Persists to Express + SQLite backend. */

const STORAGE_KEY = "taskTracker.v1";
const STATUSES = ["todo", "doing", "done"];
const STATUS_LABELS = { todo: "Todo", doing: "Doing", done: "Done" };
const PRIORITIES = ["low", "med", "high"];

let state = seedState(); // placeholder until async load completes
let filter = { project: null, tag: null, query: "" };
let selectedTaskId = null;

/* ---------------- State ---------------- */

async function loadState() {
  try {
    const res = await fetch("/api/state");
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === "object" && data.tasks) {
        if (!data.notes) data.notes = [];
        return data;
      }
    }
  } catch (e) {
    console.warn("Server unreachable, falling back to localStorage:", e);
  }
  // Fallback: try localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const loaded = JSON.parse(raw);
      if (!loaded.notes) loaded.notes = [];
      return loaded;
    }
  } catch (e) {
    console.warn("Failed to load from localStorage:", e);
  }
  return seedState();
}

let _saveTimer = null;
function saveState() {
  // Always keep localStorage in sync as backup
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // Debounced save to server
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    }).catch((err) => console.warn("Failed to save to server:", err));
  }, 300);
}

function seedState() {
  const now = new Date();
  const iso = (d) => d.toISOString();
  const daysAgo = (n) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };
  return {
    tasks: [
      {
        id: uid(),
        title: "Refactor auth middleware for session compliance",
        description: "Legal flagged token storage — rewrite to meet new policy.",
        status: "done",
        priority: "high",
        project: "Ingest",
        tags: ["compliance", "refactor"],
        impact:
          "Shipped compliance-ready middleware; unblocked legal sign-off and reduced p99 auth latency by 30%.",
        createdAt: iso(daysAgo(14)),
        startedAt: iso(daysAgo(10)),
        completedAt: iso(daysAgo(3)),
        dailyLog: [
          { date: ymd(daysAgo(10)), note: "Scoped the new policy requirements" },
          { date: ymd(daysAgo(5)), note: "First draft of middleware done" },
        ],
      },
      {
        id: uid(),
        title: "Add CI pipeline for Jarvis plugin",
        description: "Run tests + lint on every PR.",
        status: "doing",
        priority: "med",
        project: "Jarvis",
        tags: ["infra"],
        impact: "",
        createdAt: iso(daysAgo(4)),
        startedAt: iso(daysAgo(2)),
        completedAt: null,
        dailyLog: [{ date: ymd(daysAgo(1)), note: "GitHub Actions workflow scaffolded" }],
      },
      {
        id: uid(),
        title: "Fix flaky test in search service",
        description: "Intermittent timeout on CI — likely race in setup.",
        status: "todo",
        priority: "low",
        project: "Search",
        tags: ["bug", "tests"],
        impact: "",
        createdAt: iso(daysAgo(1)),
        startedAt: null,
        completedAt: null,
        dailyLog: [],
      },
    ],
    projects: ["Ingest", "Jarvis", "Search"],
    tags: ["compliance", "refactor", "infra", "bug", "tests"],
    notes: [
      {
        id: uid(),
        content:
          "Interview prep\n\nCommon questions to prep:\n- Biggest impact last 6 months\n- A time I disagreed with a teammate\n- How I prioritize between competing asks",
        createdAt: iso(daysAgo(3)),
        updatedAt: iso(daysAgo(1)),
        pinned: false,
      },
      {
        id: uid(),
        content:
          "Scratchpad\n\nRandom notes, half-thoughts, and commands I keep forgetting.\n\nkubectl get pods -n ingest\ngit log --oneline --since='1 week ago'",
        createdAt: iso(daysAgo(7)),
        updatedAt: iso(daysAgo(5)),
        pinned: false,
      },
    ],
    settings: { theme: "dark" },
  };
}

/* ---------------- Helpers ---------------- */

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function ymd(d) {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function today() {
  return ymd(new Date());
}

function formatDay(yyyymmdd) {
  const d = new Date(yyyymmdd + "T00:00:00");
  const diff = Math.floor((new Date(today()) - d) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 1800);
}

/* ---------------- Tiny markdown renderer ---------------- */

function renderMarkdown(md) {
  if (!md || !md.trim()) {
    return `<div class="md-empty">Start typing to see preview…</div>`;
  }
  const lines = md.split("\n");
  const out = [];
  let inCode = false;
  let codeLines = [];
  let inList = null;
  let paraBuf = [];

  const flushPara = () => {
    if (paraBuf.length) {
      out.push(`<p>${inlineMd(paraBuf.join(" "))}</p>`);
      paraBuf = [];
    }
  };
  const closeList = () => {
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
  };

  for (const line of lines) {
    if (inCode) {
      if (line.startsWith("```")) {
        out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (line.startsWith("```")) {
      flushPara();
      closeList();
      inCode = true;
      continue;
    }

    const isBullet = /^- /.test(line);
    const isNumber = /^\d+\. /.test(line);

    if (isBullet || isNumber) {
      flushPara();
      const wantList = isBullet ? "ul" : "ol";
      if (inList !== wantList) {
        closeList();
        out.push(`<${wantList}>`);
        inList = wantList;
      }
      const content = isBullet ? line.slice(2) : line.replace(/^\d+\. /, "");
      out.push(`<li>${inlineMd(content)}</li>`);
      continue;
    }

    if (inList) closeList();

    if (line.startsWith("### ")) {
      flushPara();
      out.push(`<h3>${inlineMd(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      flushPara();
      out.push(`<h2>${inlineMd(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      flushPara();
      out.push(`<h1>${inlineMd(line.slice(2))}</h1>`);
    } else if (line.startsWith("> ")) {
      flushPara();
      out.push(`<blockquote>${inlineMd(line.slice(2))}</blockquote>`);
    } else if (line.trim() === "---") {
      flushPara();
      out.push("<hr>");
    } else if (line.trim() === "") {
      flushPara();
    } else {
      paraBuf.push(line);
    }
  }

  flushPara();
  closeList();
  if (inCode) {
    out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  return out.join("\n");
}

function inlineMd(text) {
  let out = escapeHtml(text);
  // Inline code first — stash to placeholders so inner ** or * don't match
  const codes = [];
  out = out.replace(/`([^`\n]+)`/g, (_m, c) => {
    codes.push(c);
    return `\x00C${codes.length - 1}\x00`;
  });
  // Bold
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  // Italic
  out = out.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  // Restore code
  out = out.replace(/\x00C(\d+)\x00/g, (_m, i) => `<code>${codes[+i]}</code>`);
  return out;
}

/* ---------------- Task CRUD ---------------- */

function addTask(title, opts = {}) {
  const t = title.trim();
  if (!t) return;
  const task = {
    id: uid(),
    title: t,
    description: opts.description || "",
    status: opts.status || "todo",
    priority: opts.priority || "med",
    project: opts.project || "",
    tags: opts.tags || [],
    impact: "",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    dailyLog: [],
  };
  state.tasks.unshift(task);
  if (task.project && !state.projects.includes(task.project)) {
    state.projects.push(task.project);
  }
  task.tags.forEach((tag) => {
    if (!state.tags.includes(tag)) state.tags.push(tag);
  });
  saveState();
  render();
  return task;
}

function updateTask(id, patch) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  Object.assign(task, patch);
  if (task.project && !state.projects.includes(task.project)) {
    state.projects.push(task.project);
  }
  (task.tags || []).forEach((tag) => {
    if (!state.tags.includes(tag)) state.tags.push(tag);
  });
  saveState();
  render();
}

function moveTask(id, newStatus) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task || task.status === newStatus) return;
  task.status = newStatus;
  const now = new Date().toISOString();
  if (newStatus === "doing" && !task.startedAt) task.startedAt = now;
  if (newStatus === "done") {
    task.completedAt = now;
    if (!task.startedAt) task.startedAt = now;
    // nudge for impact
    saveState();
    render();
    if (!task.impact) {
      setTimeout(() => openTaskEditor(task.id, { focus: "impact" }), 50);
    }
    return;
  }
  if (newStatus !== "done") task.completedAt = null;
  saveState();
  render();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  saveState();
  render();
}

function addDailyLog(taskId, note) {
  const n = note.trim();
  if (!n) return;
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  task.dailyLog = task.dailyLog || [];
  task.dailyLog.push({ date: today(), note: n });
  saveState();
  render();
}

/* ---------------- Slash menu (contenteditable) ---------------- */

const SLASH_ITEMS = [
  { id: "h1", label: "Heading 1", hint: "Large heading", icon: "H₁", action: "block", tag: "H1" },
  { id: "h2", label: "Heading 2", hint: "Medium heading", icon: "H₂", action: "block", tag: "H2" },
  { id: "h3", label: "Heading 3", hint: "Small heading", icon: "H₃", action: "block", tag: "H3" },
  { id: "text", label: "Text", hint: "Paragraph", icon: "T", action: "block", tag: "P" },
  { id: "bullet", label: "Bulleted list", hint: "• item", icon: "•", action: "list", tag: "UL" },
  { id: "numbered", label: "Numbered list", hint: "1. item", icon: "1.", action: "list", tag: "OL" },
  { id: "quote", label: "Quote", hint: "Block quote", icon: "❝", action: "block", tag: "BLOCKQUOTE" },
  { id: "code", label: "Code block", hint: "``` code ```", icon: "{}", iconStyle: "mono", action: "codeblock" },
  { id: "bold", label: "Bold", hint: "**text**", icon: "B", iconStyle: "bold", action: "inline", cmd: "bold" },
  { id: "italic", label: "Italic", hint: "*text*", icon: "I", iconStyle: "italic", action: "inline", cmd: "italic" },
  { id: "divider", label: "Divider", hint: "Horizontal line", icon: "—", action: "hr" },
];

let slashActive = false;
let slashFilter = "";
let slashIndex = 0;
let slashEditor = null;
let slashRange = null;
let slashMenuEl = null;

function filteredSlashItems() {
  const q = slashFilter.toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(
    (it) => it.label.toLowerCase().includes(q) || it.id.toLowerCase().includes(q)
  );
}

function ensureSlashMenuEl() {
  if (slashMenuEl) return slashMenuEl;
  slashMenuEl = document.createElement("div");
  slashMenuEl.className = "slash-menu hidden";
  document.body.appendChild(slashMenuEl);
  return slashMenuEl;
}

function openSlashMenu(editor) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  slashActive = true;
  slashFilter = "";
  slashIndex = 0;
  slashEditor = editor;

  // Record position of the "/" that was just typed (cursor is right after it)
  const range = sel.getRangeAt(0).cloneRange();
  try {
    range.setStart(range.endContainer, Math.max(0, range.endOffset - 1));
  } catch (e) {}
  slashRange = range;

  const { x, y } = getCaretCoordinatesCE();
  const el = ensureSlashMenuEl();
  el.style.left = Math.max(8, Math.min(x, window.innerWidth - 280)) + "px";
  el.style.top = Math.min(y, window.innerHeight - 340) + "px";
  el.classList.remove("hidden");
  renderSlashMenu();
}

function closeSlashMenu() {
  if (!slashActive) return;
  slashActive = false;
  slashFilter = "";
  slashEditor = null;
  slashRange = null;
  if (slashMenuEl) slashMenuEl.classList.add("hidden");
}

function renderSlashMenu() {
  const items = filteredSlashItems();
  if (slashIndex >= items.length) slashIndex = 0;
  const el = ensureSlashMenuEl();
  if (!items.length) {
    el.innerHTML = `<div class="slash-menu-empty">No matches</div>`;
    return;
  }
  el.innerHTML = `
    <div class="slash-menu-header">Basic blocks</div>
    ${items
      .map(
        (it, i) => `
      <div class="slash-menu-item ${i === slashIndex ? "active" : ""}" data-idx="${i}">
        <span class="icon" data-style="${it.iconStyle || ""}">${escapeHtml(it.icon)}</span>
        <span class="label">${escapeHtml(it.label)}</span>
        <span class="shortcut">${escapeHtml(it.hint)}</span>
      </div>
    `
      )
      .join("")}
  `;
  el.querySelectorAll(".slash-menu-item").forEach((n, i) => {
    n.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      applySlashItem(items[i]);
      closeSlashMenu();
    });
    n.addEventListener("mouseenter", () => {
      slashIndex = i;
      el.querySelectorAll(".slash-menu-item").forEach((x, j) =>
        x.classList.toggle("active", j === i)
      );
    });
  });
}

function getCaretCoordinatesCE() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return { x: 0, y: 0 };
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  let rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    const node =
      range.startContainer.nodeType === 3
        ? range.startContainer.parentElement
        : range.startContainer;
    if (node && node.getBoundingClientRect) rect = node.getBoundingClientRect();
  }
  return { x: rect.left, y: rect.bottom + 4 };
}

function getCurrentBlock(editor) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.anchorNode;
  while (node && node !== editor) {
    if (node.parentNode === editor) return node;
    node = node.parentNode;
  }
  return null;
}

function placeCursorAtEnd(node) {
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function removeSlashText() {
  if (!slashRange) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const current = sel.getRangeAt(0);
  const del = document.createRange();
  try {
    del.setStart(slashRange.startContainer, slashRange.startOffset);
    del.setEnd(current.endContainer, current.endOffset);
    del.deleteContents();
    const place = document.createRange();
    place.setStart(slashRange.startContainer, slashRange.startOffset);
    place.collapse(true);
    sel.removeAllRanges();
    sel.addRange(place);
  } catch (e) {}
}

function applySlashItem(item) {
  if (!slashEditor) return;
  removeSlashText();
  const editor = slashEditor;

  if (item.action === "inline") {
    document.execCommand(item.cmd, false, null);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  const block = getCurrentBlock(editor);
  if (!block) return;

  if (item.action === "block") {
    if (block.tagName === item.tag) {
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const newBlock = document.createElement(item.tag);
    newBlock.innerHTML = block.innerHTML || "<br>";
    block.replaceWith(newBlock);
    placeCursorAtEnd(newBlock);
  } else if (item.action === "list") {
    const listTag = item.tag.toLowerCase();
    const li = document.createElement("li");
    li.innerHTML = block.innerHTML || "<br>";
    const prev = block.previousElementSibling;
    if (prev && prev.tagName.toLowerCase() === listTag) {
      prev.appendChild(li);
      block.remove();
    } else {
      const list = document.createElement(listTag);
      list.appendChild(li);
      block.replaceWith(list);
    }
    placeCursorAtEnd(li);
  } else if (item.action === "codeblock") {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = block.textContent || "";
    pre.appendChild(code);
    if (!block.textContent.trim()) {
      block.replaceWith(pre);
    } else {
      block.after(pre);
      const p = document.createElement("p");
      p.appendChild(document.createElement("br"));
      pre.after(p);
    }
    placeCursorAtEnd(code);
  } else if (item.action === "hr") {
    const hr = document.createElement("hr");
    const p = document.createElement("p");
    p.appendChild(document.createElement("br"));
    block.after(hr);
    hr.after(p);
    placeCursorAtEnd(p);
  }

  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function updateSlashFilter() {
  if (!slashRange) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return closeSlashMenu();
  const current = sel.getRangeAt(0);
  const probe = document.createRange();
  try {
    probe.setStart(slashRange.startContainer, slashRange.startOffset);
    probe.setEnd(current.endContainer, current.endOffset);
  } catch (e) {
    return closeSlashMenu();
  }
  const text = probe.toString();
  if (!text.startsWith("/") || /[\s\n]/.test(text.slice(1))) {
    return closeSlashMenu();
  }
  slashFilter = text.slice(1);
  slashIndex = 0;
  renderSlashMenu();
}

/* DOM ↔ Markdown */

function domToMarkdown(editor) {
  const blocks = [];
  for (const block of editor.children) {
    const tag = block.tagName.toLowerCase();
    if (tag === "h1") blocks.push(`# ${inlineNodeToMd(block)}`);
    else if (tag === "h2") blocks.push(`## ${inlineNodeToMd(block)}`);
    else if (tag === "h3") blocks.push(`### ${inlineNodeToMd(block)}`);
    else if (tag === "blockquote") blocks.push(`> ${inlineNodeToMd(block)}`);
    else if (tag === "hr") blocks.push("---");
    else if (tag === "pre") {
      const code = block.querySelector("code") || block;
      blocks.push("```\n" + (code.textContent || "") + "\n```");
    } else if (tag === "ul") {
      const items = [];
      for (const li of block.children) items.push(`- ${inlineNodeToMd(li)}`);
      blocks.push(items.join("\n"));
    } else if (tag === "ol") {
      const items = [];
      let i = 1;
      for (const li of block.children) items.push(`${i++}. ${inlineNodeToMd(li)}`);
      blocks.push(items.join("\n"));
    } else {
      const text = inlineNodeToMd(block);
      if (text.trim()) blocks.push(text);
    }
  }
  return blocks.join("\n\n").trim();
}

function inlineNodeToMd(block) {
  let md = "";
  for (const child of block.childNodes) md += nodeToMd(child);
  return md;
}

function nodeToMd(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  const inner = Array.from(node.childNodes).map(nodeToMd).join("");
  if (tag === "strong" || tag === "b") return `**${inner}**`;
  if (tag === "em" || tag === "i") return `*${inner}*`;
  if (tag === "code") return `\`${inner}\``;
  if (tag === "br") return "\n";
  return inner;
}

/* Block-level markdown shortcuts: `# `, `## `, `### `, `> `, `- `, `1. ` */

function applyShortcuts(editor) {
  const block = getCurrentBlock(editor);
  if (!block) return;
  const tag = block.tagName.toLowerCase();
  if (tag !== "p" && tag !== "div") return;
  const text = block.textContent;

  const tryTransform = (prefix, newTag) => {
    if (!text.startsWith(prefix)) return false;
    const nb = document.createElement(newTag);
    nb.textContent = text.slice(prefix.length);
    if (!nb.textContent) nb.appendChild(document.createElement("br"));
    block.replaceWith(nb);
    placeCursorAtEnd(nb);
    return true;
  };

  if (tryTransform("### ", "H3")) return;
  if (tryTransform("## ", "H2")) return;
  if (tryTransform("# ", "H1")) return;
  if (tryTransform("> ", "BLOCKQUOTE")) return;

  if (/^- /.test(text)) {
    transformToList(block, "ul", 2);
  } else if (/^1\. /.test(text)) {
    transformToList(block, "ol", 3);
  }
}

function transformToList(block, listTag, strip) {
  const text = block.textContent.slice(strip);
  const li = document.createElement("li");
  li.textContent = text;
  if (!li.textContent) li.appendChild(document.createElement("br"));
  const prev = block.previousElementSibling;
  if (prev && prev.tagName.toLowerCase() === listTag) {
    prev.appendChild(li);
    block.remove();
  } else {
    const list = document.createElement(listTag);
    list.appendChild(li);
    block.replaceWith(list);
  }
  placeCursorAtEnd(li);
}

// Close slash menu on outside click
document.addEventListener("mousedown", (e) => {
  if (slashActive && slashMenuEl && !slashMenuEl.contains(e.target)) {
    closeSlashMenu();
  }
});

/* ---------------- Notes ---------------- */

function addNote() {
  const now = new Date().toISOString();
  const note = {
    id: uid(),
    content: "",
    createdAt: now,
    updatedAt: now,
    pinned: false,
  };
  state.notes = state.notes || [];
  state.notes.unshift(note);
  saveState();
  return note;
}

function deleteNote(id) {
  state.notes = (state.notes || []).filter((n) => n.id !== id);
  if (state._activeNoteId === id) {
    state._activeNoteId = state.notes[0]?.id || null;
  }
  saveState();
  render();
}

function noteTitle(n) {
  const firstLine = (n.content || "").split("\n").find((l) => l.trim());
  if (!firstLine) return "Untitled";
  return firstLine.trim().slice(0, 60);
}

function notePreview(n) {
  const lines = (n.content || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.slice(1).join("  ").slice(0, 120) || "No additional content";
}

function formatRelativeTime(iso) {
  if (!iso) return "";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  const d = new Date(iso);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: thisYear ? undefined : "numeric",
  });
}

/* ---------------- Rendering ---------------- */

function getView() {
  const h = (location.hash || "#board").replace("#", "");
  return STATUSES.includes(h) ? "board" : h || "board";
}

function render() {
  const view = getView();
  document.querySelectorAll(".nav-item").forEach((n) => {
    n.classList.toggle("active", n.dataset.view === view);
  });
  document.getElementById("statTotal").textContent = state.tasks.length;
  document.getElementById("statDone").textContent = state.tasks.filter(
    (t) => t.status === "done"
  ).length;
  // Hide the global task quick-add on the Notes view
  const quickAddEl = document.querySelector(".quick-add");
  if (quickAddEl) quickAddEl.style.display = view === "notes" ? "none" : "";
  const el = document.getElementById("view");
  switch (view) {
    case "board":
      renderBoard(el);
      break;
    case "today":
      renderToday(el);
      break;
    case "history":
      renderHistory(el);
      break;
    case "cpt":
      renderCpt(el);
      break;
    case "notes":
      renderNotes(el);
      break;
    case "projects":
      renderProjects(el);
      break;
    default:
      renderBoard(el);
  }
}

function filteredTasks() {
  return state.tasks.filter((t) => {
    if (filter.project && t.project !== filter.project) return false;
    if (filter.tag && !(t.tags || []).includes(filter.tag)) return false;
    if (filter.query) {
      const q = filter.query.toLowerCase();
      if (
        !t.title.toLowerCase().includes(q) &&
        !(t.description || "").toLowerCase().includes(q) &&
        !(t.project || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });
}

function renderFilterBar() {
  const projects = [...new Set(state.tasks.map((t) => t.project).filter(Boolean))];
  const tags = [...new Set(state.tasks.flatMap((t) => t.tags || []))];
  let html = `<div class="filter-bar">`;
  html += `<span class="chip ${!filter.project ? "active" : ""}" data-filter-project="">All projects</span>`;
  projects.forEach((p) => {
    html += `<span class="chip ${filter.project === p ? "active" : ""}" data-filter-project="${escapeHtml(p)}">${escapeHtml(p)}</span>`;
  });
  if (tags.length) {
    html += `<span style="width:12px"></span>`;
    html += `<span class="chip ${!filter.tag ? "active" : ""}" data-filter-tag="">All tags</span>`;
    tags.forEach((tag) => {
      html += `<span class="chip ${filter.tag === tag ? "active" : ""}" data-filter-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</span>`;
    });
  }
  html += `</div>`;
  return html;
}

function taskCardHtml(t) {
  const tagsHtml = (t.tags || [])
    .map((tag) => `<span class="card-tag">#${escapeHtml(tag)}</span>`)
    .join("");
  return `
    <div class="card" draggable="true" data-id="${t.id}" data-status="${t.status}">
      <div class="card-title">
        <span class="card-priority ${t.priority}"></span>${escapeHtml(t.title)}
      </div>
      <div class="card-meta">
        ${t.project ? `<span class="card-project">${escapeHtml(t.project)}</span>` : ""}
        ${tagsHtml}
      </div>
    </div>
  `;
}

function renderBoard(el) {
  const tasks = filteredTasks();
  const byStatus = { todo: [], doing: [], done: [] };
  tasks.forEach((t) => byStatus[t.status]?.push(t));

  el.innerHTML = `
    <div class="view-header">
      <h1>Board</h1>
      <div class="meta">${tasks.length} visible · ${state.tasks.length} total</div>
    </div>
    ${renderFilterBar()}
    <div class="board">
      ${STATUSES.map(
        (s) => `
        <div class="column" data-status="${s}">
          <div class="column-header">
            <span>${STATUS_LABELS[s]}</span>
            <span class="count">${byStatus[s].length}</span>
          </div>
          <div class="column-body" data-drop-status="${s}">
            ${byStatus[s].map(taskCardHtml).join("") ||
              `<div class="column-empty">Drop tasks here</div>`}
          </div>
        </div>
      `
      ).join("")}
    </div>
  `;

  wireFilterBar();
  wireCards(el);
  wireDropZones(el);
}

function renderToday(el) {
  const t = today();
  const worked = state.tasks.filter(
    (x) =>
      (x.startedAt && ymd(x.startedAt) === t) ||
      (x.completedAt && ymd(x.completedAt) === t) ||
      (x.dailyLog || []).some((l) => l.date === t)
  );
  const doing = state.tasks.filter((x) => x.status === "doing");

  el.innerHTML = `
    <div class="view-header">
      <h1>Today</h1>
      <div class="meta">${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
    </div>

    <div class="today-section">
      <h2>In progress</h2>
      <div class="today-list">
        ${
          doing.length
            ? doing.map(taskCardHtml).join("")
            : `<div class="muted" style="font-size:13px;">Nothing in progress. Start a task from the Board.</div>`
        }
      </div>
    </div>

    <div class="today-section">
      <h2>Worked on today</h2>
      <div class="today-list">
        ${
          worked.length
            ? worked.map(taskCardHtml).join("")
            : `<div class="muted" style="font-size:13px;">No activity logged yet today.</div>`
        }
      </div>
    </div>

    <div class="today-section">
      <h2>Quick daily log</h2>
      <div class="muted" style="font-size:12px; margin-bottom:6px;">
        Add a quick note to any in-progress task.
      </div>
      ${doing
        .map(
          (x) => `
        <div class="form-row">
          <label>${escapeHtml(x.title)}</label>
          <div class="daily-log-input">
            <input type="text" placeholder="What did you do on this today?" data-log-task="${x.id}" />
            <button class="btn btn-secondary" data-log-submit="${x.id}">Log</button>
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;

  wireCards(el);
  el.querySelectorAll("[data-log-submit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.logSubmit;
      const input = el.querySelector(`[data-log-task="${id}"]`);
      if (input.value.trim()) {
        addDailyLog(id, input.value);
        toast("Logged");
      }
    });
  });
  el.querySelectorAll("[data-log-task]").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const id = input.dataset.logTask;
        if (input.value.trim()) {
          addDailyLog(id, input.value);
          toast("Logged");
        }
      }
    });
  });
}

function renderHistory(el) {
  // Group completed tasks by completion day (most recent first)
  const done = state.tasks
    .filter((t) => t.status === "done" && t.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  // Also include daily logs as events
  const groups = {}; // ymd -> { done: [], logs: [{task, note}] }
  done.forEach((t) => {
    const d = ymd(t.completedAt);
    (groups[d] ||= { done: [], logs: [] }).done.push(t);
  });
  state.tasks.forEach((t) => {
    (t.dailyLog || []).forEach((l) => {
      (groups[l.date] ||= { done: [], logs: [] }).logs.push({ task: t, note: l.note });
    });
  });

  const sortedDays = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  el.innerHTML = `
    <div class="view-header">
      <h1>History</h1>
      <div class="meta">${done.length} completed · ${sortedDays.length} active days</div>
    </div>
    <div class="filter-bar">
      <input type="text" id="historySearch" placeholder="Search history…"
        value="${escapeHtml(filter.query)}"
        style="background:var(--bg); border:1px solid var(--border); color:var(--text); padding:6px 10px; border-radius:var(--radius-sm); font-size:13px; min-width:240px;" />
    </div>
    ${
      sortedDays.length
        ? `<div class="timeline">
        ${sortedDays
          .map((day) => {
            const g = groups[day];
            const matchedDone = g.done.filter((t) =>
              !filter.query ||
              t.title.toLowerCase().includes(filter.query.toLowerCase()) ||
              (t.project || "").toLowerCase().includes(filter.query.toLowerCase())
            );
            const matchedLogs = g.logs.filter(
              (l) =>
                !filter.query ||
                l.note.toLowerCase().includes(filter.query.toLowerCase()) ||
                l.task.title.toLowerCase().includes(filter.query.toLowerCase())
            );
            if (!matchedDone.length && !matchedLogs.length) return "";
            return `
              <div class="timeline-day">
                <h3>${formatDay(day)} <span class="day-count">${day}</span>
                  <span class="day-count">· ${matchedDone.length} done · ${matchedLogs.length} logs</span>
                </h3>
                <div class="today-list">
                  ${matchedDone.map(taskCardHtml).join("")}
                  ${matchedLogs
                    .map(
                      (l) => `
                    <div class="card" data-id="${l.task.id}" style="cursor:pointer;">
                      <div class="card-title" style="font-weight:400;">
                        <span style="color:var(--text-muted); font-size:12px;">log ·</span>
                        ${escapeHtml(l.note)}
                      </div>
                      <div class="card-meta">
                        <span class="card-project">${escapeHtml(l.task.project || "—")}</span>
                        <span class="muted">on: ${escapeHtml(l.task.title)}</span>
                      </div>
                    </div>
                  `
                    )
                    .join("")}
                </div>
              </div>
            `;
          })
          .join("")}
      </div>`
        : `<div class="empty-state"><span class="empty-state-icon">⟲</span><h3>No history yet</h3>Complete tasks to see them here.</div>`
    }
  `;

  wireCards(el);
  const search = el.querySelector("#historySearch");
  search.addEventListener("input", (e) => {
    filter.query = e.target.value;
    const cursorPos = search.selectionStart;
    render();
    const again = document.getElementById("historySearch");
    if (again) {
      again.focus();
      again.setSelectionRange(cursorPos, cursorPos);
    }
  });
}

function renderCpt(el) {
  // Default: last 6 months
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 6);
  const defaultStart = state._cptStart || ymd(start);
  const defaultEnd = state._cptEnd || ymd(end);

  const startDate = new Date(defaultStart + "T00:00:00");
  const endDate = new Date(defaultEnd + "T23:59:59");

  const projects = ["", ...new Set(state.tasks.map((t) => t.project).filter(Boolean))];
  const selectedProject = state._cptProject || "";

  const filtered = state.tasks.filter((t) => {
    if (t.status !== "done" || !t.completedAt) return false;
    const c = new Date(t.completedAt);
    if (c < startDate || c > endDate) return false;
    if (selectedProject && t.project !== selectedProject) return false;
    return true;
  });

  const byProject = {};
  filtered.forEach((t) => {
    const p = t.project || "Uncategorized";
    (byProject[p] ||= []).push(t);
  });
  const projectKeys = Object.keys(byProject).sort();

  el.innerHTML = `
    <div class="view-header">
      <h1>CPT Report</h1>
      <div class="meta">${filtered.length} completed tasks in range</div>
    </div>

    <div class="cpt-controls">
      <label>From
        <input type="date" id="cptStart" value="${defaultStart}" />
      </label>
      <label>To
        <input type="date" id="cptEnd" value="${defaultEnd}" />
      </label>
      <label>Project
        <select id="cptProject">
          ${projects
            .map(
              (p) =>
                `<option value="${escapeHtml(p)}" ${p === selectedProject ? "selected" : ""}>${p || "All projects"}</option>`
            )
            .join("")}
        </select>
      </label>
      <label style="visibility:hidden;">.<button class="btn" id="cptCopyMd">Copy Markdown</button></label>
      <div style="margin-left:auto; display:flex; gap:8px; align-items:flex-end;">
        <button class="btn" id="cptCopyMd">Copy Markdown</button>
        <button class="btn btn-secondary" id="cptCopyTxt">Copy Plain</button>
      </div>
    </div>

    ${
      projectKeys.length
        ? projectKeys
            .map(
              (p) => `
      <div class="cpt-project-group">
        <h3>${escapeHtml(p)} <span class="muted" style="font-size:12px; font-weight:normal;">· ${byProject[p].length} task${byProject[p].length === 1 ? "" : "s"}</span></h3>
        ${byProject[p]
          .map(
            (t) => `
          <div class="cpt-task" data-id="${t.id}" style="cursor:pointer;">
            <div class="cpt-task-title">${escapeHtml(t.title)}</div>
            <div class="cpt-task-impact ${t.impact ? "" : "empty"}">
              ${t.impact ? escapeHtml(t.impact) : "⚠ no impact written — click to add"}
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `
            )
            .join("")
        : `<div class="empty-state"><span class="empty-state-icon">★</span><h3>No completed tasks in range</h3>Adjust the date range or complete some tasks.</div>`
    }
  `;

  const $start = el.querySelector("#cptStart");
  const $end = el.querySelector("#cptEnd");
  const $proj = el.querySelector("#cptProject");
  [$start, $end, $proj].forEach((input) =>
    input.addEventListener("change", () => {
      state._cptStart = $start.value;
      state._cptEnd = $end.value;
      state._cptProject = $proj.value;
      render();
    })
  );

  el.querySelector("#cptCopyMd").addEventListener("click", () => {
    const md = cptToMarkdown(filtered, defaultStart, defaultEnd, byProject, projectKeys);
    navigator.clipboard.writeText(md).then(() => toast("Copied markdown to clipboard"));
  });
  el.querySelector("#cptCopyTxt").addEventListener("click", () => {
    const txt = cptToPlain(filtered, defaultStart, defaultEnd, byProject, projectKeys);
    navigator.clipboard.writeText(txt).then(() => toast("Copied plain text to clipboard"));
  });

  el.querySelectorAll(".cpt-task").forEach((n) => {
    n.addEventListener("click", () => openTaskEditor(n.dataset.id, { focus: "impact" }));
  });
}

function cptToMarkdown(tasks, start, end, byProject, keys) {
  let out = `# Performance Review — ${start} to ${end}\n\n`;
  out += `Completed ${tasks.length} tasks across ${keys.length} project${keys.length === 1 ? "" : "s"}.\n\n`;
  keys.forEach((p) => {
    out += `## ${p}\n`;
    byProject[p].forEach((t) => {
      out += `- **${t.title}**`;
      if (t.impact) out += ` — ${t.impact}`;
      out += `\n`;
    });
    out += `\n`;
  });
  return out;
}

function cptToPlain(tasks, start, end, byProject, keys) {
  let out = `Performance Review — ${start} to ${end}\n`;
  out += `Completed ${tasks.length} tasks across ${keys.length} project(s).\n\n`;
  keys.forEach((p) => {
    out += `[${p}]\n`;
    byProject[p].forEach((t) => {
      out += `  • ${t.title}`;
      if (t.impact) out += ` — ${t.impact}`;
      out += `\n`;
    });
    out += `\n`;
  });
  return out;
}

function renderProjects(el) {
  const projects = [...new Set(state.tasks.map((t) => t.project).filter(Boolean))];
  el.innerHTML = `
    <div class="view-header">
      <h1>Projects</h1>
      <div class="meta">${projects.length} projects</div>
    </div>
    ${
      projects.length
        ? `<div class="project-list">
      ${projects
        .map((p) => {
          const tasks = state.tasks.filter((t) => t.project === p);
          const done = tasks.filter((t) => t.status === "done").length;
          const doing = tasks.filter((t) => t.status === "doing").length;
          return `
            <div class="project-card" data-project="${escapeHtml(p)}">
              <h3>${escapeHtml(p)}</h3>
              <div class="project-stats">
                ${tasks.length} total · ${done} done · ${doing} in progress
              </div>
            </div>
          `;
        })
        .join("")}
    </div>`
        : `<div class="empty-state"><span class="empty-state-icon">▤</span><h3>No projects yet</h3>Add a project when you create a task.</div>`
    }
  `;
  el.querySelectorAll(".project-card").forEach((c) => {
    c.addEventListener("click", () => {
      filter.project = c.dataset.project;
      filter.tag = null;
      filter.query = "";
      location.hash = "#board";
    });
  });
}

/* ---------------- Notes view ---------------- */

function noteListItemHtml(n, active) {
  return `
    <div class="note-item ${active ? "active" : ""}" data-id="${n.id}">
      <div class="title">${escapeHtml(noteTitle(n))}</div>
      <div class="preview">${escapeHtml(notePreview(n))}</div>
      <div class="time">${escapeHtml(formatRelativeTime(n.updatedAt))}</div>
    </div>
  `;
}

function renderNotes(el) {
  const allNotes = (state.notes || [])
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const searchQuery = state._noteSearch || "";

  if (!state._activeNoteId || !allNotes.find((n) => n.id === state._activeNoteId)) {
    state._activeNoteId = allNotes[0]?.id || null;
  }

  const visible = allNotes.filter(
    (n) => !searchQuery || n.content.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const active = allNotes.find((n) => n.id === state._activeNoteId);

  if (!allNotes.length) {
    el.innerHTML = `
      <div class="view-header">
        <h1>Notes</h1>
      </div>
      <div class="empty-state">
        <span class="empty-state-icon">✎</span>
        <h3>No notes yet</h3>
        <div style="margin-bottom: 20px;">A scratchpad for ideas, meeting notes, commands — anything that isn't a task.</div>
        <button class="btn" id="notesFirstBtn">+ Create your first note</button>
      </div>
    `;
    el.querySelector("#notesFirstBtn").addEventListener("click", () => {
      const note = addNote();
      state._activeNoteId = note.id;
      render();
      setTimeout(() => {
        const ed = document.getElementById("notesEditor");
        if (ed) { ed.focus(); placeCursorAtEnd(ed); }
      }, 0);
    });
    return;
  }

  el.innerHTML = `
    <div class="view-header">
      <h1>Notes</h1>
      <button class="btn" id="notesNewBtn">+ New note</button>
    </div>
    <div class="notes-layout">
      <aside class="notes-list">
        <input type="text" class="notes-search" id="notesSearch"
          placeholder="Search notes…" value="${escapeHtml(searchQuery)}" />
        <div class="notes-list-items" id="notesListItems">
          ${
            visible.length
              ? visible.map((n) => noteListItemHtml(n, n.id === state._activeNoteId)).join("")
              : `<div class="muted" style="padding:16px; font-size:12px; text-align:center;">No matches.</div>`
          }
        </div>
      </aside>
      <section class="notes-editor">
        ${
          active
            ? `
          <div class="notes-editor-live" id="notesEditor" contenteditable="true"
            spellcheck="false" data-placeholder="Start typing… (press / for formatting)"></div>
          <div class="notes-editor-footer">
            <span id="notesUpdatedLabel">Edited ${escapeHtml(formatRelativeTime(active.updatedAt))}</span>
            <button class="btn btn-danger" id="notesDeleteBtn" style="padding:4px 10px; font-size:12px;">Delete</button>
          </div>
        `
            : `<div class="empty-state" style="padding: 60px 20px;">
            <div class="muted">Pick a note or create a new one.</div>
          </div>`
        }
      </section>
    </div>
  `;

  el.querySelector("#notesNewBtn").addEventListener("click", () => {
    const note = addNote();
    state._activeNoteId = note.id;
    state._noteSearch = "";
    render();
    setTimeout(() => {
      const ed = document.getElementById("notesEditor");
      if (ed) { ed.focus(); placeCursorAtEnd(ed); }
    }, 0);
  });

  const searchInput = el.querySelector("#notesSearch");
  searchInput.addEventListener("input", (e) => {
    state._noteSearch = e.target.value;
    const q = state._noteSearch.toLowerCase();
    const filtered = allNotes.filter((n) => !q || n.content.toLowerCase().includes(q));
    const container = document.getElementById("notesListItems");
    container.innerHTML = filtered.length
      ? filtered.map((n) => noteListItemHtml(n, n.id === state._activeNoteId)).join("")
      : `<div class="muted" style="padding:16px; font-size:12px; text-align:center;">No matches.</div>`;
    wireNoteListItems();
  });

  wireNoteListItems();

  const editor = el.querySelector("#notesEditor");
  if (editor && active) {
    // Render markdown source → HTML inside the editable surface
    if (active.content && active.content.trim()) {
      editor.innerHTML = renderMarkdown(active.content);
    } else {
      editor.innerHTML = "<p><br></p>";
    }
    editor.classList.toggle("is-empty", !editor.textContent.trim());

    let saveTimer;

    editor.addEventListener("input", (e) => {
      // Slash menu open/filter
      if (!slashActive && e.inputType === "insertText" && e.data === "/") {
        const sel = window.getSelection();
        if (sel.rangeCount) {
          const range = sel.getRangeAt(0);
          const container = range.startContainer;
          const offset = range.startOffset;
          let charBefore = "";
          if (container.nodeType === Node.TEXT_NODE && offset >= 2) {
            charBefore = container.textContent[offset - 2];
          }
          if (!charBefore || /[\s\u00A0]/.test(charBefore)) {
            openSlashMenu(editor);
          }
        }
      } else if (slashActive) {
        updateSlashFilter();
      }

      // Markdown block-level shortcuts
      applyShortcuts(editor);

      // Ensure at least one block exists for editing
      if (!editor.firstChild) {
        editor.innerHTML = "<p><br></p>";
      }
      editor.classList.toggle("is-empty", !editor.textContent.trim());

      // Serialize to markdown + save
      const note = state.notes.find((n) => n.id === state._activeNoteId);
      if (!note) return;
      note.content = domToMarkdown(editor);
      note.updatedAt = new Date().toISOString();

      const listItem = document.querySelector(`.note-item[data-id="${note.id}"]`);
      if (listItem) {
        listItem.querySelector(".title").textContent = noteTitle(note);
        listItem.querySelector(".preview").textContent = notePreview(note);
        listItem.querySelector(".time").textContent = formatRelativeTime(note.updatedAt);
      }
      const updatedLabel = document.getElementById("notesUpdatedLabel");
      if (updatedLabel) {
        updatedLabel.textContent = `Edited ${formatRelativeTime(note.updatedAt)}`;
      }

      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveState(), 400);
    });

    editor.addEventListener("keydown", (e) => {
      if (slashActive) {
        const items = filteredSlashItems();
        if (e.key === "Escape") {
          e.preventDefault();
          closeSlashMenu();
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          slashIndex = Math.min(slashIndex + 1, Math.max(0, items.length - 1));
          renderSlashMenu();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          slashIndex = Math.max(0, slashIndex - 1);
          renderSlashMenu();
          return;
        }
        if (e.key === "Enter" && items.length) {
          e.preventDefault();
          applySlashItem(items[slashIndex]);
          closeSlashMenu();
          return;
        }
      }
    });

    editor.addEventListener("paste", (e) => {
      // Force plain text paste to avoid rich HTML pollution
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text/plain");
      document.execCommand("insertText", false, text);
    });

    editor.addEventListener("blur", () => {
      clearTimeout(saveTimer);
      saveState();
      closeSlashMenu();
    });
  }

  const deleteBtn = el.querySelector("#notesDeleteBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      const note = state.notes.find((n) => n.id === state._activeNoteId);
      if (!note) return;
      if (confirm(`Delete "${noteTitle(note)}"? This cannot be undone.`)) {
        deleteNote(note.id);
        toast("Note deleted");
      }
    });
  }
}

function wireNoteListItems() {
  document.querySelectorAll(".note-item").forEach((item) => {
    item.addEventListener("click", () => {
      if (state._activeNoteId === item.dataset.id) return;
      saveState();
      state._activeNoteId = item.dataset.id;
      render();
    });
  });
}

/* ---------------- Wiring ---------------- */

function wireFilterBar() {
  document.querySelectorAll("[data-filter-project]").forEach((n) =>
    n.addEventListener("click", () => {
      filter.project = n.dataset.filterProject || null;
      render();
    })
  );
  document.querySelectorAll("[data-filter-tag]").forEach((n) =>
    n.addEventListener("click", () => {
      filter.tag = n.dataset.filterTag || null;
      render();
    })
  );
}

function wireCards(scope) {
  scope.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      card.classList.add("dragging");
      e.dataTransfer.setData("text/plain", card.dataset.id);
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("click", (e) => {
      if (card.classList.contains("dragging")) return;
      selectedTaskId = card.dataset.id;
      openTaskEditor(card.dataset.id);
    });
  });
}

function wireDropZones(scope) {
  scope.querySelectorAll("[data-drop-status]").forEach((zone) => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      const status = zone.dataset.dropStatus;
      if (id) moveTask(id, status);
    });
  });
}

/* ---------------- Task editor modal ---------------- */

function openTaskEditor(id, opts = {}) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  const modal = document.getElementById("modal");
  const content = document.getElementById("modalContent");
  document.getElementById("modalTitle").textContent = "Edit task";

  const projectOptions = [...new Set([...state.projects, task.project].filter(Boolean))];

  content.innerHTML = `
    <div class="form-row">
      <label>Title</label>
      <input type="text" id="f_title" value="${escapeHtml(task.title)}" />
    </div>
    <div class="form-row">
      <label>Description</label>
      <textarea id="f_description" rows="2">${escapeHtml(task.description || "")}</textarea>
    </div>
    <div class="form-row">
      <label>Impact (this is what shows up in your CPT)</label>
      <textarea id="f_impact" rows="2" placeholder="e.g. reduced p99 latency 30%, unblocked team X">${escapeHtml(task.impact || "")}</textarea>
    </div>
    <div class="form-row-two">
      <div class="form-row" style="margin-bottom:0;">
        <label>Project</label>
        <input type="text" id="f_project" value="${escapeHtml(task.project || "")}" list="projectDatalist" />
        <datalist id="projectDatalist">
          ${projectOptions.map((p) => `<option value="${escapeHtml(p)}">`).join("")}
        </datalist>
      </div>
      <div class="form-row" style="margin-bottom:0;">
        <label>Priority</label>
        <select id="f_priority">
          ${PRIORITIES.map(
            (p) => `<option value="${p}" ${p === task.priority ? "selected" : ""}>${p}</option>`
          ).join("")}
        </select>
      </div>
    </div>
    <div class="form-row-two">
      <div class="form-row" style="margin-bottom:0;">
        <label>Tags (comma-separated)</label>
        <input type="text" id="f_tags" value="${escapeHtml((task.tags || []).join(", "))}" />
      </div>
      <div class="form-row" style="margin-bottom:0;">
        <label>Status</label>
        <select id="f_status">
          ${STATUSES.map(
            (s) => `<option value="${s}" ${s === task.status ? "selected" : ""}>${STATUS_LABELS[s]}</option>`
          ).join("")}
        </select>
      </div>
    </div>
    <div class="form-row">
      <label>Daily log</label>
      <div class="daily-log-input">
        <input type="text" id="f_logNote" placeholder="Add a dated note for today…" />
        <button class="btn btn-secondary" id="f_logAdd">Add</button>
      </div>
      <div class="daily-log-list" id="f_logList">
        ${(task.dailyLog || [])
          .slice()
          .reverse()
          .map(
            (l) =>
              `<div class="daily-log-entry"><span class="date">${l.date}</span>${escapeHtml(l.note)}</div>`
          )
          .join("") || `<div class="muted" style="font-size:12px;">No entries yet.</div>`}
      </div>
    </div>
    <div class="modal-actions">
      <div class="left-actions">
        <button class="btn btn-danger" id="f_delete">Delete</button>
      </div>
      <div class="right-actions">
        <button class="btn btn-secondary" data-close>Cancel</button>
        <button class="btn" id="f_save">Save</button>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");

  const fTitle = content.querySelector("#f_title");
  const fImpact = content.querySelector("#f_impact");
  (opts.focus === "impact" ? fImpact : fTitle).focus();

  content.querySelector("#f_save").addEventListener("click", () => {
    saveFromModal(task.id);
    closeModal();
  });
  content.querySelector("#f_delete").addEventListener("click", () => {
    if (confirm(`Delete "${task.title}"? This cannot be undone.`)) {
      closeModal();
      deleteTask(task.id);
      toast("Task deleted");
    }
  });
  content.querySelector("#f_logAdd").addEventListener("click", () => {
    const v = content.querySelector("#f_logNote").value;
    if (v.trim()) {
      addDailyLog(task.id, v);
      openTaskEditor(task.id); // re-render modal
    }
  });
  content.querySelector("#f_logNote").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      content.querySelector("#f_logAdd").click();
    }
  });

  // Save on Cmd/Ctrl+Enter
  content.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      saveFromModal(task.id);
      closeModal();
    }
  });
}

function saveFromModal(id) {
  const g = (s) => document.getElementById(s).value;
  const tagsRaw = g("f_tags");
  const tags = tagsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const newStatus = g("f_status");
  const task = state.tasks.find((t) => t.id === id);
  const patch = {
    title: g("f_title").trim() || task.title,
    description: g("f_description"),
    impact: g("f_impact"),
    project: g("f_project").trim(),
    priority: g("f_priority"),
    tags,
  };
  // Handle status transitions with timestamps
  if (newStatus !== task.status) {
    patch.status = newStatus;
    const now = new Date().toISOString();
    if (newStatus === "doing" && !task.startedAt) patch.startedAt = now;
    if (newStatus === "done") {
      patch.completedAt = now;
      if (!task.startedAt) patch.startedAt = now;
    }
    if (newStatus !== "done") patch.completedAt = null;
  }
  updateTask(id, patch);
  toast("Saved");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
}

/* ---------------- Global wiring ---------------- */

function wireGlobal() {
  // Quick add
  const quickAdd = document.getElementById("quickAdd");
  quickAdd.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const v = quickAdd.value;
      if (v.trim()) {
        addTask(v);
        quickAdd.value = "";
        toast("Task added");
      }
    } else if (e.key === "Escape") {
      quickAdd.blur();
    }
  });

  // Modal close
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.matches("[data-close]")) closeModal();
  });

  // Mobile menu toggle
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.querySelector(".sidebar");
  menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });

  // Nav — close mobile sidebar on navigate
  document.querySelectorAll(".nav-item").forEach((n) => {
    n.addEventListener("click", () => {
      filter.project = null;
      filter.tag = null;
      filter.query = "";
      sidebar.classList.remove("open");
    });
  });

  // Hash routing
  window.addEventListener("hashchange", render);

  // Theme
  document.getElementById("themeToggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    state.settings.theme = next;
    saveState();
  });
  document.documentElement.setAttribute("data-theme", state.settings.theme || "dark");

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const modalOpen = !document.getElementById("modal").classList.contains("hidden");
    const ae = document.activeElement;
    const typing =
      ae &&
      (["INPUT", "TEXTAREA", "SELECT"].includes(ae.tagName) || ae.isContentEditable);

    if (e.key === "Escape") {
      if (modalOpen) closeModal();
      return;
    }
    if (typing || modalOpen) return;

    if (e.key === "n") {
      e.preventDefault();
      quickAdd.focus();
    } else if (e.key === "/") {
      e.preventDefault();
      quickAdd.focus();
      quickAdd.placeholder = "Search from Board, or type to add…";
    } else if (e.key === "1") location.hash = "#board";
    else if (e.key === "2") location.hash = "#today";
    else if (e.key === "3") location.hash = "#history";
    else if (e.key === "4") location.hash = "#cpt";
    else if (e.key === "5") location.hash = "#notes";
    else if (e.key === "e" && selectedTaskId) {
      openTaskEditor(selectedTaskId);
    }
  });
}

/* ---------------- Boot ---------------- */

async function boot() {
  state = await loadState();
  wireGlobal();
  if (!location.hash) location.hash = "#board";
  render();
}

boot();
