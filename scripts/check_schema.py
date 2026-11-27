#!/usr/bin/env python3
"""Ask a live GenVM node whether contracts/RitualPot.py loads, and print why when it does not.

This is the same call the Studio run/debug page makes before it shows the contract, so it
answers "will this paste into Studio?" before anything is deployed. Nothing is sent to the
chain and no key is needed.

    python3 scripts/check_schema.py
    RITUALPOT_RPC=https://studio-next.genlayer.com/api python3 scripts/check_schema.py

Exit codes: 0 = the schema loaded, 1 = the node refused the source, 2 = transport problem.
"""

import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "contracts" / "RitualPot.py"
REGISTRY = ROOT / "deployments" / "registry.json"

DEFAULT_RPC = "https://studio-next.genlayer.com/api"


def rpc_url() -> str:
    if os.environ.get("RITUALPOT_RPC"):
        return os.environ["RITUALPOT_RPC"]
    try:
        data = json.loads(REGISTRY.read_text())
        wanted = os.environ.get("RITUALPOT_NETWORK") or data.get("defaultNetwork")
        for entry in data.get("networks", []):
            if entry.get("id") == wanted and entry.get("rpcUrl"):
                return entry["rpcUrl"]
    except Exception:
        pass
    return DEFAULT_RPC


def get_schema(rpc: str, code: bytes) -> dict:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "gen_getContractSchemaForCode",
        "params": ["0x" + code.hex()],
    }
    request = urllib.request.Request(
        rpc,
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json", "user-agent": "ritualpot-schema-check"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)


def main() -> int:
    source = SOURCE.read_bytes()

    problems = []
    if any(byte > 127 for byte in source):
        problems.append("the source contains a non-ASCII character; the loader reads bytes as ASCII")
    lines = source.decode("utf-8").splitlines()
    if not lines[0].startswith("# v"):
        problems.append("line 1 must be the GenVM version header, found %r" % lines[0][:40])
    if not lines[1].startswith('# { "Depends": "py-genlayer:'):
        problems.append('line 2 must be the Depends runner pin, found %r' % lines[1][:40])
    if len(lines) < 3 or lines[2].strip():
        problems.append(
            "line 3 must be blank: GenVM parses the leading comment block as runner config"
        )
    if any(line.lstrip().startswith("#") and "Depends" in line for line in lines[3:6]):
        problems.append("a comment sits between the header and the imports")
    if problems:
        for problem in problems:
            print("local problem:", problem)
        return 1

    rpc = rpc_url()
    print("source  ", SOURCE.relative_to(ROOT), len(source), "bytes")
    print("rpc     ", rpc)
    try:
        body = get_schema(rpc, source)
    except (urllib.error.URLError, OSError, ValueError) as exc:
        print("transport problem:", exc)
        return 2

    if "error" in body:
        print("the node refused this source")
        print(json.dumps(body["error"], indent=2)[:4000])
        return 1

    result = body.get("result") or {}
    methods = result.get("methods", {})
    writes = sorted(name for name, spec in methods.items() if not spec.get("readonly"))
    views = sorted(name for name, spec in methods.items() if spec.get("readonly"))
    payable = sorted(name for name, spec in methods.items() if spec.get("payable"))
    print("constructor params:", result.get("ctor", {}).get("params"))
    print("writes   (%d): %s" % (len(writes), ", ".join(writes)))
    print("payable  (%d): %s" % (len(payable), ", ".join(payable)))
    print("views    (%d): %s" % (len(views), ", ".join(views)))
    print("schema loaded: paste this file as it is")
    return 0


if __name__ == "__main__":
    sys.exit(main())
