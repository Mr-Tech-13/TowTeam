import sys
from reportlab.pdfgen import canvas

paper = canvas.Canvas(sys.argv[1], pagesize=(612, 792))
paper.drawString(40, 740, sys.argv[2] if len(sys.argv) > 2 else 'Test template')
for index, name in enumerate(['Airline', 'Aircraft Reg', 'Aircraft Type']):
    paper.acroForm.textfield(name=name, x=40, y=680 - index * 30, width=150, height=20)
paper.showPage()
for page, rows in [(1, 14), (2, 11)]:
    for row in range(rows):
        for answer in range(2):
            paper.acroForm.checkbox(name=f'check-{page}-{row}-{answer}', x=40 + answer * 30, y=700 - row * 35)
    paper.showPage()
paper.save()
