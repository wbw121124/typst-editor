// Welcome to Typst Editor!
// Workspace: ./typst/
#set page(paper: "a4", margin: (x: 2.5cm, y: 2.5cm))
#set text(size: 12pt, font: ("IBM Plex Serif", "Noto Sans CJK SC", "Noto Serif CJK SC"))

= Hello, Typst!

This is a live preview editor for *Typst* documents.

== Features

- File management in `./typst/` workspace
- Live preview as you type
- Syntax highlighting via Monaco Editor
- Export to SVG or PDF

== Math Example

$ integral_0^oo e^(-x^2) dif x = sqrt(pi) $

== Table Example

#table(
  columns: 3,
  [Name], [Age], [City],
  [Alice], [30], [New York],
  [Bob], [25], [London],
  [Charlie], [35], [Tokyo],
)

s