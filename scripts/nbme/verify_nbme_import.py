#!/usr/bin/env python3
"""Verify private bank integrity without printing any question or answer text."""
import argparse
import hashlib
import json
import re
import string
from collections import Counter
from pathlib import Path


def digest(value):
 return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()).hexdigest()


def main():
 p=argparse.ArgumentParser();p.add_argument("bank",type=Path);a=p.parse_args()
 questions=json.loads((a.bank/"questions.json").read_text()); catalog=json.loads((a.bank/"catalog.json").read_text())
 report=json.loads((a.bank/"import-report.json").read_text()); sources=json.loads((a.bank/"provenance-records.json").read_text())
 assert len(questions)==len(catalog["questions"])==len(sources)==catalog["total"]==596
 assert Counter(q["form"] for q in questions)=={"27":198,"28":200,"29":198}
 assert len({q["id"] for q in questions})==596
 assert len({(q["form"],q["page"]) for q in questions})==596
 assert len({q["provenance"]["sourceRecordId"] for q in questions})==596
 for q,meta,source in zip(questions,catalog["questions"],sources):
  assert q["id"]==f"NBME{q['form']}-P{q['page']:04d}"
  assert q["id"]==meta["id"]==source["questionId"]
  assert q["revision"]==digest({k:v for k,v in q.items() if k!="revision"})[:16]
  assert all(q[k]==v for k,v in meta.items())
  assert q==json.loads((a.bank/"questions"/q["id"]/(q["revision"]+".json")).read_text())
  assert not q["figures"], "Unreviewed source images must never be question assets"
  assert "distractorExplanations" not in q, "Unverified segmented rationales must not be served"
  if q["status"]=="ready":
   assert not q["reasons"] and not q["figureRequired"]
   assert 3<=len(q["options"])<=26
   assert [o["id"] for o in q["options"]]==list(string.ascii_uppercase[:len(q["options"])])
   assert q["answer"] in {o["id"] for o in q["options"]}
   assert len({" ".join(o["text"].casefold().split()) for o in q["options"]})==len(q["options"])
   assert q["explanation"] and len(q["explanation"].strip())>=40
  else:
   assert q["status"]=="blocked" and q["reasons"]
  assert len(q["conceptLinks"])<=3
  assert sum(link["relation"]=="tested" for link in q["conceptLinks"])<=1
  assert all(link["review"] in ("suggested","reviewed") for link in q["conceptLinks"])
  original=source["original"];latest=source["latestSource"]
  selected=(latest or {}).get("opciones") or original["opciones"]
  assert q["options"]==[{"id":k,"text":str(v)} for k,v in sorted(selected.items())], "Options may never be truncated or invented"
  assert q["answer"]==((latest or {}).get("correcta") or original["correcta"] or None)
 assert report["idCorrections"]==7
 assert report["statusCounts"]==dict(Counter(q["status"] for q in questions))
 assets=json.loads((a.bank/"source-assets.json").read_text())
 assert len(assets)==37
 for asset in assets:
  assert asset["displayBeforeAnswer"] is False and asset["role"]=="source_reference_only"
  raw=(a.bank/"source-figures"/(asset["assetId"]+".png")).read_bytes()
  assert hashlib.sha256(raw).hexdigest()==asset["sha256"]
 print(json.dumps({"result":"PASS","records":len(questions),"status":report["statusCounts"],"bankVersion":catalog["bankVersion"],"checks":["conservation","unique identities","source option preservation","revision hashes","catalog equality","private source-only images","no unverified distractor maps","readiness gates","seven source ID corrections","bounded concept links"]},ensure_ascii=False,indent=2))

if __name__=="__main__":main()
