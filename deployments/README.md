# Deployments

This folder is the single place where a deployed RitualPot address lives in the repository.
Everything else reads from it, so a contract that moves is a one-line change here.

## Files

| File | What it holds |
| --- | --- |
| `registry.json` | One entry per network: chain id, RPC, explorer, the contract address and the code hash recorded at deploy time. |
| `../templates/DEPLOY_RECORD.template.md` | The shape of a deploy record: every transaction of a real deployment, including the refused ones. |

An address is `null` until somebody deploys — the console then shows a "no contract recorded"
state instead of inventing data. This repository records a live deployment:

| Network | Address | Code hash |
| --- | --- | --- |
| Studio Next, chain 61997 | [`0x1c68e84C672feFf5B5C9e336fBCDff352aCf551C`](https://explorer-studio-next.genlayer.com/address/0x1c68e84C672feFf5B5C9e336fBCDff352aCf551C) | `codeSha256` in `registry.json` |

Verify it any time with `python3 scripts/verify_deployment.py`.

## Recording a deployment

1. Deploy `contracts/RitualPot.py` to the target network and note the contract address and the
   transaction hash.
2. Record the code hash so the repository can prove the deployed bytes are this source:

   ```sh
   python3 scripts/verify_deployment.py
   ```

3. Put the address into `registry.json` under the matching network and set `status` to `deployed`.
4. Copy `RECORD.template.md` next to it as `<network>.md` and fill in every transaction you sent,
   including the ones the contract refused.
5. If the console should pick the address up without a rebuild, push it to the database as well:

   ```sh
   curl -X POST http://localhost:3000/api/deployment \
     -H 'content-type: application/json' \
     -d '{"network":"studio-dev","address":"0x0000000000000000000000000000000000000000"}'
   ```

## How the console resolves the address

Resolution order (first hit wins), implemented in `src/lib/config.ts`:

1. `NEXT_PUBLIC_RITUALPOT_ADDRESS` — an environment override for a preview build.
2. The database record returned by `GET /api/deployment` — set at runtime with `POST /api/deployment`.
3. `registry.json` — the checked-in default for the selected network.

`GET /api/deployment` always reports which of the three it used in the `source` field, and the
console prints that line in the footer, so a mismatch is visible immediately.

## Switching to a new contract

| Where | Change |
| --- | --- |
| Repository default | `deployments/registry.json` → `networks[].address` |
| Running instance | `POST /api/deployment` with the new address, no rebuild |
| Preview build | `NEXT_PUBLIC_RITUALPOT_ADDRESS=0x… ` before `npm run build` |
| Verification | `python3 scripts/verify_deployment.py` must report `match` |
