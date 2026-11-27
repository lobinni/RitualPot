# Contract interface

`contracts/RitualPot.py` — class `RitualPot`. Every write returns a JSON string; every view
returns a JSON string or an integer; every refusal raises `gl.vm.UserError` with a sentence that
says what was expected. All amounts are integers in wei, all times are unix seconds in UTC.

## Writes

### `open_pot(pot_id, title, goal, periods, period_len, stake, max_members, rounds_required, round_interval, join_window, ruling_window)`

Fixes every rule of the pot. Not payable: nobody is charged here.

| Argument | Bounds |
| --- | --- |
| `pot_id` | 1–64 chars of `a–z 0–9 - _ / .`, unique |
| `title` | 1–80 chars, non-empty after collapsing whitespace |
| `goal` | 1–500 chars, the sentence validators judge against |
| `periods` | 2–6 |
| `period_len` | 60–2 592 000 seconds |
| `stake` | 1 000 000 000 000 000 000 – 1 000 000 000 000 000 000 000 000 wei |
| `max_members` | 2–8 |
| `rounds_required` | 1 or 2 |
| `round_interval` | 60–2 592 000 seconds |
| `join_window` | 60–2 592 000 seconds |
| `ruling_window` | 60–2 592 000 seconds, and at least `max_members × periods × rounds_required × round_interval + 60` |

Derived: `join_closes_at = now + join_window`, `final_deadline = join_closes_at + periods × period_len + ruling_window`.

Returns `{"opened": true, "pot_id": …, "join_closes_at": …}`.

Refused: duplicate id, any argument outside its bounds, a ruling window that cannot fit every round
of every proof.

### `join(pot_id)` — payable

Escrows exactly `stake` and adds the caller as the next member, strictly before `join_closes_at`.

With value attached this method **never raises**. Anything it cannot accept is refused in the
returned JSON and the value is credited to the sender:

```json
{"joined": false, "credited": "…", "reason": "the pot is full"}
```

Refusals (returned, not raised): unknown `pot_id`, pot already settled, joining closed, pot full,
already a member, value not equal to the stake.
Raised only when no value is attached: there is nothing to credit.

### `prove(pot_id, proof_url, note)`

One proof per member per period, only while that period is running, only for a member, only after
the join window closed and only while the pot has at least two members. The page is fetched once,
kept whole when at most 1 200 characters, hashed with sha256 and stored with the note (160 chars
max). A page that is longer, empty or unreadable is refused before anything is stored.

Returns `{"member": …, "period": …, "content_hash": …}`.

### `rule(pot_id, member, period)`

One ruling round for one proof. Callable by anyone, only while the pot is open, only before
`final_deadline`, only once the proof's period has ended, and at most once per `round_interval`.

The round returns a `finding` of `ruled` or `unclear`. When ruled, the standing verdict either
gains a confirmation, restarts the count, or reaches `rounds_required` and becomes the
`final_verdict`. An unclear round moves nothing and is stored as evidence.

Returns `{"finding": …, "verdict": …, "outcome": …, "period": …}` where `outcome` is one of
`proposed`, `confirmed`, `restarted`, `final`, `no_progress`.

Refused: settled pot, deadline passed, no such proof, period not ended, proof already ruled,
interval not elapsed, or a consensus answer the contract's own check rejects.

### `settle(pot_id)`

Writes the payouts. Callable by anyone, only after the join window closed and after the last
period ended.

- Before `final_deadline`: refused while any proof is unruled.
- From `final_deadline` on: always accepted; an unruled proof counts as not met.
- Fewer than two members: the pot settles `void` and every stake is returned in full.

`done = count of periods with a final met`; `refund = stake × done // periods`; the remainder is
split equally between the members with the highest `done`, the dust to the first of them in join
order. If nobody kept a period, everyone is a winner of an empty pool and gets exactly their stake
back. The rows always sum to `stake × members`.

Returns `{"status": "final" | "void", …}`.

### `withdraw_member(pot_id)`

The member takes the payout the books name, once. Refused unless the pot is settled, the caller is
a member, the payout has not been taken yet, and the contract balance covers it. The value is sent
as an external transfer after the books are updated.

### `withdraw_credit()`

Returns everything `join` credited to the caller, in full, once it is above zero.

## Views

| Method | Returns |
| --- | --- |
| `get_pot(pot_id)` | the whole pot record, or `{"error": "unknown pot_id"}` |
| `get_member(pot_id, index)` | one member record, or an error object |
| `get_proof(pot_id, member, period)` | the frozen page, hash, rounds, standing and final verdict, or an error object |
| `get_round(pot_id, member, period, round_no)` | one ruling round, or an error object |
| `get_payouts(pot_id)` | `{"settled", "status", "rows": [{index, address, done, refund, bonus, payout, withdrawn}]}`; empty rows while open |
| `get_schedule(pot_id)` | now, status, members, `join_closes_at`, `periods_end`, `final_deadline`, `current_period`, `can_join`, `can_prove`, `can_rule`, `unruled`, `next_round_at`, `can_settle`, `can_withdraw` |
| `count_pots()` | number of pots ever opened |
| `list_pots(offset, limit)` | `{"total", "offset", "items": [[pot_id, status], …]}`, at most 50 per call |
| `get_credit(address)` | wei credited to that address, as a string |
| `get_balance()` | `{"balance", "held", "credits"}` |
| `count_events()` | number of events ever recorded |
| `get_events(offset, limit)` | `{"total", "offset", "items": […]}`, at most 50 per call |

## Schedule

`get_schedule` is the only place the console asks "what may I do now", and it is derived from one
clock:

```
can_join   pot open, now < join_closes_at, members < max_members
can_prove  pot open, at least two members, a period is running
can_rule   pot open, now < final_deadline, and some unruled proof has ended its period and its interval
can_settle pot open, joining closed, and (fewer than two members, or every period ended and
           (nothing unruled, or the final deadline passed))
```

`can_rule` and `can_settle` are never true together.
