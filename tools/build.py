"""Builds card-zoom.html: index.html with every local <script src> inlined, so the page
works as one file (opened from disk, previewed, emailed). Run: python3 tools/build.py"""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text()

def inline(m):
    src = m.group(1)
    code = (root / src).read_text().replace('</script', '<\\/script')
    return f'<script>\n// ---- {src} ----\n{code}\n</script>'

out = re.sub(r'<script src="((?:core|web)/[^"]+)"></script>', inline, html)
(root / 'card-zoom.html').write_text(out)
print('wrote', root / 'card-zoom.html', len(out), 'bytes')
