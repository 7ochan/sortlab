# SortLab final report package

This folder contains the editable report, rendered PDF, editable SVG diagrams, PNG diagram previews, the real browser smoke capture, source validation records, and QA findings. It is isolated from the application's build and does not modify application files.

## Rebuild

Requirements: Python 3 with `python-docx`, LibreOffice (`soffice`) on `PATH` or at `/Users/lochan/.local/bin/soffice`, and the five JSON evidence inputs in `source-data/`.

From the repository root:

```sh
/usr/bin/python3 deliverables-2/build_report.py
soffice --headless -env:UserInstallation=file:///private/tmp/sortlab-report-profile --convert-to pdf --outdir deliverables-2 deliverables-2/SortLab-Final-Report.docx
```

`build_report.py` checks the raw campaign rows against the supplied summary, regenerates the SVG diagrams, rasterizes them for Word, and writes the DOCX. Then the LibreOffice command produces the PDF. The page references in the contents and figure/table lists are static for the current 12-page edition; update and visually recheck them after changing report content.

The five `source-data/*.json` files are exact copies from local commit `8368c84` (`validation/results/`) and are included to keep this report package reproducible even if a checkout omits the Phase 6 validation directory. The report remains grounded in repository source and those campaign records.

The student name and university registration/USN are placeholders. Replace them before submission. The brief's V3 due-date wording is ambiguous and should be confirmed with the course instructor. The course brief also asks the student to verify and acknowledge AI assistance.
