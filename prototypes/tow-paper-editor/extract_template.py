import base64
import json
from pathlib import Path
import sys
from pypdf import PdfReader

source = Path(sys.argv[1])
reader = PdfReader(source)
fields = []
for index, page in enumerate(reader.pages):
    for ref in page.get('/Annots', []):
        widget = ref.get_object()
        if widget.get('/Subtype') == '/Widget':
            fields.append({
                'name': str(widget.get('/T', '')),
                'type': str(widget.get('/FT', '')),
                'page': index,
                'rect': [float(value) for value in widget['/Rect']],
            })
assets = Path(__file__).with_name('assets')
assets.joinpath('fields.json').write_text(json.dumps(fields), encoding='utf-8')
data = {'pages': [base64.b64encode(assets.joinpath(f'page-{index+1}.png').read_bytes()).decode('ascii') for index in range(len(reader.pages))], 'fields': fields}
Path(__file__).with_name('assets').joinpath('template.js').write_text('window.TOW_TEMPLATE = ' + json.dumps(data) + ';\n', encoding='utf-8')
