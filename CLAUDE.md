@AGENTS.md

# Standing QA checks (do these proactively, not just when asked)

- **Narrow-viewport layout check on any UI touching a header/row that mixes
  dynamic-length text with a fixed-size element** (buttons, badges, icons):
  render at ~360-390px width and confirm nothing overlaps or gets pushed
  off-screen. A flex row with `justify-between` does NOT automatically
  protect a text sibling from a fixed-width sibling — the text needs
  `min-w-0 truncate` (or `flex-1 min-w-0 truncate`), AND every flex/grid
  ancestor up the chain to the nearest constrained-width container needs
  `min-w-0` too (a `<div>`'s default `min-width: auto` floors it at its
  content's min-content size when overflow is visible, which silently
  defeats a lower-level truncate/shrink fix and can blow out the whole
  page's width instead of just that one row). Verify by checking
  `document.body.scrollWidth` equals the viewport width, not just by eyeballing
  a screenshot that happens to fit.
- More generally: after any visual/layout change, don't assume a fix is
  correct just because it looks right in isolation — actually screenshot
  (or computed-style check) at the real narrow width this app is used at,
  since these are kiosk/phone screens, not desktop.
