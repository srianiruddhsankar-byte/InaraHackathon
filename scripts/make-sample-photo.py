"""Generate public/samples/ravi_report_photo.png — a SYNTHETIC lab report photo.

Same values as public/samples/ravi_report.csv. Synthetic data only (fake lab,
fake patient). Run: python3 scripts/make-sample-photo.py  (needs Pillow, macOS fonts).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = Path("/System/Library/Fonts/Supplemental")
REG = str(FONTS / "Arial.ttf")
BOLD = str(FONTS / "Arial Bold.ttf")

W, H = 1240, 1754
INK = (28, 33, 40)
MUTED = (95, 104, 115)
TEAL = (13, 148, 136)
LINE = (205, 210, 215)

SECTIONS = [
    ("DIABETES", [("Glycated Hb", "6.1", "H", "%", "4.0 - 5.6"), ("FBS", "6.55", "H", "mmol/L", "3.9 - 5.5")]),
    ("LIPID PROFILE", [
        ("Total Chol", "228", "H", "mg/dL", "< 200"),
        ("LDL-C", "150", "H", "mg/dL", "< 130"),
        ("HDL-C", "42", "", "mg/dL", "> 40"),
        ("TG", "180", "H", "mg/dL", "< 150"),
    ]),
    ("KIDNEY FUNCTION", [
        ("S. Creatinine", "118.5", "H", "µmol/L", "62 - 115"),
        ("Urine Alb/Creat ratio", "45", "H", "mg/g", "< 30"),
        ("Serum Urea", "32.1", "", "mg/dL", "15 - 43"),
        ("Na+", "139", "", "mEq/L", "135 - 145"),
        ("K+", "4.6", "", "mmol/L", "3.5 - 5.1"),
    ]),
    ("HAEMATOLOGY", [
        ("Hgb", "14.5", "", "g/dL", "13.0 - 17.0"),
        ("MCV", "88", "", "fL", "80 - 100"),
        ("RBC Count", "5.0", "", "million/µL", "4.5 - 5.9"),
        ("Plt", "250", "", "10^3/µL", "150 - 400"),
        ("S. Ferritin", "120", "", "ng/mL", "30 - 400"),
        ("Vit B12", "425", "", "pg/mL", "200 - 900"),
    ]),
    ("LIVER FUNCTION", [
        ("SGOT", "24", "", "U/L", "< 40"),
        ("SGPT", "28", "", "U/L", "< 40"),
        ("Gamma GT", "45", "", "U/L", "< 55"),
    ]),
    ("OTHERS", [
        ("TSH 3rd Gen", "2.2", "", "µIU/mL", "0.4 - 4.0"),
        ("25 OH Vit D", "82.5", "", "nmol/L", "75 - 250"),
        ("S. Uric Acid", "6.3", "", "mg/dL", "3.4 - 7.0"),
        ("hs-CRP", "1.9", "", "mg/L", "< 5"),
        ("Serum Amylase", "62", "", "U/L", "28 - 100"),
    ]),
]


def font(path, size):
    return ImageFont.truetype(path, size)


def main():
    page = Image.new("RGB", (W, H), (252, 251, 247))
    d = ImageDraw.Draw(page)

    # Header
    d.rounded_rectangle((70, 60, 150, 140), radius=18, fill=TEAL)
    d.text((110, 100), "I", font=font(BOLD, 52), fill="white", anchor="mm")
    d.text((175, 66), "INARA DIAGNOSTICS", font=font(BOLD, 40), fill=INK)
    d.text((175, 116), "Synthetic demo laboratory · 12 Lake View Road, Bengaluru 560001", font=font(REG, 20), fill=MUTED)
    d.text((W - 70, 70), "LAB REPORT", font=font(BOLD, 26), fill=TEAL, anchor="ra")
    d.text((W - 70, 108), "Report ID: IND-26-03-0415", font=font(REG, 19), fill=MUTED, anchor="ra")
    d.line((70, 168, W - 70, 168), fill=TEAL, width=4)

    # Patient box
    d.rounded_rectangle((70, 190, W - 70, 320), radius=10, outline=LINE, width=2)
    f = font(REG, 23)
    fb = font(BOLD, 23)
    d.text((95, 210), "Patient:", font=f, fill=MUTED)
    d.text((200, 210), "Ravi Kumar", font=fb, fill=INK)
    d.text((95, 250), "Age/Sex:", font=f, fill=MUTED)
    d.text((200, 250), "52 Y / M", font=fb, fill=INK)
    d.text((95, 288), "Ref. by:", font=f, fill=MUTED)
    d.text((200, 288), "Dr. Meera Nair", font=fb, fill=INK)
    d.text((660, 210), "Sample collected:", font=f, fill=MUTED)
    d.text((880, 210), "15/03/2026", font=fb, fill=INK)
    d.text((660, 250), "Reported:", font=f, fill=MUTED)
    d.text((880, 250), "15/03/2026", font=fb, fill=INK)
    d.text((660, 288), "Sample:", font=f, fill=MUTED)
    d.text((880, 288), "Blood, urine", font=fb, fill=INK)

    # Table header
    cols = [95, 560, 760, 960]
    y = 350
    d.rectangle((70, y, W - 70, y + 46), fill=(232, 245, 243))
    for x, label in zip(cols, ["TEST", "RESULT", "UNIT", "REFERENCE RANGE"]):
        d.text((x, y + 12), label, font=font(BOLD, 21), fill=TEAL)
    y += 62

    row_f = font(REG, 24)
    val_f = font(BOLD, 24)
    for title, rows in SECTIONS:
        y += 6
        d.text((95, y + 22), title, font=font(BOLD, 19), fill=MUTED, anchor="ls")
        y += 34
        for name, value, flag, unit, ref in rows:
            base = y + 24  # shared baseline so every column lines up
            d.text((95, base), name, font=row_f, fill=INK, anchor="ls")
            d.text((cols[1], base), value + (f" {flag}" if flag else ""), font=val_f, fill=(185, 28, 28) if flag else INK, anchor="ls")
            d.text((cols[2], base), unit, font=row_f, fill=INK, anchor="ls")
            d.text((cols[3], base), ref, font=row_f, fill=INK, anchor="ls")
            y += 36
            d.line((95, y - 4, W - 95, y - 4), fill=(234, 236, 238), width=1)

    # Footer, right after the table
    y += 40
    d.line((70, y, W - 70, y), fill=LINE, width=2)
    d.text((95, y + 22), "*** End of report ***", font=font(REG, 20), fill=MUTED)
    d.text((95, y + 56), "H = above reference range. Synthetic data for a prototype — not a real patient.", font=font(REG, 19), fill=MUTED)
    d.text((W - 95, y + 22), "Verified by: Lab technician", font=font(REG, 20), fill=MUTED, anchor="ra")
    d.text((W - 95, y + 56), "Dr. A. Sen, MD (Pathology)", font=font(BOLD, 20), fill=INK, anchor="ra")

    # Make it look photographed: on a desk, slightly rotated, soft light, a little noise.
    canvas = Image.new("RGB", (W + 160, H + 160), (120, 112, 100))
    shadow = Image.new("L", (W, H), 0).point(lambda _: 120)
    canvas.paste((60, 55, 48), (92, 96), mask=shadow.filter(ImageFilter.GaussianBlur(12)))
    canvas.paste(page, (80, 80))
    photo = canvas.rotate(-0.8, resample=Image.Resampling.BICUBIC, expand=False, fillcolor=(120, 112, 100))
    light = Image.linear_gradient("L").resize(photo.size).point(lambda v: 225 + v // 10)
    photo = Image.composite(photo, Image.new("RGB", photo.size, (0, 0, 0)), light)
    photo = photo.filter(ImageFilter.GaussianBlur(0.4))
    photo = photo.resize((photo.width * 3 // 4, photo.height * 3 // 4), Image.Resampling.LANCZOS)

    out = Path(__file__).resolve().parent.parent / "public" / "samples" / "ravi_report_photo.png"
    photo.save(out, optimize=True)
    print(out, photo.size)


if __name__ == "__main__":
    main()
