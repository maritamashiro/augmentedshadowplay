"""Bundle the local scripts and worker for an optional single-file download."""
import json
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent.parent
output = Path(sys.argv[1]) if len(sys.argv) > 1 else root.parent / 'Shadowplay.html'
html = (root / 'index.html').read_text()
worker = (root / 'silhouette-worker.js').read_text()


def inline(match):
    source = match.group(1).split('?')[0]
    code = (root / source).read_text()
    if source == 'silhouette.js':
        code = 'window.SHADOWPLAY_SEGMENTATION_WORKER = ' + json.dumps(worker) + ';\n' + code
    return '<script>\n' + code.replace('</script', '<\\/script') + '\n</script>'


html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
output.write_text(html)
print(f'Built {output.name} ({output.stat().st_size} bytes)')
