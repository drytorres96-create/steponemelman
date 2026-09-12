# Private NBME bank importer

This importer processes all 596 supplied records and does not invent questions, answer options, answer keys, images, or medical approvals. `ready` only means the conservative structural gates passed. Some medical/OCR defects may still require source review.

## Reproduce

```bash
python3 import_nbme.py --json /private/NBME_banco_27_28_29.json --xlsx /private/NBME_banco_27_28_29.xlsx --zip /private/files.zip --overrides /private/overrides.json --output /private/nbme-bank
python3 verify_nbme_import.py /private/nbme-bank
```

Omit `--overrides` if no reviewed classification or link suggestions exist. Inputs and outputs containing bank content must stay outside the public repository and public static assets. Both Python scripts contain no embedded exam content and need only the standard library.

## Reconciliation

- Stable identity is the supplied form and source page, e.g. `NBME27-P0001`. It is a source locator, not a verified official item number.
- The workbook's seven corrected identifiers are retained as `provenance.sourceRecordId`; original identifiers remain in the private audit.
- The newer NBME 27 export replaces nonempty fields by page. Empty new fields do not erase old fields. JSON options remain complete: the workbook's A–F columns are never used to truncate them.
- All 596 records remain in the catalog, including records blocked from answering. Nothing is silently deduplicated by the original nonunique item identifier.
- Original records, workbook cells, later records, selected-field hashes, and revisions are kept in private audit files.
- Figure crops are copied byte-for-byte only into `source-figures`. Their reference manifest explicitly prohibits pre-answer display. They are not published to the question API.
- The main NBME 27 explanation is split only at the literal `Incorrect Answers:` delimiter. Unverified segmented distractor explanations are not served. Source material remains in audit.
- Taxonomy uses bounded keyword inference and is labelled `suggested`. It never converts source `VISTO` or source classification confidence into study progress.
- Concept links are empty unless supplied through the override file; at most one tested concept and two foundations are supported.

## Private publishing

Publish exactly the 597 assets enumerated in `publish-manifest.json`: catalog plus 596 versioned question objects. Each question path is `questions/{id}/{revision}.json`; the revision is a deterministic SHA-256 prefix of the complete question payload other than its revision field. Updating readiness, content, taxonomy or links creates a new revision.

Do not glob every file in the output directory into the database. Audit files, full original exports, source images, manifests and intermediate question revisions are not API assets. Store previous **published** revisions separately so a saved session can reference the version it started with.

The authenticated server must only load requested IDs and exact revisions, and the session builder must select `status=ready`. Records blocked for missing images or incomplete options stay visible only as inventory counts/reasons until corrected from source.

### Runtime availability and compact index (1.6.2)

The current catalog may withdraw an already published question while retaining its immutable revision. In this case the catalog's `blocked` status takes precedence over a historical payload's `ready` status. Do not rewrite that payload or its revision hash. Import verification still requires parity for newly imported banks; a subsequent availability withdrawal is recorded separately with its previous catalog backup.

`catalog-index.json` is an optional compact projection with the same schema version, bank version, question order, identities, revisions, classifications and availability as `catalog.json`. Only `topic`, `objective`, `conceptLinks` and `taxonomy` are omitted or replaced with empty schema-compatible values. Complete content remains in the private question objects. Publish both catalogs atomically, after validating all referenced assets and backing up the prior catalog. Never promote an incomplete staged bank by filling missing reviewed revisions from an unreviewed source.

## Structural gates

Blocked conditions include missing/insufficient stem, missing/nonconsecutive options, repeated options, key absent or not selectable, missing explanation, unreadable option glyphs or columns, strong OCR noise, explicit source evidence of an omitted option, or any required figure not yet approved for responding. These gates are conservative and overlap; do not sum reason counts as record counts.

A successful integrity check verifies all 596 unique source identities, seven identifier corrections, complete source option preservation, selectable answers for structurally ready records, exact catalog/payload parity, revision hashes, bounded concept links and byte-identical source image copies. It does not certify clinical accuracy.
