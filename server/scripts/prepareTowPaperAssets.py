import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from pypdf import PdfReader


def prepare(source, output):
    signature = {'version': 1, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
    files = ['page-1.png', 'page-2.png', 'page-3.png', 'fields.json', 'template.js']
    manifest = output / 'manifest.json'
    try:
        if json.loads(manifest.read_text()) == signature and all((output / name).is_file() for name in files):
            return 'cached'
    except (OSError, ValueError):
        pass
    reader = PdfReader(source)
    if len(reader.pages) != 3:
        raise ValueError('The tow paper template must contain three pages.')
    fields = []
    for index, page in enumerate(reader.pages):
        if abs(float(page.mediabox.width) - 612) > 1 or abs(float(page.mediabox.height) - 792) > 1:
            raise ValueError('The tow paper template must use letter-size pages.')
        for ref in page.get('/Annots', []):
            widget = ref.get_object()
            if widget.get('/Subtype') != '/Widget':
                continue
            parent = widget.get('/Parent')
            field = parent.get_object() if parent else widget
            fields.append({
                'name': str(widget.get('/T', field.get('/T', ''))),
                'type': str(widget.get('/FT', field.get('/FT', ''))),
                'page': index,
                'rect': [float(value) for value in widget['/Rect']],
            })
    names = {field['name'] for field in fields if field['type'] == '/Tx'}
    if not {'Airline', 'Aircraft Reg', 'Aircraft Type'}.issubset(names) or sum(field['type'] == '/Btn' for field in fields) != 50:
        raise ValueError('The PDF does not match the supported tow checklist fields.')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Finish all rendering before replacing the previous cached assets.
    with tempfile.TemporaryDirectory(prefix='tow-paper-', dir=output.parent) as temporary:
        staging = Path(temporary)
        subprocess.run([os.environ.get('PDF_RENDER_BIN', 'pdftoppm'), '-scale-to', '2200', '-png',
                        str(source), str(staging / 'page')], check=True, capture_output=True, timeout=120)
        (staging / 'fields.json').write_text(json.dumps(fields), encoding='utf-8')
        template = {'fields': fields, 'pages': [base64.b64encode((staging / f'page-{i}.png').read_bytes()).decode('ascii') for i in range(1, 4)]}
        (staging / 'template.js').write_text('window.TOW_TEMPLATE = ' + json.dumps(template) + ';\n', encoding='utf-8')
        (staging / 'manifest.json').write_text(json.dumps(signature), encoding='utf-8')
        output.mkdir(mode=0o700, exist_ok=True)
        for name in files + ['manifest.json']:
            (staging / name).chmod(0o600)
            os.replace(staging / name, output / name)
    return 'generated'


if __name__ == '__main__':
    try:
        print(prepare(Path(sys.argv[1]), Path(sys.argv[2])))
    except Exception as error:
        print(f'Unable to prepare private tow paper assets: {error}', file=sys.stderr)
        sys.exit(1)
