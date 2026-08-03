#!/usr/bin/env python3
import io
import json
import sys

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject
from reportlab.pdfgen import canvas


TEXT_FIELD_FONT_SIZE = 10


def set_text_field_font_size(writer):
    fields = writer.get_fields() or {}
    for field in fields.values():
        if field.get("/FT") == "/Tx":
            field[NameObject("/DA")] = TextStringObject(f"/Helv {TEXT_FIELD_FONT_SIZE} Tf 0 g")

    for page in writer.pages:
        for annot_ref in page.get("/Annots", []):
            annot = annot_ref.get_object()
            field_type = annot.get("/FT")
            parent = annot.get("/Parent")
            if not field_type and parent:
                field_type = parent.get_object().get("/FT")
            if field_type == "/Tx":
                annot[NameObject("/DA")] = TextStringObject(f"/Helv {TEXT_FIELD_FONT_SIZE} Tf 0 g")


def draw_mark(c, x, y):
    c.setFont("Helvetica-Bold", 11)
    c.setFillColorRGB(0.02, 0.04, 0.08)
    c.drawString(x, y, "X")


def draw_circle(c, x, y, width, height):
    c.setStrokeColorRGB(0.12, 0.72, 0.2)
    c.setLineWidth(1.6)
    c.ellipse(x, y, x + width, y + height)


def create_overlay(page_width, page_height, page_number, payload):
    packet = io.BytesIO()
    c = canvas.Canvas(packet, pagesize=(page_width, page_height))

    if page_number == 0:
        draw_circle(c, 192, 628, 74, 22)
        draw_circle(c, 430, 628, 74, 22)
        draw_circle(c, 34, 146, 164, 22)

    if page_number == 1:
        check_x = 258
        x_column = 280
        tow_prep_step_6_exception = payload.get("towPrepStep6Exception", False)
        for y in [466, 442, 417, 392, 335, 285, 250, 215, 190, 165]:
            draw_mark(c, check_x, y)
        draw_mark(c, x_column if tow_prep_step_6_exception else check_x, 310)

    if page_number == 2:
        check_x = 258
        x_column = 280
        bypass_pin_completion_exception = payload.get("bypassPinCompletionException", False)
        for y in [614, 589, 564]:
            draw_mark(c, check_x, y)
        draw_mark(c, x_column, 516)
        for y in [492, 466, 430, 388, 315, 290, 265, 240, 180]:
            draw_mark(c, check_x, y)
        draw_mark(c, x_column if bypass_pin_completion_exception else check_x, 215)

    c.save()
    packet.seek(0)
    return PdfReader(packet).pages[0]


def fill_pdf(payload):
    reader = PdfReader(payload["templatePath"])
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    set_text_field_font_size(writer)
    writer.update_page_form_field_values(None, payload["fields"], auto_regenerate=False, flatten=True)
    writer.remove_annotations(subtypes="/Widget")
    writer.root_object.pop(NameObject("/AcroForm"), None)

    for index, page in enumerate(writer.pages):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        page.merge_page(create_overlay(width, height, index, payload))

    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def main():
    payload = json.load(sys.stdin)
    sys.stdout.buffer.write(fill_pdf(payload))


if __name__ == "__main__":
    main()
