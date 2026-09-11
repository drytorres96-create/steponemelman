#!/usr/bin/env python3
"""Deterministic lexical suggestions, NOT medical or editorial approval.

Works offline, never changes the bank/corpus, never awards concept mastery.
Only high-support suggestions are emitted as conceptLinks. All lower-ranked
candidates remain in a private diagnostic report and must not be published as
approved links. Standard library only.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata

VERSION = "nbme-corpus-lexical-1"

# Orthographic/bilingual lexical equivalences, not claims about mechanisms.
ALIASES = {
    "sindrome": "syndrome", "enfermedad": "disease", "deficiencia": "deficiency",
    "deficit": "deficiency", "insuficiencia": "failure", "sintesis": "synthesis",
    "enzima": "enzyme", "proteina": "protein", "celula": "cell", "tejido": "tissue",
    "musculo": "muscle", "muscular": "muscle", "hueso": "bone", "oseo": "bone",
    "sangre": "blood", "sanguineo": "blood", "orina": "urine", "urinario": "urinary",
    "rinon": "kidney", "renal": "kidney", "higado": "liver", "hepatico": "liver",
    "cerebro": "brain", "cerebral": "brain", "corazon": "heart", "cardiaco": "heart",
    "pulmon": "lung", "pulmonar": "lung", "tiroides": "thyroid", "tiroideo": "thyroid",
    "suprarrenal": "adrenal", "hipofisis": "pituitary", "hipofisario": "pituitary",
    "gonada": "gonad", "hormona": "hormone", "anticuerpo": "antibody",
    "antigeno": "antigen", "linfocito": "lymphocyte", "neutrofilo": "neutrophil",
    "eosinofilo": "eosinophil", "basofilo": "basophil", "eritrocito": "erythrocyte",
    "plaqueta": "platelet", "macrofago": "macrophage", "interleucina": "interleukin",
    "complemento": "complement", "fibrinogeno": "fibrinogen", "trombina": "thrombin",
    "colageno": "collagen", "elastina": "elastin", "queratina": "keratin",
    "hemoglobina": "hemoglobin", "bilirrubina": "bilirubin", "creatinina": "creatinine",
    "glucosa": "glucose", "fructosa": "fructose", "galactosa": "galactose",
    "lactosa": "lactose", "sacarosa": "sucrose", "glucogeno": "glycogen",
    "colesterol": "cholesterol", "triglicerido": "triglyceride", "aminoacido": "aminoacid",
    "acido": "acid", "graso": "fatty", "cadena": "chain",
    "renina": "renin", "aldosterona": "aldosterone", "angiotensina": "angiotensin",
    "insulina": "insulin", "glucagon": "glucagon", "tiroxina": "thyroxine",
    "cortisona": "cortisone", "testosterona": "testosterone", "estrogeno": "estrogen",
    "progesterona": "progesterone", "prolactina": "prolactin", "oxitocina": "oxytocin",
    "dopamina": "dopamine", "serotonina": "serotonin", "histamina": "histamine",
    "acetilcolina": "acetylcholine", "adrenalina": "epinephrine", "adrenaline": "epinephrine",
    "noradrenalina": "norepinephrine", "noradrenaline": "norepinephrine",
    "sodio": "sodium", "potasio": "potassium", "calcio": "calcium", "magnesio": "magnesium",
    "hierro": "iron", "cobre": "copper", "fosfato": "phosphate", "fosforo": "phosphorus",
    "agua": "water", "oxigeno": "oxygen", "bicarbonato": "bicarbonate",
    "diuretico": "diuretic", "receptor": "receptor", "bloqueador": "blocker",
    "inhibidor": "inhibitor", "antagonista": "antagonist", "agonista": "agonist",
    "propranolol": "propranolol", "metimazol": "methimazole", "propiltiouracilo": "propylthiouracil",
    "warfarina": "warfarin", "heparina": "heparin", "aspirina": "aspirin",
    "clopidogrel": "clopidogrel", "digoxina": "digoxin", "furosemida": "furosemide",
    "espironolactona": "spironolactone", "amilorida": "amiloride",
    "captopril": "captopril", "enalapril": "enalapril", "losartan": "losartan",
    "insulinoma": "insulinoma", "feocromocitoma": "pheochromocytoma",
    "fibrosis": "fibrosis", "quistica": "cystic", "quiste": "cyst", "cistico": "cystic",
    "congenito": "congenital", "hereditario": "hereditary", "autosomico": "autosomal",
    "dominante": "dominant", "recesivo": "recessive", "ligado": "linked",
    "mutacion": "mutation", "delecion": "deletion", "duplicacion": "duplication",
    "translocacion": "translocation", "cromosoma": "chromosome", "cromosomico": "chromosomal",
    "nervio": "nerve", "neurona": "neuron", "corteza": "cortex", "medula": "medulla",
    "lateral": "lateral", "posterior": "posterior", "anterior": "anterior",
    "derecho": "right", "izquierdo": "left", "derecha": "right", "izquierda": "left",
    "ventriculo": "ventricle", "ventricular": "ventricular", "auricula": "atrium",
    "auricular": "atrial", "valvula": "valve", "estenosis": "stenosis",
    "regurgitacion": "regurgitation", "soplo": "murmur", "presion": "pressure",
    "precarga": "preload", "poscarga": "afterload", "contractilidad": "contractility",
    "volumen": "volume", "resistencia": "resistance", "gasto": "output",
    "embarazo": "pregnancy", "embarazada": "pregnant", "feto": "fetus", "fetal": "fetal",
    "utero": "uterus", "ovario": "ovary", "testiculo": "testis", "testicular": "testicular",
    "infertilidad": "infertility", "hemorragia": "hemorrhage", "trombosis": "thrombosis",
    "embolia": "embolism", "embolismo": "embolism", "infarto": "infarction",
    "anemia": "anemia", "leucemia": "leukemia", "linfoma": "lymphoma",
    "maligno": "malignant", "benigno": "benign", "neoplasia": "neoplasm",
    "sensibilidad": "sensitivity", "especificidad": "specificity", "prevalencia": "prevalence",
    "incidencia": "incidence", "riesgo": "risk", "relativo": "relative", "absoluto": "absolute",
    "sesgo": "bias", "cohorte": "cohort", "probabilidad": "probability", "predictivo": "predictive",
    "hipotesis": "hypothesis", "nula": "null", "ensayo": "trial",
    "tamano": "size", "muestra": "sample", "desviacion": "deviation", "estandar": "standard",
    "mediana": "median", "varianza": "variance", "correlacion": "correlation",
    "reduccion": "reduction", "diferencia": "difference", "proporcion": "proportion",
}
STOP = set("""the and for that this with from which what when where why how who whom whose
is are was were been being have has had does did can could would should will may might must
into onto over under about after before between during than then more most less least very
also such some any all each both other these those their there them they his her him its
a an of to in on at by as it or not no yes be do if so he she we us you our your per via
de del la el los las un una unos unas que cual cuales como por para con sin es son en al
se su sus lo le les entre esta este estos estas mas menos sobre tras antes despues tambien
paciente patient patients year years old man woman male female boy girl child children
likely following cause causes caused causing associated association due leads lead results
result resultante produce produces producing finding findings presents presented presentation
history examination physical normal increased increase increases decreased decrease decreases
high low higher lower elevated reduced level levels concentration concentrations test tests
answer correct incorrect question clinical diagnosis diagnostic condition disease disorder
identify identifying explain explanation recognize compare differentiate relacionar reconocer
identificar explicar describir comparar diferenciar elegir recordar calcular interpretar
mechanism mecanismo funcion function characteristic caracteristica caracteristicas
characteristics occurs occur occurring typical common characterized demonstrate demonstrates
shown indicates indicate determine detected shows shows years months weeks days hours
cm mm kg mg dl ml mmhg laboratory serum treatment therapy treatments treatment management
medical most likely due level forma patient medicine medicina estudio estudios study studies
term termino concept concepto forma step usmle nbme following given except normal abnormal
primarily usually typically major primary secondary various important includes include
resulting expected particularly according symptoms sign signs include including example
associated such respectively another present subsequent initial final possible probably
because although therefore thus however within without also toward through both whether
that there here why very""".split())

def flatten(v):
    if isinstance(v, str): return v
    if isinstance(v, list): return " ".join(flatten(x) for x in v)
    if isinstance(v, dict): return " ".join(flatten(x) for x in v.values())
    return ""

def norm(s):
    s = unicodedata.normalize("NFKD", s.lower().replace("β", " beta ").replace("α", " alpha ").replace("γ", " gamma "))
    s = "".join(c for c in s if not unicodedata.combining(c))
    # These symbols lose medically decisive suffixes if tokenized as single
    # letters; apo-B and apo-E must never collapse into the common token "apo".
    s = re.sub(r"\bapo\s*[- ]\s*([a-e])\b",r"apo\1",s)
    s = re.sub(r"\b(cd|il|c|t|bcl)\s*[- ]\s*([0-9]{1,3})\b",r"\1\2",s)
    s = re.sub(r"\b5\s*-?\s*ht\s*[- ]?\s*([0-9])\b",r"5ht\1",s)
    return s

def token(t):
    if t in ALIASES: return ALIASES[t]
    if t.endswith("s") and t[:-1] in ALIASES: return ALIASES[t[:-1]]
    if t.endswith("es") and t[:-2] in ALIASES: return ALIASES[t[:-2]]
    if len(t) > 6 and t.startswith("hiper"): t = "hyper" + t[5:]
    if len(t) > 5 and t.startswith("hipo"): t = "hypo" + t[4:]
    if len(t) > 5 and t.startswith("linfo"): t = "lympho" + t[5:]
    for a,b in [("aciones","ation"),("acion","ation"),("ciones","tion"),("cion","tion"),
                ("asas","ase"),("asa","ase"),("omas","oma"),("inas","ine"),
                ("icos","ic"),("ico","ic"),("icas","ic"),("ica","ic")]:
        if len(t) > len(a) + 3 and t.endswith(a): return t[:-len(a)] + b
    if len(t) > 5 and t.endswith("ies"): return t[:-3] + "y"
    if len(t) > 5 and t.endswith("s") and not t.endswith(("sis","ous","ss","us")): return t[:-1]
    return t

def tokens(text):
    out = []
    for t in re.findall(r"[a-z][a-z0-9]*|[0-9]+[a-z][a-z0-9]*", norm(flatten(text))):
        if t in STOP: continue
        t = token(t)
        if (len(t) > 2 or (len(t)>=2 and any(x.isdigit() for x in t))) and t not in STOP: out.append(t)
    return out

def weighted(fields):
    out = Counter()
    for text,w in fields:
        # Repetition within a field should not overpower a specific short target.
        for t,n in Counter(tokens(text)).items(): out[t] += w * (1 + math.log(n))
    return out

def cosine(a,b):
    den = math.sqrt(sum(x*x for x in a.values())*sum(x*x for x in b.values()))
    return sum(x*b.get(k,0) for k,x in a.items()) / den if den else 0.0

def question_fields(q):
    opts=q.get("options",q.get("opciones",{}))
    key=q.get("answer",q.get("correcta"))
    if isinstance(opts,list): answer=next((o.get("text","") for o in opts if o.get("id")==key),"")
    else: answer=opts.get(key,"") if key else ""
    answer=answer or q.get("correcta_texto","") or ""
    objective=q.get("objective",q.get("educational_objective","")) or ""
    stem=q.get("stem","") or ""
    return answer,objective,stem

def load_questions(path):
    raw=json.loads(Path(path).read_text())
    if isinstance(raw,list): return raw
    for key in ["questions","preguntas","items","records"]:
        if isinstance(raw.get(key),list): return raw[key]
    raise ValueError("Expected a question list or object containing questions/items/records")

class Mapper:
    def __init__(self, corpus_dir):
        p=Path(corpus_dir)
        self.index=json.loads((p/"index.json").read_text())
        self.concepts=[c for m in self.index["modulos"] for c in json.loads((p/"modules"/(m["module_id"]+".json")).read_text())["conceptos"]]
        self.by_id={c["concept_id"]:c for c in self.concepts}
        if len(self.by_id)!=len(self.concepts): raise ValueError("Duplicate corpus concept IDs")
        self.features={}
        self.target={}
        self.canonical={}
        self.source={}
        df=Counter()
        for c in self.concepts:
            cid=c["concept_id"]
            cl=c.get("clasificacion",{})
            self.target[cid]=weighted([(c.get("respuesta_canonica",""),3),(c.get("sinonimos",[]),2),
                                       (c.get("objetivo",""),2),(c.get("afirmacion",""),1.5)])
            self.canonical[cid]=set(tokens(c.get("respuesta_canonica","")))
            self.source[cid]=Counter(tokens(c.get("source",{}).get("fragment","")))
            f=weighted([(c.get("respuesta_canonica",""),5),(c.get("sinonimos",[]),3),
                        (c.get("objetivo",""),3),(c.get("afirmacion",""),2),
                        (c.get("source",{}).get("fragment",""),0.7),
                        (cl.get("tema",""),1),(cl.get("subtema",""),1)])
            self.features[cid]=f
            df.update(f.keys())
        n=len(self.concepts)
        self.idf={t:math.log((n+1)/(cnt+1))+1 for t,cnt in df.items()}
        self.vectors={cid:{t:math.log1p(v)*self.idf[t] for t,v in f.items()} for cid,f in self.features.items()}
        self.inverted=defaultdict(set)
        for cid,f in self.features.items():
            for t in f:self.inverted[t].add(cid)

    def propose(self,q,overrides=None):
        qid=str(q["id"])
        answer,objective,stem=question_fields(q)
        out={"questionId":qid,"questionRevision":q.get("revision"),"conceptLinks":[],
             "status":"unmapped","method":VERSION,"review":"suggested","notes":[]}
        if q.get("status") and q["status"]!="ready":
            return {**out,"status":"not_ready","notes":["Input item is blocked; no learning links emitted."]}
        if not answer or not objective:
            return {**out,"notes":["A complete answer and educational objective are required for automatic suggestions."]}
        fields=weighted([(answer,5),(objective,3),(stem,0.7)])
        vec={t:math.log1p(v)*self.idf[t] for t,v in fields.items() if t in self.idf}
        a=set(tokens(answer)); obj=set(tokens(objective)); st=set(tokens(stem))
        targetq=weighted([(answer,4),(objective,2)])
        targetvec={t:math.log1p(v)*self.idf[t] for t,v in targetq.items() if t in self.idf}
        candidates=set().union(*(self.inverted[t] for t in targetq if self.idf.get(t,0)>=2.8)) if targetq else set()
        ranked=[]
        for cid in sorted(candidates):
            c=self.by_id[cid]; f=self.features[cid]; ct=self.target[cid]; cs=self.source[cid]
            ts=set(ct); answerhits=a & ts; objecthits=obj & ts
            sourceanswer=a & set(cs); objectivesource=obj & set(cs)
            rare={t for t in (a|obj)&ts if self.idf.get(t,0)>=4.0}
            score=cosine(vec,self.vectors[cid])
            targetcos=cosine(targetvec,{t:math.log1p(v)*self.idf[t] for t,v in ct.items()})
            core=cosine(targetvec,self.vectors[cid])
            # Unknown words remain in the denominator: an absent species,
            # receptor subtype or OCR fragment must not be silently discarded.
            known_answer={t for t in a if self.idf.get(t,8.0)>=3.0}
            canonicalhits=known_answer & self.canonical[cid]
            answercoverage=sum(self.idf[t] for t in canonicalhits)/sum(self.idf.get(t,8.0) for t in known_answer) if known_answer else 0
            combined=.28*score+.32*targetcos+.15*core+.25*answercoverage
            # A long source table shared by many concepts must not create a link
            # without separate support in the concept's own target/claim.
            # The keyed answer must overlap the concept's own canonical answer,
            # not merely a distractor or another topic mentioned in an objective.
            strong=(answercoverage>=.65 and canonicalhits and len(objecthits)>=1
                    and len(objectivesource)>=2 and (len(rare)>=2 or any(self.idf[t]>=5.5 for t in canonicalhits)))
            if strong and combined>=.34:
                why="canonical_answer_and_objective_overlap"
            else: why=None
            ranked.append({"conceptId":cid,"score":round(combined,5),"textScore":round(score,5),
                           "targetScore":round(targetcos,5),"supported":bool(why),
                           "reason":why,"targetTerms":sorted((a|obj)&ts),"rareTargetTerms":sorted(rare),
                           "canonicalAnswerTerms":sorted(canonicalhits),"answerCoverage":round(answercoverage,4),
                           "answerTerms":sorted(answerhits),"sourceAnswerTerms":sorted(sourceanswer),
                           "objectiveTerms":sorted(objecthits),"sourceObjectiveTerms":sorted(objectivesource)})
        ranked.sort(key=lambda r:(-r["score"],r["conceptId"]))
        out["topCandidates"]=ranked[:5]
        supported=[r for r in ranked if r["supported"]]
        if supported:
            top=supported[0]
            second=supported[1] if len(supported)>1 else None
            # Ties are often variants of an entire copied source table. Do not
            # pretend to have identified which particular objective is tested.
            margin=top["score"]-(second["score"] if second else 0)
            if top["score"]>=.38 and (margin>=.025 or top["score"]>=.66):
                c=self.by_id[top["conceptId"]]
                confidence=round(min(.9,.60+top["score"]*.35),3)
                out["conceptLinks"]=[{"conceptId":top["conceptId"],"relation":"tested",
                                      "confidence":confidence,"review":"suggested"}]
                out["status"]="suggested"
                out["evidence"]={**top,"scoreMargin":round(margin,5),"confidenceMeaning":"Heuristic lexical support; not a probability or medical approval."}
                cl=c["clasificacion"]
                out["taxonomySuggestion"]={"systems":[cl["sistema_primario"]],"disciplines":[cl["disciplina_primaria"]],
                                           "method":"inferred_from_suggested_concept","review":"suggested"}
                systems=q.get("systems",[]); disciplines=q.get("disciplines",[])
                allsystems={cl["sistema_primario"],*cl.get("sistemas_secundarios",[])}
                alldisc={cl["disciplina_primaria"],*cl.get("disciplinas_secundarias",[])}
                out["taxonomyConflict"]={"system":bool(systems and not set(systems)&allsystems),
                                         "discipline":bool(disciplines and not set(disciplines)&alldisc)}
            else:out["notes"].append("Top candidates are too close or below the conservative score threshold.")
        else:out["notes"].append("Insufficient joint support from the educational objective and keyed answer.")
        override=(overrides or {}).get(qid)
        if override:
            action=override.get("action")
            if action=="suppress":
                out["conceptLinks"]=[];out["status"]="unmapped"
                out["notes"].append("Explicit review override suppressed a lexical suggestion: "+override.get("reason",""))
            elif action=="replace":
                links=override.get("conceptLinks",[])
                if len(links)>3 or sum(x["relation"]=="tested" for x in links)>1 or sum(x["relation"]=="foundation" for x in links)>2:
                    raise ValueError("Override exceeds one primary and two foundation links: "+qid)
                if len({x["conceptId"] for x in links})!=len(links):raise ValueError("Duplicate override links: "+qid)
                for l in links:
                    if l["conceptId"] not in self.by_id:raise ValueError("Unknown concept in override: "+l["conceptId"])
                    if l["review"]!="suggested":raise ValueError("This AI-only tool cannot declare a link reviewed")
                out["conceptLinks"]=links;out["status"]="suggested" if links else "unmapped"
                out["notes"].append("Explicit AI sample-review override (still suggested): "+override.get("reason",""))
            else:raise ValueError("Unknown override action: "+str(action))
        return out

def build_mappings(questions,corpus_dir,overrides=None):
    """Importable entry point. Does not mutate questions or corpus."""
    ids=[str(q["id"]) for q in questions]
    if len(ids)!=len(set(ids)):raise ValueError("Input question IDs must be reconciled before mapping; duplicates would overwrite links.")
    mapper=Mapper(corpus_dir)
    results=[mapper.propose(q,overrides) for q in questions]
    summary={"items":len(results),"statusCounts":dict(Counter(r["status"] for r in results)),
             "conceptLinks":sum(len(r["conceptLinks"]) for r in results),
             "taxonomyConflicts":sum(any(r.get("taxonomyConflict",{}).values()) for r in results),
             "corpusVersion":mapper.index["corpus_version"],"corpusConcepts":len(mapper.concepts),
             "method":VERSION,"review":"AI suggestions only; no human or full medical review"}
    return {"schemaVersion":1,"summary":summary,"mappings":results}

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input",required=True);ap.add_argument("--corpus-dir",required=True)
    ap.add_argument("--output",required=True);ap.add_argument("--overrides")
    args=ap.parse_args()
    overrides=json.loads(Path(args.overrides).read_text()) if args.overrides else {}
    out=build_mappings(load_questions(args.input),args.corpus_dir,overrides)
    out["inputSha256"]=hashlib.sha256(Path(args.input).read_bytes()).hexdigest()
    target=Path(args.output);target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(out["summary"],ensure_ascii=False))

if __name__=="__main__":main()
