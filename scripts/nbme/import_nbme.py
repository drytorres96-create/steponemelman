#!/usr/bin/env python3
"""Reconcile supplied NBME exports into a PRIVATE study bank.

No network, credentials, medical answer inference, image editing, or public writes.
`ready` means conservative structural checks passed, never medical certification.
The source files must remain private; this generic script can be version controlled.
"""
from __future__ import annotations
import argparse
import collections
import hashlib
import io
import json
import re
import string
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

IMPORTER_VERSION = "1.0.1"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REASONS = {
 "figure_not_ready": "La figura o tabla necesaria no dispone de una versión íntegra y revisada para responder.",
 "missing_stem": "El enunciado está ausente o incompleto.",
 "missing_options": "Hay menos de tres opciones disponibles.",
 "nonconsecutive_options": "Faltan letras de opciones o su identificación requiere cotejo con la fuente.",
 "empty_option": "Una opción está vacía.",
 "duplicate_options": "Hay opciones con texto idéntico; puede haberse perdido información al extraerlas.",
 "missing_answer": "No se extrajo una clave de respuesta.",
 "answer_not_in_options": "La clave no corresponde a ninguna opción disponible.",
 "missing_explanation": "No hay una explicación suficiente para la corrección.",
 "incomplete_option_set": "La fuente enumera una opción que falta en la lista de respuestas.",
 "option_layout_requires_review": "Las opciones contienen varias columnas cuya alineación requiere cotejo con la fuente.",
 "option_ocr_artifacts": "Las opciones contienen indicios de flechas, columnas o letras dañadas por OCR.",
 "critical_value_ocr": "La extracción dañó una edad, un valor de laboratorio o un símbolo farmacológico; necesita cotejo con la fuente.",
 "stem_ocr_artifacts": "El enunciado contiene fragmentos ilegibles que requieren cotejo con la fuente.",
 "unresolved_source_conflict": "Las fuentes discrepan en un dato necesario para responder.",
 "editorial_review_required": "La revisión editorial de este registro sigue pendiente.",
}
SYSTEM_RULES = {
 "Cardiovascular": r"cardiac|myocardi|ventric|aortic|coronary|heart fail|heart sound|endocardi|pericardi|cardiomy|sarcomere|blood pressure|hypertension|arterial pressure|atrium|atrial|mitral|tricuspid|angina|cardiac output|atherosclero",
 "Endocrino": r"thyroid|parathyroid|pituitar|adrenal|insulin|diabetes|glucagon|cortisol|aldosterone|prolactin|acromegaly|growth hormone|catecholamine|hypoglyc|hyperglyc|cushing|addison|pheochromocyt|endocrin",
 "Gastrointestinal": r"hepati|hepatoc|liver|bili(?:ary|rubin)|gallbladder|cholecyst|intestin|duoden|jejun|ileum|ileal|colon|colonic|gastric|stomach|pancreat|esophag|celiac|crohn|ulcerative colitis|steatorrhea|portal vein|cirrhosis|digest",
 "Hematológico y oncológico": r"erythroc|hemoglob|anemia|leukemi|lymphoma|platelet|thrombocyt|coagul|hemophil|hemolys|hemolyt|myeloma|hematopo|leukocyte|neutropenia|bone marrow|carcinoma|oncogen|tumor suppressor|malignan|metastas",
 "Musculoesquelético": r"skeletal|musculoskel|myosin|\bactin\b|osteopor|osteoclast|osteoblast|osteomal|osteomyel|rheumatoid|arthritis|synov|tendon|ligament|fracture|femur|tibia|humerus|muscular dystrophy|dermatomyos|myasthenia|epiderm|dermatit|cutaneous|keratin|psoriasis|skin lesion",
 "Neurológico": r"cerebr|cerebell|neur(?:o|on)|brain|spinal cord|seizure|epilep|parkinson|alzheimer|dementia|stroke|aphasia|hemipares|neuropath|cranial nerve|acetylcholin|dopamin|schizophren|depressi|bipolar|mania|anxiety|psychosis|psychiatr|obsessive|attention.deficit|optic|retina|glaucoma|auditory|cochlea",
 "Renal": r"renal|kidney|glomerul|nephro|nephri|nephrot|urinary|ureter|urethra|collecting duct|loop of henle|proximal tubul|distal tubul|creatinine clearance|glomerular filtration|urine osmola|urine sodium|bladder",
 "Reproductivo": r"ovari|uterus|uterine|endometr|cervix|cervical cancer|vagina|testic|testes|seminifer|sperm|prostate|prostatic|gestation|pregnan|fetus|fetal|placent|menstrua|mullerian|wolffian|testosterone|dihydrotestosterone|gonad|fertility|fertilization|breast|mammary|estrogen|progesterone",
 "Respiratorio": r"pulmon|lung|alveol|bronch|pleur|pneumo|asthma|emphysema|surfactant|respiratory|airway|ventilation|perfusion mismatch|forced expiratory|vital capacity|oxygen diffu|carbon dioxide diffusion",
}
DISCIPLINE_RULES = {
 "Anatomía": r"anatom|which.{0,35}(?:nerve|artery|vein|ligament|structure)|innervat|anatomical|nerve injury|blood supply|lymphatic drainage|passes through|vessels.*order",
 "Bioquímica": r"enzyme|metaboli|glycol|gluconeogen|glycogen|fatty acid|amino acid|nucleotide|oxidative phosphory|electron transport|citric acid|urea cycle|vitamin|cofactor|beta.oxidation|purine|pyrimidine|protein synthesis",
 "Bioestadística": r"randomized|confidence interval|odds ratio|relative risk|sensitivity|specificity|predictive value|standard deviation|standard error|null hypothesis|cohort|case.control|statistical|p.value|prevalence|incidence|number needed|clinical trial|bias|correlation coefficient|body mass index.*study",
 "Ciencias del comportamiento": r"schizophren|depressi|bipolar|mania|anxiety|psychosis|psychiatr|obsessive|attention.deficit|developmental milestone|conditioning|defense mechanism|cognitive therapy|personality disorder|bereavement|sleep disorder|substance use disorder",
 "Embriología": r"embryo|neural crest|neural tube|pharyngeal|branchial|mullerian|wolffian|fetal development|mesoderm|endoderm|ectoderm|organogenesis|teratogen|embryologic",
 "Farmacología": r"drug|pharmaco|medication|agonist|antagonist|inhibitor|antibiotic|mechanism of action|adverse effect|therapeutic|receptor block|chemotherap|toxic effect|half.life|clearance.*dose",
 "Fisiología": r"physiol|action potential|resting potential|membrane potential|cardiac output|autoregulat|preload|afterload|osmolar|osmolal|acid.base|blood flow|ventilation|oxygen consumption|feedback|homeostas|muscle contraction|sarcomere|electrophysio|glomerular filtration|transport protein|transport mechanism|hormone secretion",
 "Genética": r"mutation|\bgenes?\b|\bgenetic|chromosom|inherit|hereditary|allele|autosomal|x.linked|pedigree|penetrance|hardy.weinberg|recombination|transcription factor",
 "Histología": r"histolog|microscop|photomicrograph|stained section|cell junction|epithelial cell|electron micrograph|ultrastruct|tissue section",
 "Inmunología": r"immun|antibod|antigen|complement|hypersensitivity|t.cell|b.cell|cd4|cd8|cytokine|interleukin|interferon|mhc|hla|autoimmune|lymphocyte|vaccin",
 "Microbiología": r"bacteri|virus|viral|fung|parasite|microorganism|organism|gram.positive|gram.negative|culture|staphyloc|streptoc|clostrid|mycobacter|escherichia|salmonella|shigella|neisseria|pseudomonas|candida|aspergill|plasmod|protozo|helminth|hiv|infectious agent",
 "Patología": r"pathogen|pathophysiol|diagnos|disease|necrosis|inflamm|fibrosis|neoplasm|tumor|carcinoma|malignan|metastas|lesion|syndrome|deficiency|histopath",
 "Ética médica": r"informed consent|confidential|patient autonomy|withhold|disclos|ethic|physician.{0,35}(?:respond|response|statement|say)|most appropriate response|decision.making capacity|surrogate|advance directive|patient.*request|cultural|interpreter",
}


def normalized(value):
 return " ".join(unicodedata.normalize("NFKC", str(value or "")).split())


def fingerprint(value):
 return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def write_json(path, value):
 path.parent.mkdir(parents=True, exist_ok=True)
 path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def read_workbook(path):
 """Read literal Banco cells; never execute formulas or trust cached summaries."""
 with zipfile.ZipFile(path) as z:
  shared=[]
  if "xl/sharedStrings.xml" in z.namelist():
   tree=ET.fromstring(z.read("xl/sharedStrings.xml"))
   shared=["".join(e.itertext()) for e in tree.findall("m:si",NS)]
  book=ET.fromstring(z.read("xl/workbook.xml"))
  rels=ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
  targets={r.attrib["Id"]:r.attrib["Target"] for r in rels}
  sheet=next(s for s in book.findall("m:sheets/m:sheet",NS) if s.attrib["name"]=="Banco")
  rel=sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
  target=targets[rel]; target=target.lstrip("/") if target.startswith("/") else "xl/"+target
  root=ET.fromstring(z.read(target)); rows=[]
  for row in root.findall("m:sheetData/m:row",NS):
   cells={}
   for c in row.findall("m:c",NS):
    col=re.sub(r"\d", "",c.attrib["r"]); kind=c.attrib.get("t"); v=c.find("m:v",NS)
    if c.find("m:f",NS) is not None: raise ValueError("Banco contains formulas; explicit review required")
    if kind=="inlineStr": value="".join(c.find("m:is",NS).itertext())
    elif v is None: value=None
    elif kind=="s": value=shared[int(v.text)]
    elif kind=="b": value=v.text=="1"
    else:
     value=v.text
     if value and re.fullmatch(r"-?\d+",value): value=int(value)
    cells[col]=value
   rows.append(cells)
  headers=rows[0]
  return [{headers[col]:row.get(col) for col in headers} for row in rows[1:] if row.get("A")]


def infer_taxonomy(stem, answer_text, objective):
 sections=[(normalized(stem),1),(normalized(answer_text),4),(normalized(objective),3)]
 def score(rules):
  result=[]
  for label,pattern in rules.items():
   matches=sum(min(4,len(re.findall(pattern,txt,re.I)))*weight for txt,weight in sections)
   if matches: result.append((matches,label))
  return sorted(result,key=lambda v:(-v[0],v[1]))
 systems=score(SYSTEM_RULES); disciplines=score(DISCIPLINE_RULES)
 # Secondary tags require meaningful evidence, not one incidental word in a vignette.
 s=[label for val,label in systems if val>=max(3,systems[0][0]*.55)][:2] if systems else []
 d=([disciplines[0][1]]+[label for val,label in disciplines[1:] if val>=max(3,disciplines[0][0]*.5)][:2]) if disciplines else []
 if not s: s=["Multisistémico"]
 confidence=.75 if systems and systems[0][0]>=10 else .45 if systems else .2
 if not d: confidence=min(confidence,.2)
 return s,d,{"method":"keyword_inference","confidence":confidence,"review":"suggested"}


def clean_stem(text):
 """Strip only identifiable examination UI prefix; preserve all medical wording."""
 value=str(text or "").strip(); notes=[]
 # OCR source screenshots can contain a header before the clinical text. The
 # removal requires a recognizable UI marker AND a recognizable narrative start.
 if re.search(r"Exam Section|https|\bM\s+L\s+E\b|Self.Assessment",value[:300],re.I):
  start=re.search(r"\b(?:A\s?\d+[ -]?(?:year|month|week|day)|An?\s+(?:otherwise healthy|previously healthy|healthy|investigator|researcher|study|randomized|randomly|physician|scientist)|During (?:a|an) (?:study|experiment))",value)
  if start and 0<start.start()<450:
   notes.append("Se retiró un prefijo identificable de interfaz de examen; el texto original se conserva en el registro de procedencia.")
   value=value[start.start():]
 return value,notes


def structural_reasons(stem, options, answer, explanation, figure_required):
 reasons=[]
 if figure_required: reasons.append("figure_not_ready")
 if len(normalized(stem))<40: reasons.append("missing_stem")
 if len(options)<3: reasons.append("missing_options")
 ids=[o["id"] for o in options]
 if ids!=list(string.ascii_uppercase[:len(ids)]): reasons.append("nonconsecutive_options")
 texts=[normalized(o["text"]) for o in options]
 if any(not t for t in texts): reasons.append("empty_option")
 if len({t.casefold() for t in texts})<len(texts): reasons.append("duplicate_options")
 if not answer: reasons.append("missing_answer")
 elif answer not in ids: reasons.append("answer_not_in_options")
 if len(normalized(explanation))<40: reasons.append("missing_explanation")
 # These checks flag broken layout, not spelling or a medically unusual answer.
 broken_option=False
 for text in texts:
  if re.search(r"\ufffd|(?:Correct Answer|Incorrect Answers|Educational Objective)|(?:^|\s)[A-J]\s*\)",text,re.I): broken_option=True
  # Single Latin glyphs are unsafe OCR for Greek receptors/arrows; digits and
  # genuine equations/units remain allowed. Necessary labelled figures are gated.
  if re.fullmatch(r"[A-Za-z](?:\))?",text): broken_option=True
  tokens=re.findall(r"\S+",text)
  if len(tokens)>=2 and all(re.fullmatch(r"[tTiIlLJHAvV14+|\\-]+",t) for t in tokens): broken_option=True
  if re.search(r"[\\|<>_]{3,}",text): broken_option=True
 if broken_option: reasons.append("option_ocr_artifacts")
 if sum(bool(re.search(r"\S {5,}\S",o["text"])) for o in options)>=2:
  reasons.append("option_layout_requires_review")
 critical_patterns=[r"\b\d\s*[GQOIl]\s*-\s*(?:year|month|week|day)",r"\b[GQO]\s?\d?\s*-\s*year",r"\b\d[\d\s.,:;]{0,6}[GQO][\dGQO\s.,:;]{0,8}\s*(?:/\s*mm|mg\s*/|mm\s*Hg)",r"\bf3[ -]?(?:r?adrenergic|receptor)"]
 if any(re.search(pattern,stem) for pattern in critical_patterns): reasons.append("critical_value_ocr")
 tokens=re.findall(r"\b\w+\b",stem)
 short=sum(len(t)==1 for t in tokens)
 if "\ufffd" in stem or (len(tokens)>25 and short/len(tokens)>.28) or re.search(r"[\\|<>_]{3,}",stem):
  reasons.append("stem_ocr_artifacts")
 return list(dict.fromkeys(reasons))


def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument("--json",type=Path,required=True)
 parser.add_argument("--xlsx",type=Path,required=True)
 parser.add_argument("--zip",type=Path,required=True)
 parser.add_argument("--output",type=Path,required=True)
 parser.add_argument("--overrides",type=Path)
 args=parser.parse_args()
 original=json.loads(args.json.read_text()); workbook=read_workbook(args.xlsx)
 workbook_by_source={(str(r["forma"]),int(r["pagina"])):r for r in workbook}
 if len(workbook_by_source)!=len(workbook): raise ValueError("Workbook source locators are not unique")
 with zipfile.ZipFile(args.zip) as outer:
  source27=json.loads(outer.read("NBME27_dataset.json"))
  newest=source27["data"]
  figure_zip=outer.read("figuras_NBME27.zip")
 newest_by_page={int(r["pagina"]):r for r in newest}
 if len(newest_by_page)!=len(newest): raise ValueError("New export page locators are not unique")
 overrides=json.loads(args.overrides.read_text()) if args.overrides else {}
 sources={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [args.json,args.xlsx,args.zip]}
 questions=[]; audit=[]; assets=[]; identities=set(); revisions=[]
 for original_row,old in enumerate(original,start=1):
  form=str(old["forma"]); page=int(old["pagina"]); key=(form,page)
  if key in identities: raise ValueError("Original source locators are not unique")
  identities.add(key)
  sheet=workbook_by_source.get(key)
  if sheet is None: raise ValueError(f"Missing workbook record {key}")
  fresh=newest_by_page.get(page) if form=="27" else None
  question_id=f"NBME{form}-P{page:04d}"
  canonical_id=sheet["id"]
  changes=[]; notes=["Contenido procedente de los archivos aportados. Control estructural automático; no equivale a validación médica independiente.","La clasificación y la confianza originales no se utilizan como progreso personal."]
  if old["id"]!=canonical_id:
   changes.append({"field":"sourceRecordId","from":old["id"],"to":canonical_id,"source":args.xlsx.name})
  field_sources={k:args.json.name for k in ["stem","options","answer","explanation","objective"]}
  fields={"stem":old.get("stem") or "","options":dict(old.get("opciones") or {}),"answer":old.get("correcta"),"explanation":old.get("explicacion") or "","objective":old.get("educational_objective") or ""}
  if fresh:
   remap={"stem":"stem","options":"opciones","answer":"correcta","explanation":"explicacion","objective":"objetivo"}
   for target,source in remap.items():
    candidate=fresh.get(source)
    # An empty later field must not erase data available in the combined export.
    if candidate not in (None,"",{}):
     if fields[target]!=candidate:
      changes.append({"field":target,"fromHash":fingerprint(fields[target]),"toHash":fingerprint(candidate),"source":args.zip.name+"/NBME27_dataset.json"})
     fields[target]=candidate
     field_sources[target]=args.zip.name+"/NBME27_dataset.json"
   if fresh.get("id")!=canonical_id:
    raise ValueError(f"Latest source ID disagrees with workbook for {question_id}")
   notes.append("NBME 27 incorpora la exportación posterior por página. Sus etiquetas de verificación se conservan como afirmaciones de la fuente.")
  # The workbook contains only A–F: use it for corrected identifiers, never to
  # truncate or overwrite the complete option collection from a JSON source.
  stem,cleanup=clean_stem(fields["stem"]); notes.extend(cleanup)
  options=[{"id":k,"text":str(v)} for k,v in sorted(fields["options"].items())]
  answer=fields["answer"] or None
  explanation=fields["explanation"] or None
  if explanation and re.search(r"\bIncorrect Answers?\s*:",explanation,re.I):
   explanation=re.split(r"\bIncorrect Answers?\s*:",explanation,maxsplit=1,flags=re.I)[0].strip()
   notes.append("La explicación principal se separó únicamente por el delimitador explícito 'Incorrect Answers:'; el texto completo sigue en procedencia.")
  objective=fields["objective"] or None
  if objective:
   objective=re.split(r"\n(?:Scone|Score) Report\b",objective,maxsplit=1,flags=re.I)[0].strip()
  figure_required=bool(old.get("figura") or (fresh and fresh.get("figura_pista")))
  if re.search(r"(?:photograph|photomicrograph|micrograph|graph|diagram|image|scan|figure|pedigree|table).{0,50}(?:shown|illustrated|below)|(?:shown|illustrated).{0,40}(?:photograph|photomicrograph|micrograph|graph|diagram|image|scan|figure|pedigree|table)",stem,re.I):
   figure_required=True
  if re.search(r"\blesions?\s+(?:are\s+|is\s+|as\s+)?shown\b",stem,re.I):
   figure_required=True
  reasons=structural_reasons(stem,options,answer,explanation,figure_required)
  actual_letters={o["id"] for o in options}
  if fresh:
   incorrect_header=re.search(r"Incorrect Answers?:\s*([^\n]+)",fresh.get("explicacion") or "",re.I)
   if incorrect_header:
    explicit_letters=set(re.findall(r"\b([A-J])\b",incorrect_header.group(1)))
    if explicit_letters-actual_letters:
     reasons.append("incomplete_option_set")
  elif actual_letters==set("ABCD") and (set(old.get("incorrectas") or [])|{answer})==set("ABCDE"):
   reasons.append("incomplete_option_set")
  systems,disciplines,taxonomy=infer_taxonomy(stem,fields["options"].get(answer,"") if answer else "",objective or "")
  topic=" · ".join(systems)
  links=[]
  custom=overrides.get(question_id,{})
  if custom:
   allowed={"systems","disciplines","topic","conceptLinks","additionalReasons","notes"}
   if set(custom)-allowed: raise ValueError(f"Unsupported override fields for {question_id}")
   systems=custom.get("systems",systems); disciplines=custom.get("disciplines",disciplines); topic=custom.get("topic",topic)
   links=custom.get("conceptLinks",[])
   for link in links:
    if link.get("review") not in ("suggested","reviewed") or not 0<=link.get("confidence",-1)<=1: raise ValueError("Invalid concept link override")
   reasons.extend(custom.get("additionalReasons",[])); notes.extend(custom.get("notes",[]))
  if fresh and fresh.get("figura_archivo"):
   assets.append({"questionId":question_id,"assetId":f"nbme27-page-{page:04d}-source","sourcePath":fresh["figura_archivo"],"role":"source_reference_only","displayBeforeAnswer":False,"review":"not_approved_for_question"})
   notes.append("Existe un recorte privado de referencia que puede contener respuestas resaltadas o una figura parcial; no se presenta para responder.")
  if old.get("id_conflicto"): notes.append("La extracción original señaló conflicto de identificación; se conserva la localización por forma y página.")
  if old.get("sospecha_step2"): notes.append("La etiqueta automática de posible Step 2 no implica exclusión: requiere valoración por contenido, no por una frase del enunciado.")
  notes.append("Las explicaciones de distractores segmentadas automáticamente no se consideran correspondencias verificadas.")
  q={"id":question_id,"revision":"","form":form,"section":int(sheet["seccion"]),"item":int(sheet["item"]),"page":page,"systems":systems,"disciplines":disciplines,"topic":topic,"objective":objective,"status":"blocked" if reasons else "ready","reasons":sorted(set(reasons)),"figureRequired":figure_required,"conceptLinks":links,"taxonomy":taxonomy,"stem":stem,"options":options,"answer":answer,"explanation":explanation,"figures":[],"provenance":{"sourceFile":field_sources["stem"],"sourceRecordId":canonical_id,"notes":notes,"fieldSources":field_sources,"originalRecordId":old["id"]}}
  q["revision"]=fingerprint({k:v for k,v in q.items() if k!="revision"})[:16]
  questions.append(q)
  audit.append({"questionId":question_id,"sourceLocator":{"form":form,"page":page,"originalJsonRow":original_row,"workbookId":canonical_id},"changes":changes,"original":old,"workbook":sheet,"latestSource":fresh,"sourceFieldHashes":{k:fingerprint(v) for k,v in fields.items()}})
  revisions.extend({"questionId":question_id,**change} for change in changes)
 if len(questions)!=596: raise ValueError(f"Expected all 596 supplied records, found {len(questions)}")
 questions.sort(key=lambda q:(q["form"],q["page"]))
 identity_fingerprint=fingerprint(sources)
 version="1.0.0-"+fingerprint({"importer":IMPORTER_VERSION,"sources":sources,"revisions":[q["revision"] for q in questions]})[:12]
 meta_keys=["id","revision","form","section","item","page","systems","disciplines","topic","objective","status","reasons","figureRequired","conceptLinks","taxonomy"]
 catalog={"schemaVersion":1,"bankVersion":version,"total":len(questions),"questions":[{k:q[k] for k in meta_keys} for q in questions]}
 args.output.mkdir(parents=True,exist_ok=True)
 write_json(args.output/"catalog.json",catalog)
 for form in ("27","28","29"):
  write_json(args.output/f"form-{form}.json",[q for q in questions if q["form"]==form])
 write_json(args.output/"questions.json",questions)
 for question in questions:
  write_json(args.output/"questions"/question["id"]/(question["revision"]+".json"),question)
 write_json(args.output/"provenance-records.json",audit)
 write_json(args.output/"source-revisions.json",revisions)
 write_json(args.output/"source-assets.json",assets)
 with zipfile.ZipFile(io.BytesIO(figure_zip)) as z:
  for asset in assets:
   name=asset["sourcePath"]
   candidates=[n for n in z.namelist() if n==name or n.endswith("/"+Path(name).name) or n==Path(name).name]
   if len(candidates)!=1: raise ValueError(f"Image source missing or ambiguous: {name}")
   raw=z.read(candidates[0]); dest=args.output/"source-figures"/(asset["assetId"]+".png")
   dest.parent.mkdir(parents=True,exist_ok=True); dest.write_bytes(raw)
   asset["sha256"]=hashlib.sha256(raw).hexdigest()
 write_json(args.output/"source-assets.json",assets)
 report={"schemaVersion":1,"importerVersion":IMPORTER_VERSION,"bankVersion":version,"sourceHashes":sources,"sourceFingerprint":identity_fingerprint,"total":len(questions),"byForm":{form:dict(collections.Counter(q["status"] for q in questions if q["form"]==form)) for form in ("27","28","29")},"statusCounts":dict(collections.Counter(q["status"] for q in questions)),"reasonCounts":dict(collections.Counter(r for q in questions for r in q["reasons"])),"reasonLabels":REASONS,"idCorrections":sum(c["field"]=="sourceRecordId" for c in revisions),"recordsFromNewExport":len(newest),"privateReferenceImages":len(assets),"sourceLimitations":["Ready means structurally usable; this importer does not independently verify medical keys or complete OCR fidelity.","All original records and option letters are retained. Later NBME 27 fields replace older fields only when nonempty; old values remain in provenance.","All supplied image crops are reference-only, never pre-answer assets.","Keyword taxonomy is inferred and not a learner progress signal.","Raw explanations are source explanations, and segmented distractor mappings are not served as verified."]}
 write_json(args.output/"import-report.json",report)
 write_json(args.output/"publish-manifest.json",{"schemaVersion":1,"bankVersion":version,"assets":[{"path":"catalog.json","file":"catalog.json","kind":"catalog"}]+[{"path":f"questions/{q['id']}/{q['revision']}.json","file":f"questions/{q['id']}/{q['revision']}.json","kind":"question","questionId":q["id"],"revision":q["revision"]} for q in questions]})
 print(json.dumps({k:report[k] for k in ["bankVersion","total","statusCounts","byForm","reasonCounts","idCorrections","privateReferenceImages"]},ensure_ascii=False,indent=2))

if __name__=="__main__": main()
