# Deploy record — <network label>

- Network: <label>, chain <chain id>
- RPC: <rpc url>
- Explorer: <explorer url>
- Contract source: `contracts/RitualPot.py`
- Source sha256: `<hash printed by scripts/verify_deployment.py>`
- Contract address: `0x…`
- Deployer: `0x…`
- Deployed at: <UTC timestamp>

## Transactions

Record every transaction you sent while testing the live contract, in order, including the ones the
contract refused. A refusal is part of the evidence.

| # | Method | Sent by | Arguments (summary) | Result | Transaction |
| - | ------ | ------- | ------------------- | ------ | ----------- |
| 1 | `deploy` | `0x…` | source above | accepted, finalized | `0x…` |
| 2 | `open_pot` | `0x…` | id, title, goal, 3 periods, 1 day each, stake, cap 4, 2 rounds, … | accepted | `0x…` |
| 3 | `join` | `0x…` | id, value = stake | accepted | `0x…` |
| 4 | `join` | `0x…` | id, value = stake + 1 | refused, credited | `0x…` |
| 5 | `prove` | `0x…` | id, proof url, note | accepted | `0x…` |
| 6 | `rule` | `0x…` | id, member 0, period 0 | round recorded | `0x…` |
| 7 | `settle` | `0x…` | id | accepted | `0x…` |
| 8 | `withdraw_member` | `0x…` | id | paid | `0x…` |

## Reads used to confirm each step

- `get_pot` shows the status you expect after each write.
- `get_schedule` shows which step the contract accepts right now; `rule` and `settle` are never both
  open.
- `get_round` keeps every ruling round, including the ones that produced no verdict.
- `get_payouts` must sum to `stake x members`.
- `get_balance` shows held and credited value; after every withdrawal the held figure falls.
- `get_credit` is what `withdraw_credit` returns for your address.

## Verification

```sh
python3 scripts/verify_deployment.py
```

The script must print `match`. Record the printed hashes above.
