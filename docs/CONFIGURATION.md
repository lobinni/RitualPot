# Configuration

Everything that can change between deployments is a variable, a file or a database row - never a
value baked into a component.

## The contract address

Resolution order in `src/lib/config.ts`, first hit wins:

| # | Source | Scope | How to change it |
| - | ------ | ----- | ---------------- |
| 1 | `NEXT_PUBLIC_RITUALPOT_ADDRESS` | one build | set the variable before `npm run build` |
| 2 | database record (`deployments` table) | one running instance, no rebuild | `POST /api/deployment` |
| 3 | `deployments/registry.json` | the repository default (this is where the live address is recorded) | edit the file |

`GET /api/deployment` returns the resolved address together with its `source`
(`environment`, `database` or `registry`), and the console footer prints that line, so you can tell
at a glance which one is in use.

```sh
# read what the running instance is using
curl http://localhost:3000/api/deployment

# point the running instance at a new contract, no rebuild
curl -X POST http://localhost:3000/api/deployment \
  -H 'content-type: application/json' \
  -d '{"network":"studio-dev","address":"0x0123456789abcdef0123456789abcdef01234567"}'

# a preview build against a different contract
NEXT_PUBLIC_RITUALPOT_ADDRESS=0x… npm run build
```

An address that is not `0x` followed by 40 hex digits is rejected; the stored row also records the
network, who set it and when.

## Network

| Variable | Default | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_RITUALPOT_NETWORK` | `studio-dev` | which entry of `deployments/registry.json` to use |
| `NEXT_PUBLIC_RITUALPOT_RPC` | the registry entry | JSON-RPC endpoint |
| `NEXT_PUBLIC_RITUALPOT_EXPLORER` | the registry entry | explorer base url for transaction links |

The chain id, currency symbol and explorer come from the same registry entry, so moving the
contract to another network is a registry edit rather than a code change.

## Database

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by the runtime deployment record. **Optional — leave it unset on Vercel**; the connection is opened lazily, so no code path touches it unless `POST /api/deployment` is called |

The database holds one thing for this project: the runtime deployment record. It holds no sample
pots, no sample events and no seeded content of any kind - all of that is read from the contract.
With no `DATABASE_URL` the record simply does not exist and every read falls back to
`deployments/registry.json`; the console behaves exactly the same apart from the address form in
the footer, which then explains that the address is recorded in the repository.

## Contract source

| Where | Value |
| --- | --- |
| source file | `contracts/RitualPot.py` |
| checked-in record | `deployments/registry.json` → `contractSource` and `codeSha256` |
| verification | `python3 scripts/verify_deployment.py` |

## Where each address appears

To move the contract, these are the only places to touch:

1. `deployments/registry.json` — `networks[].address`, `codeSha256`, `deployedAt`, `status`
2. the database row, if a running instance should pick it up (`POST /api/deployment`)
3. `NEXT_PUBLIC_RITUALPOT_ADDRESS`, only if a specific build must be pinned

No component, hook or route contains an address literal.
