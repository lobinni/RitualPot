# Testing the live contract

This guide walks a **real** deployment of `contracts/RitualPot.py`. It uses no demo data: every
value comes from you, every read comes from the chain, and an empty state means the contract is
genuinely empty.

## Prerequisites

1. A deployment of `contracts/RitualPot.py`. The live one is recorded in
   `deployments/registry.json`: [`0x1c68e84C672feFf5B5C9e336fBCDff352aCf551C`](https://explorer-studio-next.genlayer.com/address/0x1c68e84C672feFf5B5C9e336fBCDff352aCf551C), chain 61997, Studio Next.
2. The address recorded in `deployments/registry.json`, or exported as `RITUALPOT_ADDRESS`.
3. A wallet with enough native value for the stake plus fees. The console can top a Studio wallet
   up from the faucet button.
4. The console running: `npm run dev`, then open `http://localhost:3000`.

## 1. Prove you are talking to your contract

```sh
python3 scripts/verify_deployment.py
```

Expected output ends with `match`. The deployed copy was pasted through an editor that turned
LF into CRLF, so the line you see is `match (line endings differ: the deployed copy is this source
with CRLF)` — the text is identical; redeploy with LF endings for a byte-for-byte match. If the
script prints `no contract address recorded`, nothing has been
deployed yet and step 0 of `samples/live-flow.md` is your next move. If it prints `MISMATCH`, the
deployed bytes are not this source - redeploy before testing anything.

In the console footer check the address, the `source` line and the network line.

## 2. Run the offline suite first

```sh
sh scripts/lint_contract.sh
```

Expected: `all 15 tests passed`, then either `match` or the "nothing recorded" line. The suite
covers the architecture, the parsers, the money arithmetic, the refusals and the timings, so the
live run only has to prove that the network agrees.

## 2b. If Studio says "Could not load contract schema"

The loader reads the header before it reads the contract, so this error is almost never about the
code below it. The block at the top of `contracts/RitualPot.py` must be exactly:

```
# v0.3.0
# { "Depends": "py-genlayer:<runner>" }
<blank line>
import genlayer as gl
```

| Line | Rule |
| --- | --- |
| 1 | the **GenVM runtime version**, not the project version. A project tag such as `# v1.0.0` here makes Studio reject the file before it parses anything. |
| 2 | the runner package pin. It must be one the Studio you are using actually serves. |
| 3 | a blank line. GenVM parses the whole leading comment block as runner config, so any comment you add after the header corrupts it. |
| whole file | pure ASCII (character codes 0–127). A stray non-ASCII character in a comment makes the parser crash. |

Runner pins seen on live networks:

| Pin | Where it works |
| --- | --- |
| `py-genlayer:kzybg95x1gn21dw72m7hyg0maaap04n4nx55j9yt6fkdqxtz6bz0` | Studio Dev, chain 61997 — the default in this repository |
| `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` | the classic runner (GenVM v0.2.16) |
| `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` | newer Studio runners |

Fix procedure:

1. Open any built-in example contract in the Studio you are deploying to and copy **its** first two
   lines over ours — that pair is known to load there.
2. Keep the blank third line and the ASCII-only file.
3. Re-run `sh scripts/lint_contract.sh`; `test_source_header_and_encoding` checks lines 1–3, the
   encoding and the pin against the table above.
4. Before pasting anything into Studio, ask the node itself:

   ```sh
   python3 scripts/check_schema.py
   ```

   It sends the local file through `gen_getContractSchemaForCode` — the very call the run/debug
   page makes — prints the method list when it loads, and prints the node's own error when it does
   not. It needs no key and deploys nothing.

5. The paste checklist, because that is where this error usually comes from:

   | Symptom in the pasted file | What it breaks |
   | --- | --- |
   | line 3 is not blank | the leading comment block is read as runner config |
   | a comment added between the header and `import genlayer as gl` | same as above |
   | line numbers or indentation from a diff view | the version line no longer parses |
   | a smart quote or a non-ASCII dash in a comment | the loader reads the source as ASCII |
   | both `# v0.3.0` and `# v0.4.0` lines present | two version headers, one of them stale |

6. If `check_schema.py` reports `schema loaded` but Studio still refuses, the two are not looking
   at the same bytes: clear the editor and paste the file from disk again. A plain example contract
   loading in Studio separates a header problem from an environment one.

## 2c. Fill the form with a preset

The console ships three parameter sets in `samples/presets/`. On the home page, in
**Fix every rule before anyone joins**, press **load a preset**:

| Preset | Use it to |
| --- | --- |
| `48-hour sprint` | walk the whole flow once in two daily periods |
| `One week study log` | six periods, six members, a wide ruling window |
| `Half-day workout check` | short periods, one round per proof |

The strip only fills the eleven fields; nothing is sent until you sign. Each preset is inside the
contract's limits, so an open attempt fails only if you change it — or if the identifier is
already taken, which is itself worth recording. Then follow the walkthrough below from step 2.

## 2d. If a transaction fails with `NonceTooLow`

```
Custom eth_sendRawTransaction: NonceTooLow(expected=657, actual=36)
```

The account's transaction counter and the view the wallet reads are not the same number. Nothing
is spent when this happens. In order:

1. The console shows the wallet's chain in the header as
   `wallet on chain <id> · switch to 61997` when it does not match. Switch the wallet's network and
   send again — the console refuses to sign while they differ.
2. Clear the wallet's own nonce cache (in the wallet's advanced settings: clear the activity or
   transaction history data for this network), then send again. The console already retries the
   send once after a short pause, which covers a counter that was read from a lagging view.
3. If it still fails, send from an account that has not been used heavily on this network, or read
   the account's counter directly:

   ```sh
   curl -s -X POST https://studio-next.genlayer.com/api \
     -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionCount","params":["<your address>","pending"]}'
   ```

   The number it prints is the one the console will use. If the network still answers
   `expected=<bigger>`, the node's counter is ahead of its own read endpoint — wait for the queue to
   drain and send again.

The banner under **result** always repeats the failure as a sentence with the two numbers and the
fix, never as raw transport text.

## 2e. The wallet chips in the header

| Chip | What it means |
| --- | --- |
| `wallet on 61997 · detected` (mint) | the console read the chain from the wallet itself — the network switch was seen |
| `wallet on chain <id> (0x…) · expected 61997` + **Switch network** (amber) | the wallet is on another network; the console will not sign until it matches. Press **Switch network**: it asks the wallet to move to the configured network and adds it first when the wallet does not know it |
| `chain not read yet` + **Re-check** | the wallet answered no chain id; press **Re-check** (the console also re-reads on every wallet event) |
| `wallet not detected` (on the connect button) | no injected wallet was found; install or enable it, then press the button again — the console looks for it twice, including shortly after load |

The console follows `chainChanged` and `accountsChanged`, and re-reads the chain whenever the tab
regains focus, so a switch made in the wallet reaches the page without a reload.

### The chip still names another chain after switching

Then the wallet switched, but to a **different network entry**: the chip prints what the wallet
itself reports, and an entry can be named one thing and carry another chain id. `0xf22f` is 61999
(studionet), `0xf22d` is 61997 — the network this console and its RPC use. Press **Switch
network**: the wallet is asked to move to `0xf22d` and, if it has never seen it, the correct
definition is added (name, RPC, explorer) so the two cannot drift apart again. If the wallet still
reports 61999 afterwards, edit or remove that entry inside the wallet.

## 3. Walk the live flow

Follow `samples/live-flow.md` end to end. It lists, for each step:

- the action and the expected read afterwards,
- the refusals worth recording, because each one proves a rule,
- the reads that confirm the money moved (`get_balance`, `get_payouts`, `get_credit`).

Write every transaction - including the refused ones - into `templates/DEPLOY_RECORD.template.md`
and save it as `deployments/<network>.md`.

## 4. Checks that must hold on a live run

| Check | How | Expected |
| --- | --- | --- |
| Payouts balance | `get_payouts` after `settle` | rows sum to `stake × members` |
| Steps never overlap | `get_schedule` at any moment | `can_rule` and `can_settle` are never both true |
| A refused join is not lost | `get_credit` then `withdraw_credit` | the credited value returns to its owner |
| A payout is taken once | `withdraw_member` twice | the second call is refused |
| Every round is kept | `get_round` for each round number | present, ruled or unclear |
| The registry is uncapped | `list_pots` / `get_events` paging | total is the true count, pages never exceed 50 |
| The books | `get_balance` | `balance ≥ held + credits`, and `held` falls as payouts leave |
| The code | `scripts/verify_deployment.py` | `match` |

## 5. Scripted reads

```sh
node samples/read-live.mjs
```

Prints the network, address, source, pot and event counts, the books, the registry page and the
newest events, straight from the chain. With no address recorded it exits with a message instead of
printing sample values. Use it to diff a run against what the console shows.

## 6. After a contract change

1. Edit `contracts/RitualPot.py`.
2. `sh scripts/lint_contract.sh` — the suite must stay green; add a test for the rule you changed.
3. Redeploy and record the new address in `deployments/registry.json`.
4. `python3 scripts/verify_deployment.py` — `match` against the new address, and
   `python3 scripts/check_schema.py` — `schema loaded` before the source goes into Studio.
5. Point the running instance at it: `POST /api/deployment`, or rebuild with
   `NEXT_PUBLIC_RITUALPOT_ADDRESS`.
