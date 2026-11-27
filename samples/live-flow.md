# Live contract walkthrough

A complete pass over a real deployment of `contracts/RitualPot.py`, using only values you supply
yourself. Nothing here is pre-filled with demo data: if a step shows an empty state, that is the
truth about the contract at that moment.

Read `docs/TESTING.md` first for prerequisites (a funded wallet, a recorded address, the console).

## 0. Confirm you are talking to your contract

The live contract is [`0x1c68e84C672feFf5B5C9e336fBCDff352aCf551C`](https://explorer-studio-next.genlayer.com/address/0x1c68e84C672feFf5B5C9e336fBCDff352aCf551C). Open the console footer and check three things: the
address matches `deployments/registry.json`, the `source` line says where that address came from
(`deployments/registry.json`), and the network line matches the chain you deployed to. Then run:

```sh
python3 scripts/verify_deployment.py
```

Expected: `match` (reported as `match (line endings differ …)` for the deployed copy, which is
stored with CRLF line endings).

## 1. Open a pot (any wallet, no value attached)

Use `templates/ritual-spec.template.json` as the parameter list and replace every placeholder.

Expected: the registry card appears with status `open`, a `PotOpened` event is the newest entry in
the activity list, and `join_closes_at` is `now + join_window`.

Refusals worth recording (each one proves a rule):

- an id that already exists → `pot_id already exists`
- a stake below 1 unit → `stake must be between …`
- a ruling window that cannot fit every round of every proof → `ruling_window must fit every round …`
- a blank title or goal → `title is required`

## 2. Join (value must equal the stake exactly)

From two different wallets, join with exactly the stake.

Expected: both appear in the member list, `held` in the books doubles, and `get_schedule` reports
`can_join` until the window closes.

Refusals worth recording:

- value = stake + 1 → the call is **accepted** and the JSON says `joined: false`; `get_credit` for
  that address equals the value, and `withdraw_credit` returns it
- joining twice → refused with `already a member`
- joining a full pot → `the pot is full`
- joining one second after the window closes → `joining is closed`
- joining without value → the transaction raises (there is nothing to credit)

## 3. Post a proof during a period

From one member, submit an `https://` URL of a page you published, following
`templates/proof-page.template.md`.

Expected: `get_proof` returns the frozen text, a content hash and `total_chars`; the activity list
shows `Proved`.

Refusals worth recording:

- a second proof in the same period → `one proof per member per period`
- a non-member → `only a member can prove`
- a page longer than 1200 characters → `the proof page has N chars; at most 1200 …`
- an unreadable or non-https page → refused before anything is stored

## 4. Rule the proof after its period ends

Call `rule` for that member and period once the period has ended.

Expected: a round record with `finding: ruled`, a verdict, and an outcome of `proposed`. With
`rounds_required = 2`, call it again after `round_interval` has passed: the outcome is `final` and
`get_proof` now carries `final_verdict`.

Refusals worth recording:

- one second before the period ends → `period N ends at …`
- again before the interval passes → `the next round for this proof opens at …`
- after the final deadline → `the final deadline has passed at …; only settle is accepted`

## 5. Settle

Once every period has ended, call `settle`.

Expected before the final deadline: refused while any proof is unruled. After every proof is ruled:
status becomes `final`, `get_payouts` returns one row per member and the rows sum to
`stake x members`. A pot with fewer than two members settles as `void` and every stake comes back.

## 6. Withdraw

Each member calls `withdraw_member` once; the amount matches its payout row. The address that had a
credited join calls `withdraw_credit`.

Expected: the `withdrawn` flag flips, `held` falls by the amount, and the wallet receives the value
when the transaction is finalized. A second withdrawal of the same payout is refused.

## 7. Close the loop

- `count_pots`, `count_events` and the paged `list_pots` / `get_events` views reflect everything you
  sent, with no cap.
- `get_balance` shows `balance >= held + credits`.
- Re-run `python3 scripts/verify_deployment.py` and paste the output into the deploy record.

## Scripted reads

`samples/read-live.mjs` prints the current registry, books and newest events straight from the
recorded address, so you can diff a run against the console:

```sh
node samples/read-live.mjs
```

It refuses to run when no address is recorded, rather than inventing one.
