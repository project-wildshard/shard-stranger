#!/usr/bin/env python3
"""Check a plain fixture with the ordinary CLI and run its server witness."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("sharddev", type=Path, help="installed sharddev checkout")
parser.add_argument("engine", type=Path, help="installed engine checkout")
parser.add_argument("--fixture", choices=("rabbit", "dragonfly"), default="rabbit")
parser.add_argument("--bad", action="store_true", help="require the bad strike refusal")
args = parser.parse_args()
root = Path(__file__).resolve().parent
sdk = args.sharddev.resolve()
engine = args.engine.resolve()
scratch = root / "tmp"
scratch.mkdir(exist_ok=True)

with TemporaryDirectory(prefix=f"{args.fixture}-", dir=scratch) as folder:
    work = Path(folder)
    subprocess.run(
        ["node", "--import", "./packages/kit/test-hook.mjs", "--input-type=module",
         "-e", "import {writeHandwrittenSource} from './packages/sdk/src/sharddev/handwritten.ts';"
         "writeHandwrittenSource(process.argv[1], 'stranger-fixtures');", str(work / "src")],
        cwd=sdk, check=True,
    )
    edit = [sys.executable, str(root / "write-fixture.py"), str(work / "src"), args.fixture]
    if args.bad:
        edit.append("--bad")
    subprocess.run(edit, check=True)
    checked = subprocess.run(
        ["node", "packages/cli/bin/wildshard.mjs", "check", str(work), "--json"],
        cwd=sdk, stdout=subprocess.PIPE, text=True, check=False,
    )
    report = json.loads(checked.stdout)
    if args.bad:
        if checked.returncode == 0 or not any(
            "fixture.missing" in row["message"] for row in report["refusals"]
        ):
            raise SystemExit("Expected the planted missing strike to fail check")
        print(report["refusals"][0]["message"])
    else:
        if checked.returncode or report["verdict"] != "pass":
            raise SystemExit(checked.stdout)
        subprocess.run(
            ["node", "--import", str(engine / "scripts/sim-node-loader.mjs"),
             str(root / "sim-check.mjs"), str(engine), str(sdk), report["output"], args.fixture],
            check=True,
        )
