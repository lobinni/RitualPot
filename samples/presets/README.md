# Form presets

Three ready-made parameter sets that fill the opening form on the console home page. They exist to
make a **live** run short: press a preset, check the values, sign, and the contract does the rest.

Nothing here is pre-loaded data. The form only fills in when you press a preset, and the pot exists
only after your own transaction is accepted.

## Where they appear

Home page → section **Fix every rule before anyone joins** → the preset strip above the form.
Pressing a preset fills all eleven fields; the form stays editable afterwards.

## The presets

| Preset | Periods | Length | Stake | Members | Rounds | Join window | Ruling window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `48-hour sprint` (`sprint-48.json`) | 2 | 1 day | 1 | 4 | 2, 10 min apart | 24 h | 48 h |
| `One week study log` (`study-week.json`) | 6 | 1 day | 5 | 6 | 2, 30 min apart | 48 h | 96 h |
| `Half-day workout check` (`workout-halfday.json`) | 3 | 12 h | 2 | 3 | 1, 5 min apart | 6 h | 12 h |

Every value is inside the contract's limits, and each ruling window is at least
`members × periods × rounds × interval + 60` seconds, which is what `open_pot` enforces.

## Using one

1. Press a preset, then read the form: the goal is the sentence validators will judge against.
2. Change the **identifier** if you have already used it — an id is one-shot, and `open_pot`
   refuses a second pot with the same id (that refusal is worth recording).
3. Connect a wallet with enough value for the stake plus fees and press
   **open the ritual**.
4. Read the result banner: it comes from `get_pot` **after** the call, not from the receipt.
5. Follow `../samples/live-flow.md` from step 2 onwards.

## Proof pages

The presets fix the goal; you still publish the page yourself. Two templates you can copy verbatim:

- `../proofs/session-log.md`
- `../proofs/training-log.md`

They are also served by the console at `public/proofs/`, so once the console is on a public host
the page is at `https://<your-host>/proofs/session-log.md`. A local `localhost` URL cannot be
fetched by validators — use the raw file of a public repository or the deployed console.

## Adding a preset

Copy any file here, keep the same eleven keys as `form`, and reload the console. Presets are
imported by `src/lib/presets.ts`; add one line there and the button appears.
