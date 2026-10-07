import io
import json
from pathlib import Path
import sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

RISK_RECTS = {
    'Tow from': {'red': (96, 628, 139, 648), 'amber': (141, 628, 192, 648), 'green': (192, 628, 266, 650)},
    'Tow to': {'red': (324, 628, 367, 648), 'amber': (369, 628, 427, 648), 'green': (430, 628, 504, 650)},
    'Final agreed status': {'green': (34, 146, 198, 168), 'amber': (215, 146, 375, 168), 'red': (392, 146, 552, 168)},
}
COLORS = {'red': (.9, .1, .1), 'amber': (.8, .45, 0), 'green': (.2, .7, .1)}


def generate(payload):
    assets = Path(payload['assetsPath'])
    fields = json.loads(assets.joinpath('fields.json').read_text(encoding='utf-8'))
    state = payload['state']
    checks = [field for field in fields if field['type'] == '/Btn']
    output = io.BytesIO()
    paper = canvas.Canvas(output, pagesize=(612, 792))
    for page in range(3):
        paper.drawImage(str(assets / f'page-{page + 1}.png'), 0, 0, width=612, height=792)
        for field in fields:
            if field['page'] != page or field['type'] != '/Tx' or field['name'] == 'RED':
                continue
            value = state['text'].get(field['name'], '')
            if not value:
                continue
            x, y, right, top = field['rect']
            width = right - x - 4
            size = min(10, max(5, width / max(stringWidth(value, 'Helvetica', 1), .01)))
            if stringWidth(value, 'Helvetica', size) > width:
                raise ValueError(f"Text is too long in {field['name']}. Shorten it before exporting.")
            paper.setFillColorRGB(0, 0, 0)
            paper.setFont('Helvetica', size)
            paper.drawString(x + 2, top - size - 1, value)
        for index, field in enumerate(checks):
            expected = 'yes' if index % 2 == 0 else 'no'
            if field['page'] != page or state['answers'].get(str(index // 2)) != expected:
                continue
            x, y, right, top = field['rect']
            paper.setFillColorRGB(0, 0, 0)
            paper.setFont('Helvetica-Bold', 11)
            paper.drawString((x + right) / 2 - 3.5, (y + top) / 2 - 4, 'X')
        if page == 0:
            for key, options in RISK_RECTS.items():
                color = state['risk'].get(key)
                if color in options:
                    paper.setStrokeColorRGB(*COLORS[color])
                    paper.setLineWidth(1.6)
                    paper.ellipse(*options[color], stroke=1, fill=0)
        paper.showPage()
    paper.save()
    return output.getvalue()


if __name__ == '__main__':
    sys.stdout.buffer.write(generate(json.load(sys.stdin)))
