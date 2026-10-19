# Robotics weekly report set

This folder contains three cumulative Markdown reports for Option 01, Automated Warehouse Package Sorting Robot:

- `Robotics_W1_Concept_Design_Review.md` — Version 1.0 concept design, package assumptions, operating sequence, architecture, preliminary robot choice and workspace.
- `Robotics_W2_Engineering_Design_Review.md` — Version 2.0, retaining Week 1 content and adding anatomy, kinematics, drive/gripper choices, force calculation, control flow, and failure handling.
- `Robotics_W3_Final_Design_Review.md` — Version 3.0, retaining earlier work and integrating waypoints, motion planning, cubic trajectory, simulation evidence, safety, demonstration, and conclusion.

## Export to PDF

Open a Markdown file in a Markdown editor with PDF export, or use Pandoc with a LaTeX installation:

```sh
pandoc Robotics_W1_Concept_Design_Review.md -o Robotics_W1_Concept_Design_Review.pdf
pandoc Robotics_W2_Engineering_Design_Review.md -o Robotics_W2_Engineering_Design_Review.pdf
pandoc Robotics_W3_Final_Design_Review.md -o Robotics_W3_Final_Design_Review.pdf
```

Run these commands from `mds-1-3` so relative diagram links resolve. If exporting through Pandoc, include the project root as a resource path if your exporter needs it, for example `--resource-path=.:..`. The exact PDF page count depends on renderer, fonts, and page layout; review the exported PDFs for readable figures and page breaks.

## Source and open inputs

The supplied course brief was located as a DOCX in Downloads; no PDF copy was present in the workspace. The milestone-specific SVG diagrams are present in `../images-02/V1_Concept`, `V2_Engineering`, and `V3_Final` and are reused by the reports. The Week 3 report also links to an existing browser smoke-test screenshot under `../deliverables-2/images/`; no physical model or robot photograph was found. Student name, roll number, and submission date remain placeholders. Package dimensions, masses, friction, cell coordinates, and cycle target are explicitly labeled assumptions. Confirm these inputs and the ambiguous V3 due-date wording with faculty before submission.
