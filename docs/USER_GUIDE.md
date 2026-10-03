# Diagram Workbench — User Guide

## 1. Starting the server

**Requirements:** Node.js 18+ (tested on Node 24) and npm.

Open a terminal in the project folder and run:

```
npm install          # first time only
npm run dev          # starts at http://localhost:3000
```

Then open the address in Chrome, Edge or Firefox.

* **Port already in use?** (error `EADDRINUSE`) — start on another port:
  `npx next dev -p 3100` and open `http://localhost:3100`.
* **Stop the server:** press `Ctrl+C` in the terminal.
* **Production mode (faster):**
  ```
  npm run build
  npm start            # http://localhost:3000   (or: npx next start -p 3100)
  ```
* **Run the tests:** `npm test` (20 automated tests on your real Markdown files).
  Browser test: start the server on port 3100, then `node tests/e2e/interaction.mjs` (needs Chrome installed).

Everything runs in your browser. Nothing is uploaded anywhere. Your diagrams are stored in the
browser's IndexedDB, so they stay after you close the tab — but only in the same browser profile.

---

## 2. The big picture

```
Markdown files  →  scan  →  find every diagram  →  Diagram Library  →  open one  →  edit  →  save  →  export
```

* Every diagram becomes its **own object** with real nodes, connectors and containers (not a picture).
* The **original source text is never changed** — not in the app, and your `.md` files are never written to.

---

## 3. Diagram Library (home page)

### Importing Markdown
* **Import Markdown files…** — pick one or many `.md` files (also `.markdown`, `.mdx`, `.txt`).
* **Drag & drop** files anywhere on the page.
* **Load bundled sample docs** — imports the five documents shipped in `public/samples`
  (ARCHITECTURE, SOFTWARE_ARCHITECTURE, CAPSTONE_METHODOLOGY_FINAL, the high-level diagram file, OPERATOR_MANUAL).

### The import dialog
Before anything is saved you see, per file: how many diagrams were found, their types, how many converted
fully / partly / not at all, and how many code or text blocks were ignored.
At the top: **Total files** and **Total diagrams**.

**Importing a file that is already in the library** — choose per file (or "apply to all"):
* **Replace existing** — overwrite (warns if you have edited diagrams from that file).
* **Create copy** — keep both.
* **Ignore** — skip it (default when the content is identical).

### Finding diagrams
Left sidebar:
* **Search** — matches name, file, heading, type and the source text itself (e.g. type `watchdog`).
* **File** filter, **Format** (Mermaid / ASCII), **Diagram type** (Flowchart, Sequence, State, Class, ASCII boxes…).
* **Status** — *Needs attention* (partly converted / reference only / failed) and *Edited by me*.
* **Sort** — document order, recently modified, or name.

### Each diagram card
| Button | What it does |
|---|---|
| **Open** (or click the name) | Opens the visual editor |
| **Source** | Shows the exact original text, with a Copy button |
| **Export ▾** | SVG, PNG, PDF, JSON or Mermaid source for that one diagram |
| **✕** | Removes the diagram from the library (the `.md` file is not affected) |

Status badges: **Editable** (fully converted), **Partly converted** (read the warning), **Reference only**
(no editable model — original is kept), **Conversion failed**. An **edited** tag appears once you save changes.

### Other library features
* **Export all ▾** — ZIP of every diagram (or of the current filtered list): SVG, SVG+JSON, PNG, or JSON.
* **“N other blocks (code / text) — review”** (per file) — lists every fenced block that was **not** turned into a
  diagram, with the reason. Outline-like blocks can be turned into a diagram with **Convert to diagram**.
  Code (C/C++, Python, JSON, bash…) is never treated as a diagram.
* **Remove file** — removes a file and its diagrams from the library. **Clear library…** removes everything.

---

## 4. The Visual Editor (graph diagrams)

Used for flowcharts, state diagrams, class/ER diagrams, mind maps and converted ASCII diagrams.

### Layout of the screen
* **Top bar** — ← Library, diagram name (click to rename), source file/type, conversion status, unsaved marker,
  **Visual | Source** tabs.
* **Toolbar** — Save, Undo, Redo, Copy, Paste, Duplicate, Delete, Zoom in/out, Fit, Align, Group, Ungroup,
  Auto-layout, Grid, Snap, Reference (ASCII only), Export, Full screen.
* **Left: Shapes panel** — Rectangle, Rounded rectangle, Circle, Ellipse, Diamond, Triangle, Cylinder, Database,
  Server, Computer, Laptop, Mobile, User, Cloud, Folder, Document, Component, Container, Text, Arrow, Connector,
  Hexagon, Stadium, Note.
* **Center: canvas** with mini-map and zoom percentage.
* **Right: Properties panel** — changes with what you select.

### Selecting
* Click an object to select **just that one** (nodes, connectors and containers are all separate objects).
* **Shift/Ctrl/Cmd + click** to add to the selection.
* **Drag on empty canvas** for a selection rectangle.
* **Ctrl/Cmd + A** selects everything.

### Moving, resizing, nudging
* Drag to move. Drag the square handles on a selected object to resize.
* **Arrow keys** nudge by 1 px (**Shift** = 10 px).
* **Snap** keeps things on the grid; **Grid** shows/hides the dots.

### Editing text
* **Double-click** a shape, container title or connector label to edit in place.
  Press **Ctrl+Enter** (or click away) to confirm, **Esc** to cancel. Enter adds a new line in shapes.
* Or use the **Label** box in the Properties panel (select an object, press **Enter**/**F2** to jump there).
* Boxes grow automatically if the new text doesn’t fit.
* Class boxes: edit name, stereotype, attributes and methods in the panel (or double-click to edit all as text:
  name, blank line, attributes, a line containing `--`, then methods).

### Adding shapes
* **Drag** a shape from the left panel onto the canvas — dropping it **inside a container** puts it in that container.
* Or **click** a shape to add it at the center of the view.
* **Arrow** / **Connector** create a free-standing line with two end points you can drag.

### Connecting
* Hover a shape: small dots appear on its four sides. **Drag from a dot to another shape** to create a connector.
* Drag a connector’s end to **re-attach** it to a different shape.
* Click a connector, then **+ label** (or double-click it) to add/edit its label.

### Connector properties (select a connector)
Label · Line (solid, dashed, dotted, thick, invisible) · Start/End arrowheads (none, arrow, open, hollow triangle,
hollow/filled diamond, circle, cross) · Route (orthogonal, curved, straight) · Width · Colour · **Reverse direction**.

### Shape and container properties
Shape type (change a rectangle into a diamond, etc.) · Fill (or “No fill”) · Border colour, width, solid/dashed ·
Text colour, size, bold, italic, left/center/right · exact Width/Height.

### Groups / containers
* Select 2+ objects → **Group** (Ctrl+G) wraps them in a container; **Ungroup** (Ctrl+Shift+G) releases them.
* Containers (including Mermaid `subgraph`s) can be moved, resized, renamed and nested.
* Dragging a shape into/out of a container re-parents it.
* Deleting a container deletes what is inside it (Undo brings it back).

### Align & distribute
Select 2+ objects → **Align ▾**: left, center, right, top, middle, bottom. Select 3+ for **distribute
horizontally/vertically**.

### Copy / paste / duplicate / delete / undo
Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D (duplicate), Delete, Ctrl+Z, Ctrl+Shift+Z (or Ctrl+Y). History holds 150 steps.
Copy/paste also works between different diagrams in the same tab.

### Auto-layout
Re-arranges everything with the hierarchical layout engine (asks first; Undo restores your positions).
A diagram is laid out automatically the first time you open it.

### Zoom & pan
Mouse wheel zooms · hold **Space** and drag, or use the **right/middle mouse button**, to pan ·
**Fit** frames the whole diagram · the mini-map (bottom right) is clickable.

### Saving
**Save** (or Ctrl+S) stores the editable model — nodes, connectors, containers, text, styles, positions — in the
browser. Reopening restores everything editable. A ● *unsaved* marker shows pending changes and the browser warns
before you close the tab or leave with unsaved edits.

---

## 5. Sequence-diagram editor

Sequence diagrams (Mermaid and ASCII lifeline charts) have their own editor:
* **Left:** *Add* buttons — Participant, Actor, Message, Note, and blocks (loop, alt, opt, par, critical, break,
  rect) — plus an **Outline** tree of everything in the diagram.
* **Center:** the diagram. **Click** any participant, message, note or block to select it.
* **Right:** properties for the selection:
  * Participant: label, kind, move left/right, delete.
  * Message: from, to, text, arrow style (solid/dashed, filled/open/cross/async), up/down, duplicate, delete.
  * Note: placement (over / left of / right of), participant(s), text.
  * Block: kind, condition, extra branches (else / and / option).
* New items are inserted **after the selected item**.
* No selection: edit the diagram name, title, and message numbering.
* Zoom/Fit, Undo/Redo, Save and Export work as in the graph editor.

---

## 6. Source tab

Click **Source** at the top of any diagram:
* **Left — Original source:** the exact text from your Markdown file, with file, line numbers, heading and hash.
  Read-only. For Mermaid, **Render reference** shows how Mermaid itself draws it, for comparison.
* **Right — Mermaid generated from the visual model:** reflects your edits. It is re-parsed and compared with the
  model: a green *Verified* banner means it round-trips exactly; an amber banner lists anything that could not be
  expressed (e.g. a *Server* shape), and the original is then what you should keep.
* **Discard edits — rebuild visual model from original source** resets the diagram to its freshly converted state.

---

## 7. ASCII diagrams

Text diagrams (boxes, arrow chains, tiers, lifeline charts) are converted when the structure is clear.
* They always carry a **confidence note** (medium/low) — ASCII art is ambiguous, so check the result.
* The original text is **docked below the canvas** (toggle with the **Reference** button) so you can compare.
* Free-form layouts that cannot be interpreted stay **reference only**: you get a *Conversion Warning* page with
  **View Original Source**, **Open Reference** and **Convert Manually** (opens a blank canvas next to the original).

---

## 8. Exporting

From a diagram’s **Export ▾** (editor or library card):

| Format | Notes |
|---|---|
| **SVG** | Vector, generated from the model (every object present) |
| **PNG** | 2× resolution |
| **PDF** | High-resolution image page sized to the diagram |
| **JSON** | The complete editable model (re-importable data, includes original source) |
| **Mermaid** | Verified generated Mermaid; if not exact, you are offered the original source instead |

**Export all** (library) produces a ZIP with numbered files like `001-ARCHITECTURE-System_Context.svg`.
Unconverted diagrams export their original text, clearly labelled.

---

## 9. Keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl/Cmd + S | Save |
| Ctrl/Cmd + Z / Ctrl/Cmd + Shift + Z (or Y) | Undo / Redo |
| Ctrl/Cmd + C / X / V | Copy / Cut / Paste |
| Ctrl/Cmd + D | Duplicate |
| Ctrl/Cmd + A | Select all |
| Ctrl/Cmd + G / Ctrl/Cmd + Shift + G | Group / Ungroup |
| Delete / Backspace | Delete selection |
| Arrow keys (Shift = ×10) | Nudge selection |
| Enter or F2 | Jump to the label field |
| Esc | Cancel text edit / deselect |
| Space + drag | Pan |
| Mouse wheel | Zoom |

All toolbar buttons have tooltips, are keyboard-focusable, and show a visible focus ring.

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `EADDRINUSE` / port in use | `npx next dev -p 3100` |
| Library is empty after reopening | You are in a different browser profile or private window (storage is per profile) |
| A diagram says *Partly converted* | Open it and expand **⚠ Conversion warning** at the bottom for exactly what was skipped |
| A diagram is *Reference only* | Use **Convert Manually**, or edit the source in your Markdown and re-import |
| Want to start over | Library → **Clear library…** |
| Moved to a new machine | Export **JSON** or **Export all**; the original `.md` files can simply be re-imported |
| Page didn’t update after code changes | Stop the server and run `npm run dev` again |

For architecture, supported syntax and known limitations see `README.md` (project root).
