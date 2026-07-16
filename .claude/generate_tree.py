import os, sys, pathlib

sys.stdout.reconfigure(encoding='utf-8')

def load_gitignore(root):
    # A leading "/" anchors a pattern to the repo root (matches only there);
    # without one, a pattern matches a directory of that name at any depth.
    # These two sets must stay separate so anchoring isn't lost.
    gitignore = pathlib.Path(root) / ".gitignore"
    anchored = set()
    unanchored = set()
    if gitignore.exists():
        for line in gitignore.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                if line.startswith("/"):
                    anchored.add(line.strip("/"))
                else:
                    unanchored.add(line.strip("/"))
    return anchored, unanchored

IGNORE_ALWAYS = {
    ".git", ".claude", "node_modules", "__pycache__", ".DS_Store",
    "dist", "build", ".venv", ".godot", "export", ".import", "imported",
    ".env",
}

def should_ignore(name, rel_path, anchored_patterns, unanchored_patterns):
    return (
        name in IGNORE_ALWAYS
        or name.startswith("vault-")
        or name in unanchored_patterns
        or rel_path in anchored_patterns
    )

def walk(root, prefix="", rel_prefix="", anchored_patterns=None, unanchored_patterns=None):
    if anchored_patterns is None:
        anchored_patterns = set()
    if unanchored_patterns is None:
        unanchored_patterns = set()
    try:
        candidates = sorted(
            os.scandir(root),
            key=lambda e: (not e.is_dir(), e.name.lower()),
        )
    except PermissionError:
        return
    entries = []
    for e in candidates:
        rel_path = f"{rel_prefix}{e.name}" if rel_prefix else e.name
        if not should_ignore(e.name, rel_path, anchored_patterns, unanchored_patterns):
            entries.append((e, rel_path))
    for i, (entry, rel_path) in enumerate(entries):
        last = i == len(entries) - 1
        connector = "└── " if last else "├── "
        suffix = "/" if entry.is_dir() else ""
        print(prefix + connector + entry.name + suffix)
        if entry.is_dir():
            ext = "    " if last else "│   "
            walk(entry.path, prefix + ext, rel_path + "/", anchored_patterns, unanchored_patterns)

root = "."
anchored_patterns, unanchored_patterns = load_gitignore(root)
print(".")
walk(root, anchored_patterns=anchored_patterns, unanchored_patterns=unanchored_patterns)
