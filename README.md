# Squirrel with a Kölsch – three.js → ASCII

A procedural red squirrel (winter coat, ear tufts) hugging a Kölsch *Stange*, modelled in three.js and
converted into ASCII art that survives being pasted into Gmail.

## Use it

- **`final/gmail.html`**: open it in a browser (works straight from the file system), click **Copy for Gmail**,
  paste into the Gmail compose window. Options: colour, "Prost!" speech bubble, font size.
- **`final/squirrel-koelsch.txt`** / **`final/squirrel-koelsch-prost.txt`**: plain text. When pasted as plain
  text into Gmail, select it and choose the font **Fixed width**, otherwise the proportional font breaks it.

## How it is made

| Step | File | What happens |
|---|---|---|
| Model | `src/sdf.js`, `src/squirrel.js` | Smooth-union SDFs (ellipsoids, round cones, a Catmull-Rom tube for the tail) meshed with three.js' `MarchingCubes`; cone ear tufts, eyes with glints, nose, whiskers; the Stange as thick base + beer + foam with a crown. |
| G-buffer | `src/ascii.js` | Float render targets: zone id (torso, belly, head, thigh, foot, arm, paw, ear, tuft, eye, nose, tail, glass base, beer, foam), albedo, Lambert term, view normal, depth. |
| Contours | `src/ascii.js` | 1 px lines where zones an illustrator would outline meet, or where depth jumps. |
| Glyphs | `src/ascii.js` | Each cell's contour pixels are matched against Courier New bitmaps of `.,'-_\|/\()` (blurred SSD, glyph may shift inside the cell); a horizontal line hugging a cell top becomes `_` one row up. |
| Style | `src/style.js` | Stippled fur (`.` `:` by shade), white belly, hair strokes that follow the tail's centre line, foam `oO`, beer bubbles, `@` eye, tufts and whiskers as vector strokes. |
| Hand finish | `polish.py` | A short, explicit list of edits (ear, nose, paw, glass base, `KÖLSCH` label). They fit the default render only. |
| Output | `build.py`, `gmail.template.html` | Text files plus the copy page (monospace HTML, `&nbsp;` for every space, `<br>` per line, optional colour spans). |

## Commands

```sh
npm install
npm start          # http://127.0.0.1:8137 – orbit the model, "Render ASCII from this view"
npm run render     # headless Chromium: out/ascii.txt, out/zones.txt, out/beauty.png, out/contours.png, out/ascii.png
npm run build      # polish.py + build.py -> final/
npm run check      # opens final/gmail.html, screenshots the variants, checks the HTML round-trips exactly
```

`node run.mjs --cols 72 --az 0.3 --el 0.15 --opts '{"style":{"tailDensity":0.35}}'` renders other sizes, angles and
styles (without the hand finish).
