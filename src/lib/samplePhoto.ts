// Pre-extracted OCR text for public/samples/ravi_report_photo.png (synthetic).
// "Use sample photo for Ravi" uses these lines instead of running OCR, so the
// demo never depends on OCR quality. Two lines keep realistic OCR slips
// ("6.l", "Creatinlne") with low confidence, so the lab sees what checking looks like.
import type { OcrLine } from "./ocr";

export const SAMPLE_PHOTO_FILE = "ravi_report_photo.png";

export const RAVI_PHOTO_OCR: OcrLine[] = [
  { text: "INARA DIAGNOSTICS", confidence: 95 },
  { text: "Synthetic demo laboratory · 12 Lake View Road, Bengaluru 560001", confidence: 88 },
  { text: "LAB REPORT Report ID: IND-26-03-0415", confidence: 90 },
  { text: "Patient: Ravi Kumar Sample collected: 15/03/2026", confidence: 93 },
  { text: "Age/Sex: 52 Y / M Reported: 15/03/2026", confidence: 91 },
  { text: "Ref. by: Dr. Meera Nair Sample: Blood, urine", confidence: 92 },
  { text: "TEST RESULT UNIT REFERENCE RANGE", confidence: 94 },
  { text: "DIABETES", confidence: 96 },
  { text: "Glycated Hb 6.l H % 4.0 - 5.6", confidence: 61 },
  { text: "FBS 6.55 H mmol/L 3.9 - 5.5", confidence: 91 },
  { text: "LIPID PROFILE", confidence: 95 },
  { text: "Total Chol 228 H mg/dL < 200", confidence: 93 },
  { text: "LDL-C 150 H mg/dL < 130", confidence: 92 },
  { text: "HDL-C 42 mg/dL > 40", confidence: 93 },
  { text: "TG 180 H mg/dL < 150", confidence: 90 },
  { text: "KIDNEY FUNCTION", confidence: 95 },
  { text: "S. Creatinlne 118.5 H µmol/L 62 - 115", confidence: 66 },
  { text: "Urine Alb/Creat ratio 45 H mg/g < 30", confidence: 88 },
  { text: "Serum Urea 32.1 mg/dL 15 - 43", confidence: 92 },
  { text: "Na+ 139 mEq/L 135 - 145", confidence: 90 },
  { text: "K+ 4.6 mmol/L 3.5 - 5.1", confidence: 89 },
  { text: "HAEMATOLOGY", confidence: 96 },
  { text: "Hgb 14.5 g/dL 13.0 - 17.0", confidence: 93 },
  { text: "MCV 88 fL 80 - 100", confidence: 94 },
  { text: "RBC Count 5.0 million/µL 4.5 - 5.9", confidence: 90 },
  { text: "Plt 250 10^3/µL 150 - 400", confidence: 87 },
  { text: "S. Ferritin 120 ng/mL 30 - 400", confidence: 92 },
  { text: "Vit B12 425 pg/mL 200 - 900", confidence: 91 },
  { text: "LIVER FUNCTION", confidence: 95 },
  { text: "SGOT 24 U/L < 40", confidence: 94 },
  { text: "SGPT 28 U/L < 40", confidence: 94 },
  { text: "Gamma GT 45 U/L < 55", confidence: 92 },
  { text: "OTHERS", confidence: 96 },
  { text: "TSH 3rd Gen 2.2 µIU/mL 0.4 - 4.0", confidence: 89 },
  { text: "25 OH Vit D 82.5 nmol/L 75 - 250", confidence: 90 },
  { text: "S. Uric Acid 6.3 mg/dL 3.4 - 7.0", confidence: 92 },
  { text: "hs-CRP 1.9 mg/L < 5", confidence: 91 },
  { text: "Serum Amylase 62 U/L 28 - 100", confidence: 92 },
  { text: "*** End of report *** Verified by: Lab technician", confidence: 84 },
  { text: "H = above reference range. Synthetic data for a prototype — not a real patient. Dr. A. Sen, MD (Pathology)", confidence: 82 },
];
