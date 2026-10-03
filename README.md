# Markdown Diagram Extraction & Editable Diagram Web App

Turn the diagrams buried in your Markdown documentation into **real, individually editable diagrams** — nodes,
connectors, containers and text, not screenshots.

```
Upload Markdown → scan → find every diagram → diagram library → open one → edit visually → save → export
```

Built with **Next.js, React, JavaScript, Tailwind CSS** and **React Flow**. Everything runs in the browser:
no server-side storage, nothing is uploaded, and your Markdown files are never modified.

---

## Features

| Area | What you get |
|---|---|
| **Extraction** | Scans fenced blocks, finds Mermaid and ASCII diagrams, ignores normal code (C/C++, Python, JSON, bash…), names each diagram from its nearest heading, records source file, line range and hash |
| **Library** | All diagrams listed per file; search (including source text); filter by file, format, type, status; sort; per-diagram Open / Source / Export; duplicate-file handling (Replace / Create copy / Ignore) |
| **Mermaid → editable** | flowchart/graph, stateDiagram(-v2), sequenceDiagram, classDiagram, erDiagram, mindmap. Subgraphs → nested containers, edge labels, line/arrow styles, `classDef` colours, shapes (`[]`, `()`, `([])`, `[()]`, `(())`, `{}`, `{{}}`…) |
| **ASCII → editable** | Box-and-connector drawings (Unicode and `+--+`), lifeline sequence charts, vertical tier stacks, arrow chains, tree outlines — each with a confidence rating and the original shown as a reference |
| **Graph editor** | Select / multi-select, drag, resize, edit text in place, add shapes (24 types, drag-and-drop into containers), connect and re-attach connectors, group/ungroup, align/distribute, copy/paste/duplicate, undo/redo (150 steps), grid + snap, zoom/pan, mini-map, full screen |
| **Styling** | Fill, border colour/width/dash, text colour/size/bold/italic/alignment, connector line type, arrowheads, routing, width and colour |
| **Sequence editor** | Participants, actors, messages (6 arrow styles), notes, loop/alt/opt/par/critical/break/rect blocks, outline tree |
| **Source tab** | Exact original text (read-only) next to Mermaid regenerated from your edits, with automatic round-trip verification |
| **Persistence** | Saves the editable model (not images) to IndexedDB; reopening restores every node, connector, container and text |
| **Export** | SVG (generated from the model), PNG, PDF, JSON, Mermaid; **Export all** as a ZIP |
| **Resilience** | One broken diagram never affects the others; unsupported or low-confidence conversions are flagged, never faked |

---

## Quick start

**Requirements:** Node.js 18+ and npm.

```bash
git clone https://github.com/chinmoy567/Markdown-Diagram-Extraction-and-Editable-Diagram-Web-App.git
cd Markdown-Diagram-Extraction-and-Editable-Diagram-Web-App
npm install
npm run dev
```

Open **http://localhost:3000** (if the port is busy: `npx next dev -p 3100`).

Then click **Load bundled sample docs** to import the five included documents (27 diagrams), or
**Import Markdown files…** / drag and drop your own `.md` files.

Production build: `npm run build && npm start`.

> Full walkthrough of every feature: **[USER_GUIDE.md](USER_GUIDE.md)**

---

## How it works

```
Markdown ─ lib/markdown/parser.js     fenced blocks, headings, exact line ranges (read-only)
         ─ lib/markdown/detector.js   mermaid | ascii | candidate | text | code
         ─ lib/markdown/extractor.js  one Diagram object per diagram, stable ids from file + source hash
Converters (never throw — failures become status "failed" / "reference")
         ─ lib/mermaid/*              hand-written parsers + verified generator
         ─ lib/ascii/*                boxes, lifelines, tiers, chains, trees
Model    ─ lib/diagrams/*             schema, serializer, ELK auto-layout (nested groups)
Editor   ─ components/diagram-editor  React Flow graph editor + SVG sequence editor
Render   ─ lib/render/*               pure SVG builders shared by the editor and the exporters
Export   ─ lib/export/*               SVG / PNG / PDF / JSON / Mermaid / ZIP
Storage  ─ lib/storage/*              IndexedDB behind a small async interface (swap for a backend later)
```

**Diagram model** (extensible JSON):

```json
{
  "id": "d-ea383ef1b1",
  "name": "System Context",
  "kind": "graph",
  "source": { "format": "mermaid", "type": "flowchart", "content": "…original, never modified…" },
  "sourceFile": "ARCHITECTURE.md",
  "status": "converted",
  "canvas": { "width": 1600, "height": 1000, "zoom": 1 },
  "nodes":  [{ "id": "A", "shape": "rectangle", "label": "Arduino", "x": 0, "y": 0, "width": 140, "height": 56, "parentId": "PI", "style": {} }],
  "edges":  [{ "id": "e1", "source": "A", "target": "B", "label": "UART", "style": { "lineType": "solid", "arrowEnd": "arrow" } }],
  "groups": [{ "id": "PI", "label": "RASPBERRY PI 4", "x": 0, "y": 0, "width": 400, "height": 300 }],
  "metadata": { "sourceHeading": "System Context", "sourceLine": 16, "sourceHash": "…" }
}
```

**Why React Flow:** native custom nodes/edges, parent-child groups (= Mermaid subgraphs), resizing, multi-select,
zoom/pan, edge reconnection and JSON-serialisable state. Exports are generated from the model, not from a DOM screenshot.

---

## Testing

```bash
npm test                              # 20 automated tests against the real documents
node tests/e2e/interaction.mjs        # browser test: select, drag, edit, undo, save, reload, export
                                      # (start the app on port 3100 first; requires Chrome)
```

The tests cover extraction counts, every diagram type, subgraphs, edge labels, ASCII conversion, code-block rejection,
broken input, edit → save → reload, SVG validity, source preservation byte-for-byte, stable IDs and SVG escaping.

---

## Limitations (by design, stated honestly)

* **ASCII conversion is heuristic.** Results are marked *medium* or *low* confidence with the original shown beside
  them. Free-form layouts that cannot be interpreted stay *reference only* — use **Convert Manually**.
* Outline-style `├─` blocks are mostly prose and are **not** auto-extracted; they are listed for review and can be
  converted on demand.
* Mermaid types without an editor (gantt, pie, journey, gitGraph, timeline…) are kept as reference only.
* Unsupported Mermaid features (`click`, `create/destroy`, `box`, state concurrency) raise a visible warning.
* PDF export is a high-resolution image of the model-derived SVG.
* Persistence is per browser profile; writing edits back into the Markdown is intentionally not implemented.

## Security

Markdown is treated as untrusted text: no `eval`, Mermaid is not executed to build models, colours are whitelisted,
all text is XML-escaped in SVG, and the optional Mermaid reference render uses `securityLevel: 'strict'` plus DOMPurify.

## Project layout

```
app/                  Next.js routes (library, editor)
components/           diagram-editor, diagram-library, markdown-import, shape-panel, source-editor
lib/                  markdown, mermaid, ascii, diagrams, render, export, storage
public/samples/       the five sample documents used for the demo import
tests/                node:test suite + tests/e2e browser tests
*.md (root)           the original sample documentation used as real test data
```
