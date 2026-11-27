#!/usr/bin/env python3
"""Compare the bytes stored at the recorded address with contracts/RitualPot.py.

The address comes from deployments/registry.json, so the check follows the contract when it
moves. Override either side with RITUALPOT_ADDRESS / RITUALPOT_RPC for a one-off check.

Exit codes: 0 = match or nothing recorded yet, 1 = mismatch, 2 = the network could not be read.
"""

import base64
import hashlib
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "contracts" / "RitualPot.py"
REGISTRY = ROOT / "deployments" / "registry.json"


def recorded() -> tuple[str, str]:
    """(rpc url, address) from the environment, then the registry."""
    data = json.loads(REGISTRY.read_text())
    network = None
    wanted = os.environ.get("RITUALPOT_NETWORK") or data.get("defaultNetwork")
    for entry in data.get("networks", []):
        if entry.get("id") == wanted:
            network = entry
            break
    if network is None and data.get("networks"):
        network = data["networks"][0]
    address = os.environ.get("RITUALPOT_ADDRESS") or (network or {}).get("address")
    rpc = os.environ.get("RITUALPOT_RPC") or (network or {}).get("rpcUrl") or ""
    return rpc, address or ""


def on_chain_code(rpc: str, address: str) -> bytes:
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": "gen_getContractCode", "params": [address]}
    ).encode()
    request = urllib.request.Request(
        rpc,
        data=payload,
        headers={"content-type": "application/json", "user-agent": "ritualpot-check"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        body = json.load(response)
    if "result" not in body:
        raise SystemExit("RPC error: %s" % body.get("error"))
    return base64.b64decode(body["result"])


def normalize(raw: bytes) -> bytes:
    """A paste through an editor can turn LF into CRLF; the text is still this source."""
    return raw.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def main() -> int:
    local = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    rpc, address = recorded()
    if not address:
        print("no contract address recorded in deployments/registry.json")
        print("local", local)
        return 0
    if not rpc:
        print("no rpc url recorded for this network")
        return 2
    try:
        remote_bytes = on_chain_code(rpc, address)
        remote = hashlib.sha256(remote_bytes).hexdigest()
    except (urllib.error.URLError, OSError, ValueError) as exc:
        print("could not read %s: %s" % (rpc, exc))
        return 2
    print("address ", address)
    print("local   ", local)
    print("on-chain", remote)
    if local == remote:
        print("match")
        return 0
    local_norm = hashlib.sha256(normalize(SOURCE.read_bytes())).hexdigest()
    remote_norm = hashlib.sha256(normalize(remote_bytes)).hexdigest()
    if local_norm == remote_norm:
        print("match (line endings differ: the deployed copy is this source with CRLF)")
        print("note    redeploy with LF endings to get a byte-for-byte match")
        return 0
    print("MISMATCH: the deployed bytes are not this source")
    print("local   ", local_norm)
    print("on-chain", remote_norm)
    return 1


if __name__ == "__main__":
    sys.exit(main())
