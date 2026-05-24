import sys
from pathlib import Path


def main() -> None:
    path = Path(sys.argv[1])
    text = path.read_text()
    proxy = "\n  handle_path /api/* {\n    reverse_proxy 127.0.0.1:8000\n  }\n"

    if "reverse_proxy 127.0.0.1:8000" in text:
        return

    marker = "claude-impact-lab.gtec-dsi.net {"
    if marker not in text:
        raise SystemExit(f"Could not find Caddy site block: {marker}")

    start = text.index(marker)
    insert_at = text.index("\n}", start)
    path.write_text(text[:insert_at] + proxy + text[insert_at:])


if __name__ == "__main__":
    main()
