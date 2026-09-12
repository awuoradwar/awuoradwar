# M.I.L.K

**M**easured **I**ntake, **L**edger **K**eeper — a shared pumping/feeding tracker for two caregivers on different schedules — one pumps at work, the other feeds at home, and neither happens at the same moment. The app doesn't try to pair individual sessions; instead it treats every pump as a deposit and every feed as a withdrawal against a running "stash balance," and buckets today's activity into four dayparts (overnight / morning / afternoon / evening) so a same-range comparison is still meaningful even when the exact times don't line up.

**Live app:** https://claude.ai/code/artifact/901ee16a-759e-4c59-917b-68563d6136dd

## What it tracks

- **Pump sessions** (ounces, time, optional note)
- **Feed sessions** (ounces, breastmilk/formula, time, optional note)
- **Running balance** — total pumped minus total fed, so a glance shows whether you're banking a freezer stash or drawing it down
- **Daypart comparison** for today, plus a 7-day pumped-vs-fed chart
- **Daily vitamin drops** — one-tap mark-given, a streak counter, and a due indicator if it's late in the day and it hasn't been logged

## How it works

`index.html` is a single-file app published as a Claude Artifact using the `db` runtime capability, which gives both of you a shared, realtime data store tied to the page — no separate backend. Each device remembers a local "Mom" / "Dad" role (just a label for entries, switchable anytime) independent of whichever Claude account opens the page.

Two caveats worth knowing:

1. The `db` capability shares data with anyone in the same Claude organization as the artifact's owner. The simplest way to guarantee both of you see the same live ledger is opening the link while signed into the same Claude account on both phones (or granting access via the artifact's share menu if you're on a Team/Enterprise workspace together). If a device can't reach the shared store, the app falls back to a local-only ledger on that device rather than breaking — the sync indicator at the top says which mode you're in.
2. The stash balance is "since you started logging," not a lifetime freezer count — it won't know about milk you'd already banked before using the app.
