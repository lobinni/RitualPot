# Architecture

RitualPot is two halves: a contract that owns every rule and every coin, and a console that only
reads it and asks for transactions. Nothing about the rules lives in the front end - the console
prints what the contract reports.

## Repository

```
contracts/RitualPot.py        GenVM contract, py-genlayer
tests/test_contract.py        offline suite: the contract runs against a stand-in for the SDK
scripts/lint_contract.sh      syntax + tests + official linter when installed
scripts/verify_deployment.py  deployed bytes must equal this source
deployments/registry.json     recorded address, chain, rpc, explorer, code hash per network
templates/                    ritual parameters, proof page, deploy record
samples/                      scripted reads of the live contract, live walkthrough
docs/                         this file, the interface, configuration, live testing
src/                          the console
  app/                        routes (page, health, deployment), layout, global styles
  components/                 hero, registry, pot detail, activity, wallet, shared primitives
  lib/                        config, chain, contracts, outcome, format
  db/                         Drizzle schema and the runtime deployment record
```

## Contract

State lives in TreeMaps keyed by strings, plus a DynArray index for ordering, so nothing has a
fixed cap and every list can be paged.

| Storage | Key | Holds |
| --- | --- | --- |
| `pots` | `pot_id` | the pot record: every fixed rule, the schedule, the member list, the status |
| `pot_order` | index | pot ids in opening order, for `list_pots` |
| `members` | `pot_id#index` | address, join time, and after settlement the payout row |
| `proofs` | `pot_id#member#period` | the frozen page, its hash, the round counter and the standing verdict |
| `rounds_log` | `pot_id#member#period#round` | every ruling round, kept for good |
| `credits` | address | value a `join` could not escrow, returnable only by its owner |
| `events` | zero-padded sequence | append-only log behind `get_events` |

### Lifecycle

```
open_pot ──► join (until join_closes_at) ──► prove (once per member per period)
                                              │
                                              ▼ after each period ends
                                        rule (rounds_required agreeing rounds)
                                              │
                                              ▼ after the last period
                                        settle ──► final | void ──► withdraw_member
                                                        ▲
join refusal ──► credit ────────────────────────────────┴── withdraw_credit
```

Two invariants the suite checks on every run:

1. `rule` and `settle` are never both available. `rule` stops at the final deadline; `settle`
   before it only when nothing is left to rule. `get_schedule` reports both flags from one clock.
2. A pot's payouts always sum to `stake x members`. Refunds are floored, the pool is split evenly
   between the best keepers and the dust goes to the first of them in join order.

### Consensus and the page

A proof page is untrusted input. `freeze_page` fetches it once under strict equality so every
validator judges identical bytes, wraps it in a data fence, and flags instruction-like phrasing.
The judge is asked only for `met` or `not_met`; the contract re-checks the answer it receives and
treats anything else as `unclear`. Rounds are recorded whether they ruled or not.

### Money

Value attached to a call that reverts is not returned on this network, so `join` never reverts once
value is attached: what it cannot escrow becomes a credit. Payments out are external transfers,
emitted after the books are updated.

## Console

```
page.tsx
  └── Console (client)
        ├── Hero            network line, live counters, floating contract tiles
        ├── Registry        paged pot cards, filters, empty/offline states
        ├── PotDetail       trust card, schedule, proofs, rounds, payouts, actions
        ├── OpenRitual      the eleven fixed parameters, validated before sending
        ├── Activity        newest events, contract books
        └── WalletProvider  connect, account, funding
```

Reads go through one serialized queue with a minimum spacing, because the dev network rate-limits;
a rate-limited call backs off and retries instead of surfacing an error. Writes report two stages -
accepted (the leader's result was agreed) and finalized (the appeal window closed) - and neither is
assumed: success is decided by reading the contract again afterwards with `src/lib/outcome.ts`,
whose functions are pure so the rules are testable by reading them.

## Data flow

```
deployments/registry.json ─┐
database record ───────────┼─► src/lib/config.ts ─► src/lib/chain.ts ─► network
environment override ──────┘         │
                                     └─► src/lib/contracts.ts ─► typed reads and writes
                                                                    │
                                          src/lib/outcome.ts ◄──────┘ (read after the call)
```

See `docs/CONFIGURATION.md` for the resolution order and the exact variables.
