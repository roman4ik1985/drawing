from __future__ import annotations

import shutil
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python mock_dwg_converter.py <input.dxf> <output.dwg>", file=sys.stderr)
        return 2
    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
