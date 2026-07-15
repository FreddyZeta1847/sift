import os, sys, pathlib

sys.stdout.reconfigure(encoding='utf-8')

def load_gitignore(root):
    gitignore = pathlib.Path(root) / ".gitignore"
    patterns = set()
    if gitignore.exists():
        for line in gitignore.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                patterns.add(line.strip("/"))
    return patterns

IGNORE_ALWAYS = {
    ".git", ".claude", "node_modules", "__pycache__", ".DS_Store",
    "dist", "build", ".venv", ".godot", "export", ".import", "imported",
    ".env",
}

def should_ignore(name, gitignore_patterns):
    return name in IGNORE_ALWAYS or name.startswith("vault-") or name in gitignore_patterns

def walk(root, prefix="", gitignore_patterns=None):
    if gitignore_patterns is None:
        gitignore_patterns = set()
    try:
        entries = sorted(
            [e for e in os.scandir(root)
             if not should_ignore(e.name, gitignore_patterns)],
            key=lambda e: (not e.is_dir(), e.name.lower()),
        )
    except PermissionError:
        return
    for i, entry in enumerate(entries):
        last = i == len(entries) - 1
        connector = "└── " if last else "├── "
        suffix = "/" if entry.is_dir() else ""
        print(prefix + connector + entry.name + suffix)
        if entry.is_dir():
            ext = "    " if last else "│   "
            walk(entry.path, prefix + ext, gitignore_patterns)

root = "."
gitignore_patterns = load_gitignore(root)
print(".")
walk(root, gitignore_patterns=gitignore_patterns)
