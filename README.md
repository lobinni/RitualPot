# RitualPot

**A group stake that pays the people who kept their ritual.**

## Summary

Everyone stakes the same amount, each member freezes one proof page per period, validators answer only `met` or `not_met` against a goal fixed before anyone joined, and the contract splits the money: a refund follows the periods kept, and what the others forfeit goes to the members who kept the most. No setters, no owner, no capped registry, and a pot that always settles.

## How it works

```
open_pot(pot_id, title, goal, periods, period_len, stake, max_members,
         rounds_required, round_interval, join_window, ruling_window)     anyone; fixes every rule; not payable
join(pot_id)               PAYABLE: exactly `stake`, strictly BEFORE the join window closes.
                           Anything else (wrong amount, closed, full, already a member, unknown pot)
                           never reverts: the value becomes a credit
prove(pot_id, url, note)   a member, DURING a period, one proof per member per period;
                           the page (at most 1200 characters) is frozen whole on chain
rule(pot_id, member, period)  anyone, once that period has ended and before the final deadline: one ruling
                           round of one proof. Validators answer `met` or `not_met`. With
                           rounds_required = 2 the same answer must come twice, a full interval apart
settle(pot_id)             anyone, after the last period. Before the final deadline only when every proof
                           is ruled; from it on always (an unruled proof counts as not met).
                           done = periods with a final `met`; refund = stake * done // periods; what is
                           forfeited goes equally to the members with the most periods kept, the dust to
                           the first of them. Nobody kept a period -> everybody gets their stake back.
                           Fewer than two members -> VOID, every stake comes back
withdraw_member(pot_id)    each member, once: what the books name
withdraw_credit()          take back what a join refused to escrow
get_round(pot_id, member, period, k)   every ruling round, kept for good
list_pots(offset, limit) / get_events(offset, limit)   paged, no global cap
```

The sequence in one line: **open → join → prove (once per member per period) → rule (rounds agree) → settle → withdraw**, with a credit trail for any join the contract could not escrow.

Three properties the sequence guarantees:

1. Rules are written before anyone joins, so no member can be surprised by a change later.
2. `rule` stops at the final deadline and `settle` before it only when nothing is left to rule —
   `get_schedule` never offers both, so transaction order cannot choose who is paid.
3. Payouts of a pot always add up to the stakes that went in, checked by 400 random settlements in
   the offline suite.

## What the steward should see after following the instructions

Run the commands in this order and compare the output with the table.

| Instruction | What you must see |
| --- | --- |
| `sh scripts/lint_contract.sh` | `all 16 tests passed`, then `match` from the deployed-code check, and `genvm-lint` either passing or reporting that it is not installed |
| `python3 scripts/check_schema.py` | the constructor line, `writes (7)`, `payable (1): join`, `views (12)`, and the final line `schema loaded: paste this file as it is` |
| `python3 scripts/verify_deployment.py` | the recorded address, two hashes, and `match` (the deployed copy is stored with CRLF line endings, which the script reports as `match (line endings differ …)`) |
| `npm run dev`, then the console | the header reads `GenLayer Studio Dev · chain 61997` with a mint dot saying `live network`; the hero counters show real numbers from the contract, never `…` after the first read |
| footer of the console | `contract 0x1c68…551C`, `address source  deployments/registry.json`, `source file  contracts/RitualPot.py` |
| `GET /api/deployment` | `"address":"0x1c68e84c672feff5b5c9e336fbcdff352acf551c"` with `"source":"registry"` |
| `GET /api/health` | `{"ok":true,"database":"up"}` with a database, `{"ok":true,"database":"not-configured"}` without one — the site works either way |
| home page → **load a preset** → *open the ritual* | the form fills with eleven values the contract accepts (under `samples/presets/`), and after signing the result banner says `Ritual opened` — read back from `get_pot`, not from the receipt |
| the registry section | cards for every pot the contract holds, or the empty panel "Nobody has opened a ritual on this contract yet." when it holds none — never sample data |
| after the live walkthrough in `samples/live-flow.md` | `get_payouts` rows that sum to `stake × members`, a `withdrawn` flag on every payout taken, `held` falling as money leaves, and refused joins visible as a credit for that address alone |
| the explorer | the address page shows the contract and its source matches `contracts/RitualPot.py` |

If any row differs, the contract or the record is not what these instructions assume — re-run
`sh scripts/lint_contract.sh` before touching anything else.

## What a member can check before staking

| Question | Answer |
| --- | --- |
| What is the goal and the rule for the money? | The goal, the number and length of periods, the stake, the member cap, the rounds, the join window and the ruling window are fixed when the pot is opened; there are no setters and no owner. |
| Can the page talk the model into a yes? | The page is fenced as untrusted data and instruction-like phrasing is flagged and stored with every round. The model only proposes `met` or `not_met`; another shape, another casing or an invented verdict counts for nothing, and the contract re-checks the answer after consensus. |
| Can one odd reading decide a period? | With `rounds_required = 2` the same answer has to come twice, a full interval apart; a different answer restarts the count. An unclear round moves nothing and is kept as evidence. |
| What is judged? | The page frozen whole when the member posted it (at most 1200 characters, so validators read all of it). Editing the live page afterwards changes nothing. |
| Can I be tricked into a wrong stake? | `join` accepts only the exact stake. Everything it cannot accept is credited to the sender, never lost; only that address can take it back. |
| Can someone prove for me, or after the fact? | Only a member can prove, only during the running period, once per period. A period without a proof is lost. |
| Can transaction order choose who is paid? | No. `rule` works only before the final deadline and `settle` before it only when nothing is left to rule. |
| What if validators cannot rule? | An unclear round counts for nothing. A proof nobody could rule by the final deadline counts as not met, so the pot always settles. |
| Can the registry fill up? | No cap: pots, members, proofs, rounds and events live in TreeMaps with a DynArray index; views are paged. |
| Do the books balance? | Yes, by construction and by the offline suite: the payouts of a pot always add up to the stakes that went in. |

**What you still trust:** that the goal asks for something one page can show (the creator writes it:
read it before you stake), and that validators agree on whether a page meets it.

## Live

| | |
| --- | --- |
| Network | GenLayer Studio Dev / Studio Next — chain 61997 |
| Contract | [`0x1c68e84C672feFf5B5C9e336fBCDff352aCf551C`](https://explorer-studio-next.genlayer.com/address/0x1c68e84C672feFf5B5C9e336fBCDff352aCf551C) |
| Console | `npm run dev`, then `http://localhost:3000` — reads work with no wallet |
| Address record | `deployments/registry.json` (`status: deployed`, code hash recorded) |
| Verify the bytes | `python3 scripts/verify_deployment.py` → `match` |
| Schema check | `python3 scripts/check_schema.py` → `schema loaded` |
| Test it by hand | `docs/TESTING.md`, then `samples/live-flow.md` end to end |
| Build pipeline | `docs/DEPLOYMENT_PIPELINE.md` |

## Tests

```sh
sh scripts/lint_contract.sh     # syntax + 16 contract tests + deployed-code check
python3 tests/test_contract.py  # the same suite on its own, no network, no SDK
python3 scripts/check_schema.py # the node loads the source before you paste it
```

The suite installs a stand-in for the GenVM SDK and runs the real contract module: the architecture
itself (exact write and view surface, `join` the only payable, no setters, header and encoding),
the parsers and limits, the money arithmetic through 400 random settlements, the join refusals and
their credits, the proof and ruling timings, the schedule invariant that `rule` and `settle` are
never both open, and the withdrawals.

## Manual and live testing

`docs/TESTING.md` is the runbook: prerequisites, the schema check, the paste checklist for Studio,
the walkthrough in `samples/live-flow.md`, and the eight checks that must hold on a live run
(payouts balance, steps never overlap, a refused join returns, a payout is taken once, rounds are
kept, the registry is uncapped, the books, the code hash).

`samples/presets/` holds three parameter sets that fill the opening form on the home page, so a
live run starts from values the contract accepts; `samples/proofs/` holds the two proof-page
templates the console also serves from `public/proofs/`.

`templates/` holds what you fill in while testing: `ritual-spec.template.json` for the eleven
parameters, `proof-page.template.md` for a page validators can judge, and `DEPLOY_RECORD.template.md`
for the transaction log you save next to the deployment.

## Repository layout

```
contracts/RitualPot.py    the contract (GenVM / py-genlayer), header pinned to the runner
src/                     the console: Next.js App Router, typed contract layer, wallet
  app/                   routes, layout, global styles
  components/            hero, trust, registry, pot detail, opening form, record, wallet
  lib/                   config (address resolution), chain, contracts, outcome, format
  db/                    Drizzle schema: the runtime deployment record (optional at runtime)
docs/                    architecture, contract interface, configuration, live testing, pipeline
deployments/             registry.json: the recorded address, chain, RPC and code hash
samples/                 a scripted read of the live contract and the live walkthrough
templates/               ritual parameters, proof page, deploy record
tests/                   offline suite for the contract
scripts/                 schema check, lint, deployed-code verification
```

## Configuration

The contract address is resolved in one place (`src/lib/config.ts`), in this order:
`NEXT_PUBLIC_RITUALPOT_ADDRESS` → the database record → `deployments/registry.json`.
No component contains an address literal. The full list of variables and the switch procedure is
in `docs/CONFIGURATION.md`.

## License

[MIT](LICENSE)
