// Public factual reference data, transcribed from the linked USMLE booklet.
// Keep the source's ranges (including its classifications), not local lab cutoffs.
// Printed pages and zero-based PDF page indices are both 7–9 for this edition.
export const LAB_SOURCE = {
  url: 'https://www.usmle.org/sites/default/files/2021-10/Step_1_Sample_Items.pdf#page=8',
  edition: 'April 2026', pages: '7–9', checked: '2026-10-14',
} as const
export interface LabValue {
  id: string
  name: string
  context?: string
  reference: string
  si: string | null
  aliases?: string
}
export interface LabSection {
  id: string
  label: string
  specimen: string
  page: 7 | 8 | 9
  rows: readonly LabValue[]
}
const row = (id: string, name: string, reference: string, si: string | null, context?: string, aliases?: string): LabValue =>
  ({ id, name, reference, si, ...(context ? { context } : {}), ...(aliases ? { aliases } : {}) })

export const LAB_SECTIONS: readonly LabSection[] = [
  { id: 'chemistry', label: 'General chemistry', specimen: 'Serum', page: 7, rows: [
    row('sodium', 'Sodium (Na⁺)', '136–146 mEq/L', '136–146 mmol/L', undefined, 'electrolytes'),
    row('potassium', 'Potassium (K⁺)', '3.5–5.0 mEq/L', '3.5–5.0 mmol/L', undefined, 'electrolytes'),
    row('chloride', 'Chloride (Cl⁻)', '95–105 mEq/L', '95–105 mmol/L', undefined, 'electrolytes'),
    row('bicarbonate', 'Bicarbonate (HCO₃⁻)', '22–28 mEq/L', '22–28 mmol/L', undefined, 'electrolytes'),
    row('bun', 'Urea nitrogen', '7–18 mg/dL', '2.5–6.4 mmol/L', undefined, 'BUN renal'),
    row('creatinine', 'Creatinine', '0.6–1.2 mg/dL', '53–106 μmol/L', undefined, 'renal'),
    row('glucose-fasting', 'Glucose', '70–100 mg/dL', '3.8–5.6 mmol/L', 'Fasting'),
    row('glucose-random', 'Glucose', '<140 mg/dL', '<7.77 mmol/L', 'Random, non-fasting'),
    row('calcium', 'Calcium', '8.4–10.2 mg/dL', '2.1–2.6 mmol/L'),
    row('magnesium', 'Magnesium (Mg²⁺)', '1.5–2.0 mg/dL', '0.75–1.0 mmol/L'),
    row('phosphorus', 'Phosphorus (inorganic)', '3.0–4.5 mg/dL', '1.0–1.5 mmol/L', undefined, 'phosphate'),
  ] },
  { id: 'hepatic', label: 'Hepatic & proteins', specimen: 'Serum', page: 7, rows: [
    row('alt', 'Alanine aminotransferase (ALT)', '10–40 U/L', '10–40 U/L'),
    row('ast', 'Aspartate aminotransferase (AST)', '12–38 U/L', '12–38 U/L'),
    row('alkaline-phosphatase', 'Alkaline phosphatase', '25–100 U/L', '25–100 U/L', undefined, 'ALP'),
    row('bilirubin-total', 'Bilirubin', '0.1–1.0 mg/dL', '2–17 μmol/L', 'Total'),
    row('bilirubin-direct', 'Bilirubin', '0.0–0.3 mg/dL', '0–5 μmol/L', 'Direct'),
    row('serum-protein', 'Proteins, total', '6.0–7.8 g/dL', '60–78 g/L'),
    row('albumin', 'Albumin', '3.5–5.5 g/dL', '35–55 g/L'),
    row('globulin', 'Globulin', '2.3–3.5 g/dL', '23–35 g/L'),
  ] },
  { id: 'other-serum', label: 'Other serum tests', specimen: 'Serum & renal function', page: 7, rows: [
    row('amylase', 'Amylase', '25–125 U/L', '25–125 U/L'),
    row('lipase', 'Lipase', '13–60 U/L', '13–60 U/L'),
    row('crcl-male', 'Creatinine clearance', '97–137 mL/min', '97–137 mL/min', 'Male', 'CrCl renal'),
    row('crcl-female', 'Creatinine clearance', '88–128 mL/min', '88–128 mL/min', 'Female', 'CrCl renal'),
    row('ck-male', 'Creatine kinase', '25–90 U/L', '25–90 U/L', 'Male', 'CK CPK'),
    row('ck-female', 'Creatine kinase', '10–70 U/L', '10–70 U/L', 'Female', 'CK CPK'),
    row('ldh', 'Lactate dehydrogenase', '45–200 U/L', '45–200 U/L', undefined, 'LDH'),
    row('serum-osmolality', 'Osmolality', '275–295 mOsmol/kg H₂O', '275–295 mOsmol/kg H₂O'),
    row('troponin', 'Troponin I', '≤0.04 ng/mL', '≤0.04 μg/L'),
    row('uric-acid', 'Uric acid', '3.0–8.2 mg/dL', '0.18–0.48 mmol/L'),
  ] },
  { id: 'lipids', label: 'Lipids', specimen: 'Serum', page: 7, rows: [
    row('cholesterol-normal', 'Cholesterol, total', '<200 mg/dL', '<5.2 mmol/L', 'Normal'),
    row('cholesterol-high', 'Cholesterol, total', '>240 mg/dL', '>6.2 mmol/L', 'High'),
    row('hdl', 'Cholesterol, HDL', '40–60 mg/dL', '1.0–1.6 mmol/L'),
    row('ldl', 'Cholesterol, LDL', '<160 mg/dL', '<4.2 mmol/L'),
    row('triglycerides-normal', 'Triglycerides', '<150 mg/dL', '<1.70 mmol/L', 'Normal'),
    row('triglycerides-borderline', 'Triglycerides', '151–199 mg/dL', '1.71–2.25 mmol/L', 'Borderline'),
  ] },
  { id: 'iron', label: 'Iron studies', specimen: 'Serum', page: 7, rows: [
    row('ferritin-male', 'Ferritin', '20–250 ng/mL', '20–250 μg/L', 'Male'),
    row('ferritin-female', 'Ferritin', '10–120 ng/mL', '10–120 μg/L', 'Female'),
    row('iron-male', 'Iron', '65–175 μg/dL', '11.6–31.3 μmol/L', 'Male'),
    row('iron-female', 'Iron', '50–170 μg/dL', '9.0–30.4 μmol/L', 'Female'),
    row('tibc', 'Total iron-binding capacity', '250–400 μg/dL', '44.8–71.6 μmol/L', undefined, 'TIBC'),
    row('transferrin', 'Transferrin', '200–360 mg/dL', '2.0–3.6 g/L'),
  ] },
  { id: 'endocrine', label: 'Endocrine', specimen: 'Hormones & endocrine testing', page: 8, rows: [
    row('fsh-male', 'Follicle-stimulating hormone', '4–25 mIU/mL', '4–25 IU/L', 'Male', 'FSH'),
    row('fsh-premenopause', 'Follicle-stimulating hormone', '4–30 mIU/mL', '4–30 IU/L', 'Female · premenopause', 'FSH'),
    row('fsh-midcycle', 'Follicle-stimulating hormone', '10–90 mIU/mL', '10–90 IU/L', 'Female · midcycle peak', 'FSH'),
    row('fsh-postmenopause', 'Follicle-stimulating hormone', '40–250 mIU/mL', '40–250 IU/L', 'Female · postmenopause', 'FSH'),
    row('lh-male', 'Luteinizing hormone', '6–23 mIU/mL', '6–23 IU/L', 'Male', 'LH'),
    row('lh-follicular', 'Luteinizing hormone', '5–30 mIU/mL', '5–30 IU/L', 'Female · follicular phase', 'LH'),
    row('lh-midcycle', 'Luteinizing hormone', '75–150 mIU/mL', '75–150 IU/L', 'Female · midcycle', 'LH'),
    row('lh-postmenopause', 'Luteinizing hormone', '30–200 mIU/mL', '30–200 IU/L', 'Female · postmenopause', 'LH'),
    row('gh-fasting', 'Growth hormone · arginine stimulation', '<5 ng/mL', '<5 μg/L', 'Fasting', 'GH'),
    row('gh-stimulated', 'Growth hormone · arginine stimulation', '>7 ng/mL', '>7 μg/L', 'Provocative stimuli', 'GH'),
    row('prolactin-male', 'Prolactin (hPRL)', '<17 ng/mL', '<17 μg/L', 'Male'),
    row('prolactin-female', 'Prolactin (hPRL)', '<25 ng/mL', '<25 μg/L', 'Female'),
    row('cortisol-0800', 'Cortisol', '5–23 μg/dL', '138–635 nmol/L', '0800 h'),
    row('cortisol-1600', 'Cortisol', '3–15 μg/dL', '82–413 nmol/L', '1600 h'),
    row('cortisol-2000', 'Cortisol', '<50% of 0800 h', 'Fraction of 0800 h: <0.50', '2000 h'),
    row('tsh', 'TSH', '0.4–4.0 μU/mL', '0.4–4.0 mIU/L', undefined, 'thyroid stimulating hormone'),
    row('t3', 'Triiodothyronine (T3) (RIA)', '100–200 ng/dL', '1.5–3.1 nmol/L'),
    row('t3-uptake', 'Triiodothyronine (T3) resin uptake', '25%–35%', '0.25–0.35'),
    row('t4', 'Thyroxine (T4)', '5–12 μg/dL', '64–155 nmol/L'),
    row('t4-free', 'Free T4', '0.9–1.7 ng/dL', '12.0–21.9 pmol/L', undefined, 'thyroxine'),
    row('iodine-uptake', 'Thyroidal iodine (¹²³I) uptake', '8%–30% of administered dose/24 h', '0.08–0.30/24 h', '24-hour thyroid uptake'),
    row('pth', 'Intact PTH', '10–60 pg/mL', '10–60 ng/L', undefined, 'parathyroid hormone'),
    row('hydroxycorticosteroids-male', '17-Hydroxycorticosteroids', '3.0–10.0 mg/24 h', '8.2–27.6 μmol/24 h', 'Male · 24-hour urine'),
    row('hydroxycorticosteroids-female', '17-Hydroxycorticosteroids', '2.0–8.0 mg/24 h', '5.5–22.0 μmol/24 h', 'Female · 24-hour urine'),
    row('ketosteroids-male', '17-Ketosteroids, total', '8–20 mg/24 h', '28–70 μmol/24 h', 'Male · 24-hour urine'),
    row('ketosteroids-female', '17-Ketosteroids, total', '6–15 mg/24 h', '21–52 μmol/24 h', 'Female · 24-hour urine'),
  ] },
  { id: 'immunoglobulins', label: 'Immunoglobulins', specimen: 'Serum', page: 8, rows: [
    row('iga', 'IgA', '76–390 mg/dL', '0.76–3.90 g/L'),
    row('ige', 'IgE', '0–380 IU/mL', '0–380 kIU/L'),
    row('igg', 'IgG', '650–1500 mg/dL', '6.5–15.0 g/L'),
    row('igm', 'IgM', '50–300 mg/dL', '0.5–3.0 g/L'),
  ] },
  { id: 'blood-gases', label: 'Arterial blood gases', specimen: 'Room air', page: 8, rows: [
    row('po2', 'PO₂', '75–105 mm Hg', '10.0–14.0 kPa', undefined, 'PaO2 oxygen ABG'),
    row('pco2', 'PCO₂', '33–45 mm Hg', '4.4–5.9 kPa', undefined, 'PaCO2 carbon dioxide ABG'),
    row('ph', 'pH', '7.35–7.45', '[H⁺] 36–44 nmol/L', undefined, 'ABG'),
  ] },
  { id: 'csf', label: 'Cerebrospinal fluid', specimen: 'CSF', page: 8, rows: [
    row('csf-cells', 'Cell count', '0–5/mm³', '0–5 × 10⁶/L'),
    row('csf-chloride', 'Chloride', '118–132 mEq/L', '118–132 mmol/L'),
    row('csf-gamma-globulin', 'Gamma globulin', '3%–12% total proteins', '0.03–0.12'),
    row('csf-glucose', 'Glucose', '40–70 mg/dL', '2.2–3.9 mmol/L'),
    row('csf-pressure', 'Pressure', '70–180 mm H₂O', '70–180 mm H₂O'),
    row('csf-protein', 'Proteins, total', '<40 mg/dL', '<0.40 g/L'),
  ] },
  { id: 'cbc', label: 'Complete blood count', specimen: 'Hematologic · CBC', page: 9, rows: [
    row('hematocrit-male', 'Hematocrit', '41%–53%', '0.41–0.53', 'Male', 'Hct'),
    row('hematocrit-female', 'Hematocrit', '36%–46%', '0.36–0.46', 'Female', 'Hct'),
    row('hemoglobin-male', 'Hemoglobin, blood', '13.5–17.5 g/dL', '135–175 g/L', 'Male', 'Hb Hgb'),
    row('hemoglobin-female', 'Hemoglobin, blood', '12.0–16.0 g/dL', '120–160 g/L', 'Female', 'Hb Hgb'),
    row('mch', 'Mean corpuscular hemoglobin (MCH)', '25–35 pg/cell', '0.39–0.54 fmol/cell'),
    row('mchc', 'Mean corpuscular hemoglobin concentration (MCHC)', '31%–36% Hb/cell', '4.8–5.6 mmol Hb/L'),
    row('mcv', 'Mean corpuscular volume (MCV)', '80–100 μm³', '80–100 fL'),
    row('plasma-volume-male', 'Plasma volume', '25–43 mL/kg', '0.025–0.043 L/kg', 'Male'),
    row('plasma-volume-female', 'Plasma volume', '28–45 mL/kg', '0.028–0.045 L/kg', 'Female'),
    row('red-cell-volume-male', 'Red cell volume', '20–36 mL/kg', '0.020–0.036 L/kg', 'Male'),
    row('red-cell-volume-female', 'Red cell volume', '19–31 mL/kg', '0.019–0.031 L/kg', 'Female'),
    row('wbc', 'Leukocyte count (WBC)', '4500–11,000/mm³', '4.5–11.0 × 10⁹/L'),
    row('neutrophils-segmented', 'Neutrophils, segmented', '54%–62%', '0.54–0.62'),
    row('neutrophils-bands', 'Neutrophils, bands', '3%–5%', '0.03–0.05'),
    row('lymphocytes', 'Lymphocytes', '25%–33%', '0.25–0.33'),
    row('monocytes', 'Monocytes', '3%–7%', '0.03–0.07'),
    row('eosinophils', 'Eosinophils', '1%–3%', '0.01–0.03'),
    row('basophils', 'Basophils', '0%–0.75%', '0.00–0.0075'),
    row('platelets', 'Platelet count', '150,000–400,000/mm³', '150–400 × 10⁹/L'),
  ] },
  { id: 'coagulation', label: 'Coagulation', specimen: 'Hematologic', page: 9, rows: [
    row('ptt', 'Partial thromboplastin time (PTT/aPTT), activated', '25–40 seconds', '25–40 seconds'),
    row('pt', 'Prothrombin time (PT)', '11–15 seconds', '11–15 seconds'),
    row('d-dimer', 'D-dimer', '≤250 ng/mL', '≤1.4 nmol/L'),
  ] },
  { id: 'other-hematologic', label: 'Other hematologic tests', specimen: 'Hematologic', page: 9, rows: [
    row('reticulocytes', 'Reticulocyte count', '0.5%–1.5%', '0.005–0.015'),
    row('rbc-male', 'Erythrocyte count (RBC)', '4.3–5.9 million/mm³', '4.3–5.9 × 10¹²/L', 'Male'),
    row('rbc-female', 'Erythrocyte count (RBC)', '3.5–5.5 million/mm³', '3.5–5.5 × 10¹²/L', 'Female'),
    row('esr-male', 'Erythrocyte sedimentation rate (Westergren)', '0–15 mm/h', '0–15 mm/h', 'Male', 'ESR'),
    row('esr-female', 'Erythrocyte sedimentation rate (Westergren)', '0–20 mm/h', '0–20 mm/h', 'Female', 'ESR'),
    row('cd4', 'CD4⁺ T-lymphocyte count', '≥500/mm³', '≥0.5 × 10⁹/L'),
  ] },
  { id: 'blood-endocrine', label: 'Hemoglobin A1c', specimen: 'Hematologic · Endocrine', page: 9, rows: [
    row('hba1c', 'Hemoglobin A1c', '≤6%', '≤42 mmol/mol', undefined, 'HbA1c glycated hemoglobin'),
  ] },
  { id: 'urine', label: 'Urine', specimen: 'Urine', page: 9, rows: [
    row('urine-calcium', 'Calcium', '100–300 mg/24 h', '2.5–7.5 mmol/24 h'),
    row('urine-osmolality', 'Osmolality', '50–1200 mOsmol/kg H₂O', '50–1200 mOsmol/kg H₂O'),
    row('urine-oxalate', 'Oxalate', '8–40 μg/mL', '90–445 μmol/L'),
    row('urine-protein', 'Proteins, total', '<150 mg/24 h', '<0.15 g/24 h'),
  ] },
  { id: 'bmi', label: 'Body mass index', specimen: 'Adult', page: 9, rows: [
    row('bmi', 'Body mass index (BMI)', '19–25 kg/m²', null, 'Adult'),
  ] },
]

const normalize = (value: string) => value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '')
export function filterLabSections(search: string, sectionId = 'all'): LabSection[] {
  const terms = normalize(search).trim().split(/\s+/).filter(Boolean)
  return LAB_SECTIONS.filter(section => sectionId === 'all' || section.id === sectionId).map(section => ({ ...section,
    rows: section.rows.filter(value => {
      const text = normalize([section.label, section.specimen, value.name, value.context, value.aliases].join(' '))
      return terms.every(term => text.includes(term))
    }),
  })).filter(section => section.rows.length > 0)
}
