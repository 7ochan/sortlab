#!/usr/bin/env python3
"""Rebuild the SortLab V3 engineering report and its editable vector diagrams.

Run with /usr/bin/python3 from any working directory. Inputs are read-only and
resolved relative to this script; all generated files stay inside deliverables-2.
"""
from __future__ import annotations

import json
import math
import os
import shutil
import statistics
import subprocess
import tempfile
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION_START
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent
DIAGRAMS = OUT / "diagrams"
IMAGES = OUT / "images"
REPORT = OUT / "SortLab-Final-Report.docx"
DATA = OUT / "source-data"
RAW_PATH = DATA / "nominal-phase7-grip-fix.json"
SUMMARY_PATH = DATA / "nominal-phase7-grip-fix-summary.json"
FAULT_PATH = DATA / "faults-phase7-grip-fix-summary.json"
NUMERICS_PATH = DATA / "numerics.json"
PHYSICS_PATH = DATA / "physics.json"
SCREENSHOT = IMAGES / "browser-workcell-smoke.png"

NAVY = "17324D"
BLUE = "246A8A"
TEAL = "168C8C"
PALE = "EAF2F5"
LIGHT = "F4F7F8"
INK = "24313D"
MID = "5C6B78"
GRID = "C5D1D8"
WHITE = "FFFFFF"
FONT = "Aptos"

def load_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


raw = load_json(RAW_PATH)
summary = load_json(SUMMARY_PATH)
faults = load_json(FAULT_PATH)
numerics = load_json(NUMERICS_PATH)
physics = load_json(PHYSICS_PATH)
records = raw["records"]
durations = [float(r["controllerElapsedSeconds"]) for r in records]
package_counts = {k: sum(r["packageId"] == k for r in records) for k in "SML"}
successes = sum(
    r["terminalState"] == "completed"
    and r["placementResult"]["status"] == "accepted"
    and r["placementResult"]["binId"] == r["targetBin"]
    and r["finalPackageSnapshot"]["attached"] is False
    for r in records
)
assert len(records) == 100 and package_counts == {"S": 34, "M": 33, "L": 33}
assert successes == 100 and summary["successfulPlacements"] == 100
assert summary["terminalOutcomes"] == 100 and summary["targetMet"] is True
assert sum(v["trials"] for v in faults.values()) == 36
assert sum(v["matched"] for v in faults.values()) == 36
assert sum(v["falsePositivePlacements"] for v in faults.values()) == 0
assert numerics["fkIkRoundTrips"]["successful"] == 5000
assert physics["repeatedTraceEqual"] is True

per_category = {}
for category in "SML":
    rows = [r for r in records if r["packageId"] == category]
    values = [float(r["controllerElapsedSeconds"]) for r in rows]
    per_category[category] = {
        "n": len(rows),
        "mean": statistics.mean(values),
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
        "success": sum(
            r["terminalState"] == "completed" and r["placementResult"]["status"] == "accepted"
            for r in rows
        ),
    }
assert math.isclose(statistics.mean(durations), summary["cycleDurationSeconds"]["mean"], abs_tol=1e-9)
assert math.isclose(statistics.median(durations), summary["cycleDurationSeconds"]["median"], abs_tol=1e-9)

def esc(s: object) -> str:
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def svg_start(width: int, height: int, title: str) -> list[str]:
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0 0 L10 4 L0 8 Z" fill="#246A8A"/></marker><marker id="tealArrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0 0 L10 4 L0 8 Z" fill="#168C8C"/></marker></defs>',
        '<rect width="100%" height="100%" fill="#FFFFFF"/>',
        '<style>text{font-family:Arial,sans-serif;fill:#24313D}.title{font-size:28px;font-weight:700;fill:#17324D}.label{font-size:24px}.small{font-size:21px}.tiny{font-size:18px}.axis{stroke:#5C6B78;stroke-width:2}.arm{stroke:#246A8A;stroke-width:16;stroke-linecap:round}.joint{fill:#FFFFFF;stroke:#17324D;stroke-width:4}.path{fill:none;stroke:#168C8C;stroke-width:5;stroke-dasharray:12 8}.solid{fill:#EAF2F5;stroke:#246A8A;stroke-width:2}.concept{fill:#F8FAFB;stroke:#738594;stroke-width:2;stroke-dasharray:8 6}.bin{fill:#EAF2F5;stroke:#246A8A;stroke-width:3}.package{fill:#E5A842;stroke:#9A6722;stroke-width:2}.muted{fill:#5C6B78}.good{fill:#168C8C}.bad{fill:#B45A4A}</style>',
        f'<text x="38" y="42" class="title">{esc(title)}</text>',
    ]


def write_svg(name: str, parts: list[str]) -> None:
    DIAGRAMS.mkdir(parents=True, exist_ok=True)
    (DIAGRAMS / name).write_text("\n".join(parts + ["</svg>"]), encoding="utf-8")


def svg_workcell():
    s = svg_start(1280, 560, "SortLab workcell · configured geometry, world frame W")
    # top view
    ox, oy, scale = 420, 315, 425
    s += ['<text x="72" y="92" class="label">Plan view (X–Y), metres</text>','<text x="72" y="122" class="tiny">P = pick station · H = home TCP · B1–B3 = bins</text>']
    s += [f'<circle cx="{ox}" cy="{oy}" r="{.55*scale:.1f}" fill="#F8FAFB" stroke="#A9B9C4" stroke-width="2" stroke-dasharray="8 6"/>']
    s += [f'<circle cx="{ox}" cy="{oy}" r="{.10747*scale:.1f}" fill="none" stroke="#168C8C" stroke-width="2" stroke-dasharray="7 5"/>']
    # table/conveyor
    s += [f'<rect x="{ox+.115*scale:.1f}" y="{oy-.10*scale:.1f}" width="{.45*scale:.1f}" height="{.20*scale:.1f}" rx="8" fill="#EDF2F4" stroke="#8FA1AE" stroke-width="2"/>']
    s += [f'<text x="{ox+.19*scale:.1f}" y="{oy+7}" class="small">Infeed</text>']
    # base
    s += [f'<circle cx="{ox}" cy="{oy}" r="{.08*scale:.1f}" fill="#17324D"/><text x="{ox-75}" y="{oy+78}" class="small">Base O (0,0)</text>']
    bins = [("B1 / S", -.24, .25), ("B2 / M", -.24, 0), ("B3 / L", -.24, -.25)]
    for label, x, y in bins:
        px, py = ox+x*scale, oy-y*scale
        s += [f'<rect class="bin" x="{px-40:.1f}" y="{py-24:.1f}" width="80" height="48" rx="5"/><text x="{px-34:.1f}" y="{py+6:.1f}" class="small">{label}</text>']
        s += [f'<text x="{px-65:.1f}" y="{py+45:.1f}" class="tiny">({x:.2f}, {y:+.2f})</text>']
    # pickup, home and corridor
    px, py = ox+.30*scale, oy
    s += [f'<rect class="package" x="{px-19:.1f}" y="{py-16:.1f}" width="38" height="32" rx="4"/><text x="{px-9:.1f}" y="{py+6}" class="small">P</text>']
    hx, hy = ox+.55*scale, oy
    s += [f'<circle cx="{hx:.1f}" cy="{hy:.1f}" r="9" fill="#168C8C"/><text x="{hx-8:.1f}" y="{hy-18}" class="small">H</text>']
    # schematic path through high corridor, projections only
    p = f"{px:.1f},{py:.1f} {ox+.30*scale:.1f},{oy-0.40*scale:.1f} {ox+.12*scale:.1f},{oy-0.40*scale:.1f} {ox-.24*scale:.1f},{oy-.25*scale:.1f}"
    s += [f'<polyline points="{p}" class="path" marker-end="url(#tealArrow)"/>']
    # axes and radial labels
    s += [f'<line x1="{ox}" y1="{oy}" x2="{ox+95}" y2="{oy}" class="axis" marker-end="url(#arrow)"/><text x="{ox+100}" y="{oy+5}" class="small">+X</text>', f'<line x1="{ox}" y1="{oy}" x2="{ox}" y2="{oy-85}" class="axis" marker-end="url(#arrow)"/><text x="{ox-18}" y="{oy-94}" class="small">+Y</text>']
    # side view panel
    s += ['<rect x="855" y="83" width="370" height="420" rx="12" fill="#F8FAFB" stroke="#C5D1D8" stroke-width="2"/>','<text x="880" y="116" class="label">Side view · configured Z levels</text>']
    zbase, zscale = 430, 480
    def zy(z): return zbase-z*zscale
    s += [f'<line x1="900" y1="{zy(.25):.1f}" x2="900" y2="{zy(.56):.1f}" stroke="#8295A2" stroke-width="4"/>']
    levels=[(.56,165,".56 m  Clearance / home", "#17324D"),(.54,197,".54 m  Place TCP", "#168C8C"),(.46,229,".46 m  Bin lip", "#E5A842"),(.38,268,".37–.39 m  Package centres", "#E5A842"),(.30,309,".30 m  Bin floor", "#246A8A"),(.25,350,".25 m  Table", "#8295A2")]
    for z,row_y,label,color in levels:
        tick_y=zy(z)
        s += [f'<line x1="888" y1="{tick_y:.1f}" x2="918" y2="{tick_y:.1f}" stroke="{color}" stroke-width="5"/>',f'<path d="M 918 {tick_y:.1f} L 945 {row_y}" fill="none" stroke="{color}" stroke-width="2"/>',f'<circle cx="945" cy="{row_y}" r="4" fill="{color}"/>',f'<text x="960" y="{row_y+6}" class="tiny">{label}</text>']
    s += ['<text x="880" y="480" class="tiny muted">Z ticks schematic · no swept clearance</text>']
    return s


def svg_anatomy():
    s = svg_start(1200, 390, "Four-axis SCARA-style mechanism · R–R–P–R")
    b=(190,265); e=(470,170); w=(710,260); tcp=(820,260)
    s += ['<rect x="95" y="265" width="190" height="62" rx="8" fill="#17324D"/><text x="146" y="302" fill="#FFFFFF" style="fill:#FFFFFF;font-size:20px;font-weight:700">Base / J1</text>']
    s += [f'<line x1="{b[0]}" y1="{b[1]}" x2="{e[0]}" y2="{e[1]}" class="arm"/><line x1="{e[0]}" y1="{e[1]}" x2="{w[0]}" y2="{w[1]}" class="arm"/>']
    for x,y in [b,e,w]: s += [f'<circle cx="{x}" cy="{y}" r="18" class="joint"/>']
    s += [f'<line x1="{w[0]}" y1="{w[1]}" x2="{tcp[0]}" y2="{tcp[1]}" stroke="#168C8C" stroke-width="8"/><circle cx="{tcp[0]}" cy="{tcp[1]}" r="9" fill="#E5A842"/>']
    s += ['<text x="260" y="168" class="label">Link 1 · L₁=.30 m</text><text x="490" y="205" class="label">Link 2 · L₂=.25 m</text>', '<text x="120" y="224" class="small">J1: rotary about +Z</text><text x="390" y="118" class="small">J2: relative rotary about +Z</text>', '<text x="680" y="306" class="small">J3: TCP world-Z slide</text><text x="740" y="225" class="small">J4 yaw</text><text x="837" y="267" class="small">TCP</text>', '<line x1="680" y1="340" x2="680" y2="285" stroke="#168C8C" stroke-width="4" marker-end="url(#tealArrow)"/><text x="694" y="336" class="small">+Z / q₃</text>', '<path d="M250 262 A60 60 0 0 0 238 220" fill="none" stroke="#E5A842" stroke-width="4"/><text x="220" y="210" class="small">q₁</text>', '<path d="M510 190 A55 55 0 0 1 540 220" fill="none" stroke="#E5A842" stroke-width="4"/><text x="535" y="183" class="small">q₂</text>', '<rect x="930" y="92" width="220" height="225" rx="12" fill="#EAF2F5" stroke="#C5D1D8"/><text x="956" y="130" class="label">Independent axes</text><text x="956" y="172" class="small">J1 · shoulder R · ±150°</text><text x="956" y="208" class="small">J2 · elbow R · ±160°</text><text x="956" y="244" class="small">J3 · vertical P · .30–.58 m</text><text x="956" y="280" class="small">J4 · tool yaw R · ±180°</text><text x="956" y="305" class="tiny">4 axes; no 6D pose</text>']
    return s


def svg_workspace():
    s = svg_start(1200, 430, "XY reach guides and configured station targets")
    ox,oy,scale=330,220,230
    s += [f'<circle cx="{ox}" cy="{oy}" r="{.55*scale}" fill="#F8FAFB" stroke="#246A8A" stroke-width="3" stroke-dasharray="9 6"/>',f'<circle cx="{ox}" cy="{oy}" r="{.10747*scale}" fill="none" stroke="#168C8C" stroke-width="3" stroke-dasharray="7 5"/>']
    # shoulder range edge guides
    for angle in (-150,150):
        rad=math.radians(angle); x=ox+.55*scale*math.cos(rad); y=oy-.55*scale*math.sin(rad)
        s += [f'<line x1="{ox}" y1="{oy}" x2="{x:.1f}" y2="{y:.1f}" stroke="#B45A4A" stroke-width="2" stroke-dasharray="6 6"/>']
    points=[("Pick",.30,0), ("B1",-.24,.25), ("B2",-.24,0), ("B3",-.24,-.25), ("Home TCP",.55,0)]
    for label,x,y in points:
        px,py=ox+x*scale,oy-y*scale
        color="#E5A842" if label=="Pick" else "#168C8C" if label=="Home TCP" else "#246A8A"
        s += [f'<circle cx="{px:.1f}" cy="{py:.1f}" r="8" fill="{color}"/><text x="{px+10:.1f}" y="{py-8:.1f}" class="small">{label}</text>']
    s += ['<rect x="650" y="88" width="520" height="300" rx="12" fill="#F8FAFB" stroke="#C5D1D8" stroke-width="2"/>',
          '<text x="680" y="126" class="label">Stations in W · (x,y), m</text>',
          '<text x="680" y="164" class="small">B1 (−.24,+.25)   B2 (−.24,0)</text>',
          '<text x="680" y="196" class="small">B3 (−.24,−.25)   P (+.30,0)   H (+.55,0)</text>',
          '<text x="680" y="246" class="small">Link-only reach: r=.05–.55 m</text>',
          '<text x="680" y="278" class="small">With J2 limits: inner reach ≈.1075 m</text>',
          '<text x="680" y="322" class="small">Grid at z=.56 m, yaw 0:</text>',
          '<text x="680" y="352" class="small">3,968 / 6,561 targets IK-reachable</text>',
          '<text x="680" y="378" class="tiny muted">Not a collision map; links/tool not swept.</text>']
    s += [f'<line x1="{ox-140}" y1="{oy}" x2="{ox+245}" y2="{oy}" class="axis"/><line x1="{ox}" y1="{oy+130}" x2="{ox}" y2="{oy-145}" class="axis"/><text x="{ox+247}" y="{oy+22}" class="small">+X</text><text x="{ox+10}" y="{oy-145}" class="small">+Y</text>']
    return s


def svg_frames():
    s=svg_start(1200,430,"Planar coordinate frames and worked FK geometry")
    ox,oy=235,325; sc=425
    q1=math.radians(30); q2=math.radians(-60); l1=.30; l2=.25
    ex=ox+l1*sc*math.cos(q1); ey=oy-l1*sc*math.sin(q1)
    tx=ex+l2*sc*math.cos(q1+q2); ty=ey-l2*sc*math.sin(q1+q2)
    s += [f'<line x1="{ox}" y1="{oy}" x2="{ox+140}" y2="{oy}" class="axis" marker-end="url(#arrow)"/><line x1="{ox}" y1="{oy}" x2="{ox}" y2="{oy-130}" class="axis" marker-end="url(#arrow)"/><text x="{ox+145}" y="{oy+7}" class="small">Xᵂ</text><text x="{ox+8}" y="{oy-136}" class="small">Yᵂ</text>']
    s += [f'<line x1="{ox}" y1="{oy}" x2="{ex:.1f}" y2="{ey:.1f}" class="arm"/><line x1="{ex:.1f}" y1="{ey:.1f}" x2="{tx:.1f}" y2="{ty:.1f}" class="arm"/>']
    s += [f'<circle cx="{ox}" cy="{oy}" r="12" class="joint"/><circle cx="{ex:.1f}" cy="{ey:.1f}" r="12" class="joint"/><circle cx="{tx:.1f}" cy="{ty:.1f}" r="10" fill="#E5A842"/>']
    s += [f'<text x="{(ox+ex)/2-5:.1f}" y="{(oy+ey)/2-20:.1f}" class="small">L₁=.30 m</text><text x="{(ex+tx)/2+6:.1f}" y="{(ey+ty)/2-12:.1f}" class="small">L₂=.25 m</text><text x="{tx+16:.1f}" y="{ty:.1f}" class="small">TCP x=.476314, y=.025000 m</text>']
    s += ['<path d="M295 325 A60 60 0 0 0 287 295" fill="none" stroke="#E5A842" stroke-width="4"/><text x="291" y="283" class="small">q₁=30°</text>', '<path d="M405 230 A55 55 0 0 1 454 246" fill="none" stroke="#E5A842" stroke-width="4"/><text x="440" y="213" class="small">q₂=−60°</text>']
    s += ['<rect x="735" y="86" width="400" height="280" rx="12" fill="#F4F7F8" stroke="#C5D1D8" stroke-width="2"/><text x="765" y="125" class="label">Frames / axes</text><text x="765" y="162" class="small">W: shoulder origin; +X forward, +Y lateral</text><text x="765" y="192" class="small">q₁ from Xᵂ to link 1; q₂ relative at elbow</text><text x="765" y="222" class="small">z=q₃=.450 m; ψ=q₁+q₂+q₄=−15°</text><text x="765" y="272" class="label">IK intermediate</text><text x="765" y="307" class="small">r²=.476314²+.025²=.2275 m²</text><text x="765" y="337" class="small">cos q₂=(.2275−.1525)/.15=.5 → q₂=−60°</text>']
    return s


def svg_architecture():
    s=svg_start(1280,520,"Implemented software path and conceptual physical system")
    blocks=[
      (40,95,200,105,"Simulated ID","select S / M / L",True),
      (285,95,200,105,"Controller FSM","fixed Δt = 1/60 s",True),
      (530,95,200,105,"IK + route","cubic joint samples",True),
      (775,95,200,105,"Robot view","kinematic links / TCP",True),
      (1020,95,200,105,"Drive concept","electric R/P axes",False),
      (40,300,200,105,"UI + event log","controls / export",True),
      (285,300,200,105,"Placement check","pose / speed window",True),
      (530,300,200,105,"Rapier world","dynamic package / bins",True),
      (775,300,200,105,"Gripper model","pad gates / fixed joint",True),
      (1020,300,200,105,"Power / sensors","supply / feedback",False),
    ]
    for x,y,w,h,title,sub,real in blocks:
        cl="solid" if real else "concept"
        s += [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" class="{cl}"/>',f'<text x="{x+12}" y="{y+38}" class="small">{esc(title)}</text>',f'<text x="{x+12}" y="{y+72}" class="tiny">{esc(sub)}</text>']
    # Implemented flow
    for x1,y1,x2,y2 in [(240,148,280,148),(485,148,525,148),(730,148,770,148),(875,200,875,300),(775,352,735,352),(530,352,490,352),(285,352,245,352),(385,300,385,200)]:
        s += [f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#246A8A" stroke-width="3" marker-end="url(#arrow)"/>']
    s += ['<line x1="975" y1="148" x2="1015" y2="148" stroke="#738594" stroke-width="3" stroke-dasharray="7 6" marker-end="url(#arrow)"/>','<line x1="1120" y1="200" x2="1120" y2="300" stroke="#738594" stroke-width="3" stroke-dasharray="7 6" marker-end="url(#arrow)"/>','<text x="40" y="465" class="tiny">Solid = implemented simulation/software · dashed = conceptual hardware</text>','<text x="40" y="492" class="tiny muted">No camera, encoder, drive or supply is installed; robot links are commanded kinematically.</text>']
    return s


def svg_grasp():
    s=svg_start(1200,350,"Package handling logic · gate, attach, release, verify")
    steps=[("1 · Align","Offset ≤12 mm\nYaw ≤8°"),("2 · Qualify","both pad sensors\nwidth + virtual force"),("3 · Carry","Rapier fixed joint\nattachment required"),("4 · Release","remove joint\npackage dynamic"),("5 · Verify","target region +\nsettled velocities")]
    x0=35; w=205; gap=30; y=105; h=150
    for i,(title,sub) in enumerate(steps):
        x=x0+i*(w+gap)
        fill="#EAF2F5" if i not in (4,) else "#E8F4F0"
        s += [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="15" fill="{fill}" stroke="#246A8A" stroke-width="3"/>',f'<text x="{x+16}" y="{y+38}" class="label">{title}</text>']
        lines=sub.split("\n")
        for j,line in enumerate(lines): s += [f'<text x="{x+16}" y="{y+78+j*28}" class="small">{esc(line)}</text>']
        if i<4: s += [f'<line x1="{x+w}" y1="{y+75}" x2="{x+w+gap-5}" y2="{y+75}" stroke="#168C8C" stroke-width="4" marker-end="url(#tealArrow)"/>']
    s += ['<text x="55" y="302" class="small">No package teleport on grasp: captured relative pose is constrained; release restores dynamic motion.</text>']
    return s


def svg_motion():
    s=svg_start(1280,520,"Route logic and rest-to-rest cubic example")
    # Route panel
    s += ['<text x="55" y="92" class="label">XY route projection (not a swept collision check)</text>','<rect x="65" y="350" width="155" height="70" rx="8" fill="#EAF2F5" stroke="#246A8A" stroke-width="3"/><text x="80" y="390" class="small">Pick station</text>','<rect x="480" y="315" width="150" height="105" rx="8" fill="#EAF2F5" stroke="#246A8A" stroke-width="3"/><text x="505" y="370" class="small">Target bin</text>']
    route='M145 350 L210 250 L300 150 L425 150 L520 315'
    s += [f'<path d="{route}" class="path" marker-end="url(#tealArrow)"/>','<circle cx="145" cy="350" r="12" fill="#E5A842"/><circle cx="210" cy="250" r="10" fill="#246A8A"/><circle cx="300" cy="150" r="10" fill="#168C8C"/><circle cx="425" cy="150" r="10" fill="#246A8A"/>','<text x="105" y="333" class="tiny">Pick</text><text x="170" y="230" class="tiny">Clear z=.56</text><text x="250" y="118" class="tiny">x=.12, y=±.40</text><text x="380" y="118" class="tiny">Approach</text><text x="78" y="455" class="tiny">Bins: (−.24, ±.25 / 0) m · place TCP z=.54 m</text>']
    # cubic profile panel
    s += ['<line x1="65" y1="476" x2="655" y2="476" stroke="#C5D1D8" stroke-width="2"/><text x="720" y="112" class="label">J1 example, T=2 s</text>']
    # normalized q profile in 300x180 graph
    gx,gy,gw,gh=760,145,420,220
    s += [f'<rect x="{gx}" y="{gy}" width="{gw}" height="{gh}" fill="#F8FAFB" stroke="#C5D1D8"/>',f'<line x1="{gx}" y1="{gy+gh}" x2="{gx+gw}" y2="{gy+gh}" class="axis"/><line x1="{gx}" y1="{gy}" x2="{gx}" y2="{gy+gh}" class="axis"/>']
    pts=[]
    for j in range(61):
        u=j/60; v=3*u*u-2*u*u*u
        pts.append(f"{gx+gw*u:.1f},{gy+gh*(1-v):.1f}")
    s += [f'<polyline points="{" ".join(pts)}" fill="none" stroke="#168C8C" stroke-width="5"/>',f'<circle cx="{gx+gw/2}" cy="{gy+gh/2}" r="8" fill="#E5A842"/>',f'<text x="{gx+gw/2+14}" y="{gy+gh/2-8}" class="small">t=1 s → 15°</text>',f'<text x="{gx+2}" y="{gy+gh+25}" class="tiny">0 s · q₀=0°</text>',f'<text x="{gx+gw-90}" y="{gy+gh+25}" class="tiny">2 s · qf=30°</text>','<text x="720" y="415" class="small">q=q₀+Δq(3u²−2u³), u=t/T</text>','<text x="720" y="449" class="small">vmax=.3927 rad/s; amax=.7854 rad/s²</text>','<text x="720" y="483" class="tiny">Below configured J1 caps 1.5708 rad/s and 3.1416 rad/s².</text>']
    return s


def svg_state():
    s=svg_start(1320,510,"Autonomous controller · explicit states and terminal gates")
    labels=["Idle","Select +\nvalidate","Plan\nroute","Move to\npickup","Align +\ngrasp","Lift","Transport","Release","Verify\nplacement","Return\nhome","Completed"]
    x0=40; y1=105; w=155; h=78; gap=50
    for i,label in enumerate(labels[:6]):
        x=x0+i*(w+gap)
        s += [f'<rect x="{x}" y="{y1}" width="{w}" height="{h}" rx="10" class="solid"/>']
        for j,line in enumerate(label.split("\n")): s += [f'<text x="{x+10}" y="{y1+31+j*22}" class="small">{esc(line)}</text>']
        if i<5: s += [f'<line x1="{x+w}" y1="{y1+h/2}" x2="{x+w+gap-1}" y2="{y1+h/2}" stroke="#246A8A" stroke-width="3" marker-end="url(#arrow)"/>']
    # Lower row runs right-to-left so it continues from Lift without crossing.
    labels2=labels[6:]
    y2=245
    for i,label in enumerate(labels2):
        x=1065-i*(w+gap)
        s += [f'<rect x="{x}" y="{y2}" width="{w}" height="{h}" rx="10" fill="#E8F4F0" stroke="#168C8C" stroke-width="2"/>']
        for j,line in enumerate(label.split("\n")): s += [f'<text x="{x+10}" y="{y2+31+j*22}" class="small">{esc(line)}</text>']
        if i<4: s += [f'<line x1="{x}" y1="{y2+h/2}" x2="{x-gap+1}" y2="{y2+h/2}" stroke="#168C8C" stroke-width="3" marker-end="url(#tealArrow)"/>']
    # transition down from grasp to lift and verify to return is illustrated by arrows; process annotation
    s += ['<path d="M 1142 183 L 1142 245" fill="none" stroke="#246A8A" stroke-width="3" marker-end="url(#arrow)"/>',
          '<rect x="40" y="365" width="560" height="86" rx="10" fill="#F4F7F8" stroke="#C5D1D8" stroke-width="2"/>',
          '<text x="60" y="397" class="small">Recoverable fault: route / grasp / attachment / placement / exception</text>',
          '<text x="60" y="430" class="small">Abort: stop active phase · Reset terminal/fault → Idle</text>',
          '<rect x="710" y="365" width="540" height="86" rx="10" fill="#FBEFED" stroke="#B45A4A" stroke-width="2"/>',
          '<text x="735" y="401" class="small">No false success: acceptance + settle window + return home</text>',
          '<text x="735" y="432" class="small">A fault or abort cannot reach Completed</text>',
          '<path d="M 490 183 C 490 305 320 310 320 365" fill="none" stroke="#B45A4A" stroke-width="3" marker-end="url(#arrow)"/>',
          '<path d="M 735 323 C 735 342 900 342 900 365" fill="none" stroke="#B45A4A" stroke-width="3" marker-end="url(#arrow)"/>']
    return s


def svg_validation():
    s=svg_start(1200,430,"Measured cycle-time ranges by package category")
    x0,x1=220,1040; y0=120; xscale=(x1-x0)/35
    s += ['<text x="62" y="91" class="small">Simulated seconds · min–max line; mean diamond; all attempts accepted.</text>']
    for v in (28,30,32,34,36):
        x=x0+(v-28)*xscale
        s += [f'<line x1="{x:.1f}" y1="{y0-18}" x2="{x:.1f}" y2="{y0+210}" stroke="#DCE4E8" stroke-width="1"/><text x="{x-11:.1f}" y="{y0+242}" class="small">{v}</text>']
    s += [f'<line x1="{x0}" y1="{y0+210}" x2="{x1}" y2="{y0+210}" class="axis"/>']
    cats=[("S",3),("M",4),("L",5)]
    for idx,(cat,yy) in enumerate(cats):
        item=per_category[cat]; y=y0+idx*74
        a=x0+(item['min']-28)*xscale; b=x0+(item['max']-28)*xscale; m=x0+(item['mean']-28)*xscale
        s += [f'<text x="90" y="{y+8}" class="label">{cat} → B{idx+1}</text>',f'<line x1="{a:.1f}" y1="{y}" x2="{b:.1f}" y2="{y}" stroke="#246A8A" stroke-width="12" stroke-linecap="round"/>',f'<path d="M {m:.1f} {y-11} l 11 11 -11 11 -11 -11 Z" fill="#E5A842" stroke="#9A6722" stroke-width="2"/>',f'<text x="{b+18:.1f}" y="{y+7}" class="small">mean {item["mean"]:.2f} · n={item["n"]}, {item["success"]}/{item["n"]} accepted</text>']
    s += ['<text x="65" y="395" class="tiny muted">Dots/intervals are computed from the checked-in 100-row campaign; not wall-clock or hardware cycle times.</text>']
    return s


def generate_diagrams():
    diagrams={
      "01-workcell.svg":svg_workcell(),
      "02-robot-anatomy.svg":svg_anatomy(),
      "03-workspace.svg":svg_workspace(),
      "04-coordinate-frames.svg":svg_frames(),
      "05-system-architecture.svg":svg_architecture(),
      "06-grasp-sequence.svg":svg_grasp(),
      "07-route-cubic.svg":svg_motion(),
      "08-controller-state.svg":svg_state(),
      "09-validation-chart.svg":svg_validation(),
    }
    for name,parts in diagrams.items(): write_svg(name,parts)
    IMAGES.mkdir(parents=True,exist_ok=True)
    if SCREENSHOT.resolve() != (IMAGES/"browser-workcell-smoke.png").resolve():
        shutil.copyfile(SCREENSHOT,IMAGES/"browser-workcell-smoke.png")
    soffice=shutil.which("soffice") or "/Users/lochan/.local/bin/soffice"
    if not Path(soffice).exists(): raise RuntimeError("LibreOffice soffice is required to rasterize editable SVGs for DOCX.")
    source_files=[str(DIAGRAMS/n) for n in diagrams]
    with tempfile.TemporaryDirectory(prefix="sortlab-doc-profile-") as profile:
        cmd=[soffice,"--headless",f"-env:UserInstallation=file://{profile}","--convert-to","png","--outdir",str(IMAGES),*source_files]
        subprocess.run(cmd,check=True,capture_output=True,text=True)


def shade(cell, fill):
    pr=cell._tc.get_or_add_tcPr(); shd=OxmlElement("w:shd"); shd.set(qn("w:fill"),fill); pr.append(shd)


def margins(cell,top=70,start=90,bottom=70,end=90):
    tc=cell._tc.get_or_add_tcPr(); mar=OxmlElement("w:tcMar")
    for tag,val in (("top",top),("start",start),("bottom",bottom),("end",end)):
        e=OxmlElement("w:"+tag); e.set(qn("w:w"),str(val)); e.set(qn("w:type"),"dxa"); mar.append(e)
    tc.append(mar)


doc=Document()
sec=doc.sections[0]
sec.page_width=Inches(8.5); sec.page_height=Inches(11)
sec.top_margin=Inches(.68); sec.bottom_margin=Inches(.68); sec.left_margin=Inches(.72); sec.right_margin=Inches(.72)
sec.header_distance=Inches(.32); sec.footer_distance=Inches(.32)
sec.different_first_page_header_footer=True

normal=doc.styles["Normal"]
normal.font.name=FONT; normal.font.size=Pt(9.6); normal.font.color.rgb=RGBColor.from_string(INK)
normal.paragraph_format.space_after=Pt(5); normal.paragraph_format.line_spacing=1.10
for sty,size,color,before,after in [("Title",32,NAVY,0,8),("Subtitle",16,BLUE,0,12),("Heading 1",16,NAVY,0,8),("Heading 2",11.5,BLUE,8,4),("Heading 3",10,TEAL,6,3)]:
    st=doc.styles[sty]; st.font.name=FONT; st.font.size=Pt(size); st.font.bold=sty!="Subtitle"; st.font.color.rgb=RGBColor.from_string(color)
    st.paragraph_format.space_before=Pt(before); st.paragraph_format.space_after=Pt(after); st.paragraph_format.keep_with_next=True

def add_page(): doc.add_page_break()

def add_heading(text,level=1):
    p=doc.add_paragraph(style=f"Heading {level}"); p.add_run(text); p.alignment=WD_ALIGN_PARAGRAPH.LEFT; return p

def add_body(text,style=None):
    p=doc.add_paragraph(style=style or "Normal"); p.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY
    p.paragraph_format.widow_control=True
    p.add_run(text)
    return p

def add_bullet(text):
    p=doc.add_paragraph(style="List Bullet"); p.alignment=WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.left_indent=Inches(.28); p.paragraph_format.first_line_indent=Inches(-.15); p.paragraph_format.space_after=Pt(2.5); p.paragraph_format.line_spacing=1.05
    p.add_run(text); return p

def add_equation(text):
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before=Pt(3); p.paragraph_format.space_after=Pt(5); p.paragraph_format.keep_together=True
    r=p.add_run(text); r.font.name="Cambria Math"; r.font.size=Pt(10.5); r.font.bold=True; r.font.color.rgb=RGBColor.from_string(NAVY)
    return p

def add_caption(text):
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before=Pt(2); p.paragraph_format.space_after=Pt(5); p.paragraph_format.keep_together=True
    r=p.add_run(text); r.font.name=FONT; r.font.size=Pt(8.2); r.font.italic=True; r.font.color.rgb=RGBColor.from_string(MID)
    return p

def add_figure(svgname,caption,width=6.5):
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before=Pt(1); p.paragraph_format.space_after=Pt(0); p.paragraph_format.keep_together=True; p.paragraph_format.keep_with_next=True
    run=p.add_run(); pic=run.add_picture(str(IMAGES/(Path(svgname).stem+".png")),width=Inches(width))
    pic._inline.docPr.set("descr",caption)
    add_caption(caption)

def add_table(caption,headers,rows,widths=None,font_size=8.1):
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.LEFT; p.paragraph_format.space_before=Pt(3); p.paragraph_format.space_after=Pt(3); p.paragraph_format.keep_with_next=True
    r=p.add_run(caption); r.bold=True; r.font.size=Pt(8.4); r.font.color.rgb=RGBColor.from_string(BLUE)
    table=doc.add_table(rows=1,cols=len(headers)); table.autofit=False; table.style="Table Grid"
    tablePr=table._tbl.tblPr
    tblInd=OxmlElement("w:tblInd"); tblInd.set(qn("w:w"),"0"); tblInd.set(qn("w:type"),"dxa"); tablePr.append(tblInd)
    hdr=table.rows[0]; hdr._tr.get_or_add_trPr().append(OxmlElement("w:tblHeader"))
    for i,(cell,val) in enumerate(zip(hdr.cells,headers)):
        cell.text=str(val); shade(cell,NAVY); margins(cell)
        if widths: cell.width=Inches(widths[i])
        for p0 in cell.paragraphs:
            p0.alignment=WD_ALIGN_PARAGRAPH.LEFT; p0.paragraph_format.space_after=Pt(0); p0.paragraph_format.line_spacing=1.0
            for rr in p0.runs: rr.font.name=FONT; rr.font.size=Pt(font_size); rr.font.bold=True; rr.font.color.rgb=RGBColor.from_string(WHITE)
    for ridx,row in enumerate(rows):
        cells=table.add_row().cells
        trPr=table.rows[-1]._tr.get_or_add_trPr(); trPr.append(OxmlElement("w:cantSplit"))
        for i,(cell,val) in enumerate(zip(cells,row)):
            cell.text=str(val); cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER; margins(cell)
            if widths: cell.width=Inches(widths[i])
            if ridx%2==1: shade(cell,LIGHT)
            for p0 in cell.paragraphs:
                p0.alignment=WD_ALIGN_PARAGRAPH.LEFT; p0.paragraph_format.space_after=Pt(0); p0.paragraph_format.line_spacing=1.0
                for rr in p0.runs: rr.font.name=FONT; rr.font.size=Pt(font_size); rr.font.color.rgb=RGBColor.from_string(INK)
    table.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
    doc.add_paragraph().paragraph_format.space_after=Pt(1)
    return table

def add_link_text(text,url):
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.LEFT; p.paragraph_format.space_after=Pt(4)
    p.add_run(text+" ")
    r=p.add_run(url); r.font.color.rgb=RGBColor.from_string(BLUE); r.font.size=Pt(8.6)
    return p

def add_reference(text):
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_after=Pt(5); p.paragraph_format.line_spacing=1.05
    p.add_run(text)
    return p

def add_field(run,field):
    begin=OxmlElement("w:fldChar"); begin.set(qn("w:fldCharType"),"begin")
    instr=OxmlElement("w:instrText"); instr.set(qn("xml:space"),"preserve"); instr.text=field
    separate=OxmlElement("w:fldChar"); separate.set(qn("w:fldCharType"),"separate")
    t=OxmlElement("w:t"); t.text="1"
    end=OxmlElement("w:fldChar"); end.set(qn("w:fldCharType"),"end")
    run._r.extend([begin,instr,separate,t,end])


def add_running_matter():
    h=sec.header.paragraphs[0]; h.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    r=h.add_run("SORTLAB   /   ADVANCED WAREHOUSE ROBOTICS DIGITAL TWIN   /   V3.0")
    r.font.name=FONT; r.font.size=Pt(7.5); r.font.bold=True; r.font.color.rgb=RGBColor.from_string(MID)
    f=sec.footer.paragraphs[0]; f.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=f.add_run("Robotics · BCA UG Semester VII     •     Page "); r.font.name=FONT; r.font.size=Pt(8); r.font.color.rgb=RGBColor.from_string(MID)
    add_field(f.add_run(),"PAGE")
    r=f.add_run(" of "); r.font.name=FONT; r.font.size=Pt(8); r.font.color.rgb=RGBColor.from_string(MID)
    add_field(f.add_run(),"NUMPAGES")
    sec.first_page_header.paragraphs[0].text=""
    sec.first_page_footer.paragraphs[0].text=""


def build_report():
    generate_diagrams()
    # Cover
    p=doc.add_paragraph(); p.paragraph_format.space_before=Pt(42); p.alignment=WD_ALIGN_PARAGRAPH.LEFT
    r=p.add_run("ROBOTICS  ·  INDIVIDUAL DESIGN PROJECT"); r.font.name=FONT; r.font.size=Pt(10); r.font.bold=True; r.font.color.rgb=RGBColor.from_string(TEAL)
    p=doc.add_paragraph(); p.paragraph_format.space_before=Pt(23); p.paragraph_format.space_after=Pt(0)
    r=p.add_run("SORTLAB"); r.font.name=FONT; r.font.size=Pt(34); r.font.bold=True; r.font.color.rgb=RGBColor.from_string(NAVY)
    p=doc.add_paragraph(); p.paragraph_format.space_after=Pt(15)
    r=p.add_run("Advanced Warehouse Robotics Digital Twin"); r.font.name=FONT; r.font.size=Pt(18); r.font.color.rgb=RGBColor.from_string(BLUE)
    p=doc.add_paragraph(); p.paragraph_format.space_after=Pt(22)
    r=p.add_run("FINAL DESIGN REPORT  ·  VERSION 3.0"); r.font.name=FONT; r.font.size=Pt(10); r.font.bold=True; r.font.color.rgb=RGBColor.from_string(TEAL)
    # Accent rule
    t=doc.add_table(rows=1,cols=1); t.autofit=False; t.columns[0].width=Inches(6.8); c=t.cell(0,0); c.text=""; shade(c,TEAL); c.height=Inches(.055); margins(c,0,0,0,0)
    doc.add_paragraph().paragraph_format.space_after=Pt(11)
    cover_rows=[
      ("Student name","[Full student name]"),
      ("University registration / USN","[Registration number]"),
      ("Programme / semester","BCA UG · Semester VII"),
      ("Project option","01 · Automated Warehouse Package Sorting Robot"),
      ("Submission stage / version","Final report · V3.0"),
    ]
    for label,value in cover_rows:
        p=doc.add_paragraph(); p.paragraph_format.space_after=Pt(5)
        a=p.add_run(label+"   "); a.bold=True; a.font.color.rgb=RGBColor.from_string(NAVY)
        b=p.add_run(value); b.font.color.rgb=RGBColor.from_string(INK)
    p=doc.add_paragraph(); p.paragraph_format.space_before=Pt(24); p.paragraph_format.space_after=Pt(6)
    r=p.add_run("S → B1     M → B2     L → B3"); r.font.name=FONT; r.font.size=Pt(15); r.font.bold=True; r.font.color.rgb=RGBColor.from_string(TEAL)
    p=doc.add_paragraph(); p.paragraph_format.space_after=Pt(12)
    p.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY
    r=p.add_run("A four-axis SCARA-style software twin integrates analytic kinematics, route planning, cubic trajectories, a simplified gripper, Rapier package physics, autonomous control and placement verification."); r.font.size=Pt(10.3)
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.LEFT
    r=p.add_run("Simulation evidence only. No physical robot or sensor was tested. Draft assistance used AI tools; the student must verify the report and acknowledge substantive assistance under course rules."); r.font.size=Pt(8.6); r.font.italic=True; r.font.color.rgb=RGBColor.from_string(MID)

    # Contents, figures, tables. Static page numbers are verified after export.
    add_page()
    add_heading("Contents",1)
    contents=[("1. Problem definition and engineering inputs","3"),("2. Robot choice, anatomy and workspace","4"),("3. Coordinate frames and kinematics","5"),("4. Architecture, drives and end effector","6"),("5. Waypoints, route planning and trajectory","7"),("6. Autonomous control and placement verification","8"),("7. Validation method and results","9"),("8. Safety, evaluation and conclusion","10"),("References","11"),("Appendices","12")]
    add_table("",["Section","Page"],contents,[5.95,.55],9)
    add_heading("Figures",2)
    fig_list=[("1. Workcell and configured stations","3"),("2. Robot anatomy and four axes","4"),("3. XY reach guides and station points","4"),("4. Coordinate frames and FK example","5"),("5. System architecture","6"),("6. Grasp–carry–release sequence","6"),("7. Route and cubic example","7"),("8. Controller state machine","8"),("9. Measured cycle durations by category","9"),("10. Browser smoke-test workcell","10")]
    for label,page in fig_list:
        p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.LEFT; p.paragraph_format.space_after=Pt(1)
        p.add_run(label+"   ·   "+page).font.size=Pt(8.8)
    add_heading("Tables",2)
    for text in ["1. Configured package classes and destinations · 3","2. Robot configuration comparison · 4","3. Named waypoints · 7","4. Nominal campaign summary · 9","5. Hazard analysis · 10"]:
        p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.LEFT; p.paragraph_format.space_after=Pt(1); p.add_run(text).font.size=Pt(8.8)
    add_body("Page numbers are static and correspond to this generated edition. Running page numbering is a Word PAGE field.")

    # Page 3 — definition and workcell
    add_page(); add_heading("1 · Problem definition and engineering inputs",1)
    add_body("SortLab addresses a fixed warehouse cell that receives one known package at a time, identifies its configured category, picks it at a defined station, and places it into one of three dedicated bins. The design is intended to demonstrate the engineering choices behind sorting—reach, gripping, route geometry, control sequencing and verification—rather than claim a production-ready robot. Package category is selected as a simulated label by the operator; no camera or barcode sensor is implemented.")
    add_body("The measurable simulation requirement is one verified package cycle for each configured mapping: Small (S) to B1, Medium (M) to B2 and Large (L) to B3. The configured median cycle aspiration is ≤12 s; the evaluation campaign later measured 30.350 s and therefore missed it. The workcell is indoors, single-package and SI-based. Geometry and masses below are assumptions from the validated project configuration, not a surveyed warehouse.")
    add_table("Table 1. Package model assumptions and configured mapping",["ID / class","Proxy shape","Length × width × height (m)","Mass (kg)","Destination"],[
      ("S · small","Rigid carton","0.08 × 0.06 × 0.04","0.10","B1"),
      ("M · medium","Vertical cylinder","0.12 × 0.09 × 0.06","0.30","B2"),
      ("L · large","Rounded cuboid pouch proxy","0.16 × 0.12 × 0.08","0.60","B3"),
    ],[.78,1.25,2.15,.75,1.1],7.8)
    add_body("Pickup XY is (+0.30, 0.00) m; category-specific package-centre Z is .37/.38/.39 m. Bin centres are B1 (−.24,+.25), B2 (−.24,0), B3 (−.24,−.25) m. Table, bin floor and lip elevations are z=.25, .30 and .46 m. Transfer TCP height is .54 m and clearance/home height is .56 m. Figure 1 locates these model stations.")
    add_figure("01-workcell.svg","Figure 1. Workcell map: plan-view station coordinates and side-view support, bin, transfer and home heights. The XY route is illustrative; no swept collision clearance is implied.",6.45)

    # Page 4 — configuration, anatomy, workspace
    add_page(); add_heading("2 · Robot choice, anatomy and workspace",1)
    add_body("A SCARA-style layout is selected for predominantly planar transfers with vertical pickup and placement. Its two planar rotary links give a compact annular reach; J3 moves the TCP vertically and J4 sets tool yaw. A Cartesian gantry is a credible alternative where rectangular coverage, stiffness and simple axis-wise programming matter more than compact rotary reach. Selection is qualitative: neither mechanism was physically compared.")
    add_table("Table 2. Configuration trade-offs under this task assumption",["Criterion","SCARA-style (selected)","Cartesian gantry (alternative)"],[
      ("Workspace","Compact annular XY reach; reach depends on joint angles.","Rectangular envelope; axis-aligned stations are straightforward."),
      ("Mechanics","Few links, rotary joints; compact but nonlinear IK and branch selection.","Orthogonal slides simplify geometry; long rails need a stiff aligned frame."),
      ("Task fit","Planar bins + vertical approach; educational FK/IK example.","Strong alternative if a broad rectangular work area dominates."),
      ("Evidence boundary","Modeled as 4-axis kinematics; no physical performance comparison.","Conceptual comparison only; no measured accuracy/cost/payload data."),
    ],[1.05,2.7,2.9],7.8)
    add_body("The mechanism has four independent commanded axes: J1 and J2 revolute about parallel +Z axes, J3 prismatic with TCP world-Z=.30–.58 m, and J4 tool yaw about +Z. Link lengths are L1=.30 m and L2=.25 m; configured limits are J1±150°, J2±160°, J4±180°. The ideal link-only radial interval is .05–.55 m. With the J2 limit, inner radial reach is ≈.1075 m. Neither radial interval accounts for link, tool, package or obstacle clearance.")
    add_figure("02-robot-anatomy.svg","Figure 2. Labeled R–R–P–R SCARA-style anatomy, link lengths, commanded joint types, tool centre point and four degrees of freedom.",6.45)
    add_figure("03-workspace.svg","Figure 3. Analytic radial reach guides and named station points. The 81×81 validation grid measured IK reachability, not collision-free clearance.",6.45)

    # Page 5 — kinematics
    add_page(); add_heading("3 · Coordinate frames and kinematics",1)
    add_body("Frame W is right-handed at the J1 shoulder: +X points toward the input, +Y laterally toward B1, +Z upward. J1 rotates link 1; J2 is relative at the elbow. J3 is the TCP world-Z coordinate, not an incremental displacement. J4 adds wrist yaw. Figure 4 labels the planar link vectors and the frame used in the equations [R1].")
    add_equation("x = L₁ cos(q₁) + L₂ cos(q₁ + q₂)     y = L₁ sin(q₁) + L₂ sin(q₁ + q₂)")
    add_equation("z = q₃     ψ = q₁ + q₂ + q₄")
    add_body("Worked FK: let L1=.30 m, L2=.25 m, q1=30°, q2=−60°, q3=.450 m and q4=15°. Then q1+q2=−30°:")
    add_equation("x = .30 cos 30° + .25 cos(−30°) = .259808 + .216506 = .476314 m")
    add_equation("y = .30 sin 30° + .25 sin(−30°) = .150000 − .125000 = .025000 m")
    add_body("Thus the analytic TCP is (.476314, .025000, .450000) m and yaw ψ=−15°. For the inverse branch, r²=.476314²+.025²=.2275 m²; cos(q2)=(.2275−.30²−.25²)/(2·.30·.25)=.5, so q2=±60°. For q2=−60°, atan2(y,x)≈3° and atan2(L2 sin q2, L1+L2 cos q2)≈−27°, giving q1=30°. Then q4=ψ−q1−q2=15°. The solver checks both elbow branches and configured joint limits [R1].")
    add_body("In 5,000 valid FK→IK→FK samples, maximum residuals were 4.97×10⁻¹⁶ m and 1.78×10⁻¹⁵ rad. These are floating-point algorithm residuals against analytic equations, not physical positioning accuracy. Full extension is a singular boundary; full fold is excluded by the ±160° J2 limit.")
    add_figure("04-coordinate-frames.svg","Figure 4. World frame W, link vectors and numerical inverse-kinematics intermediate values for the worked two-link example.",6.45)

    # Page 6 — architecture, drives and gripper
    add_page(); add_heading("4 · System architecture, drives and end effector",1)
    add_body("The implemented path runs from simulated category input through the typed controller, analytic IK/route planner, joint trajectories and kinematic robot view. The gripper performs simulated pad-overlap, alignment, jaw-width and virtual force gates; Rapier carries a package via a fixed joint, then steps it dynamically after release. The placement classifier reads package pose and velocity. Solid blocks in Figure 5 are implemented software/simulation; dashed power, sensor and actuator blocks are conceptual hardware only [R3, R4].")
    add_figure("05-system-architecture.svg","Figure 5. Architecture separates implemented simulation modules from conceptual physical sensors, drives and power. Solid arrows show software/physics flow.",6.45)
    add_heading("Drive and tool choice",2)
    add_body("The concept uses electric rotary servos for J1/J2/J4, a linear electric screw/actuator for J3, and an electric parallel-jaw gripper. Compared with pneumatic jaws, electric closure is easier to associate with commanded position in this compact educational cell and avoids assuming a compressed-air utility. Pneumatics can be fast and simple but require air and measured force regulation. Vacuum gripping was not selected for mixed shapes and the pouch proxy. No motor, gearbox, gripper, voltage, current, torque, supply or structural arm payload rating is specified; the arm payload margin is therefore unquantified.")
    add_heading("Transparent virtual grip-force screen",2)
    add_equation("2 μ N ≥ S m(g + aᶻ)     →     Nrequired = S m(g + aᶻ)/(2 μ)")
    add_body("For L: m=.60 kg, S=2, g=9.81 m/s², configured aᶻ=.30 m/s² and assumed μ=.50 give N=2(.60)(10.11)/(2·.50)=12.132 N per jaw. At μ=.30, N=20.22 N. The assumed virtual cap is 25 N/jaw, a capacity/required ratio of 2.06 at μ=.50. This is a modeled gate, not applied contact force or a physical payload margin. The audit corrected the code to include aᶻ and added a 12 N regression rejection test.")
    add_figure("06-grasp-sequence.svg","Figure 6. Grasp/carry/release sequence: successful attachment requires measured simulation gates; placement is verified after release.",6.45)

    # Page 7 — route and cubic
    add_page(); add_heading("5 · Waypoints, route planning and trajectory",1)
    add_body("Routes are planned before movement. The planner tries both elbow branches and selects a continuous feasible sampled TCP path with joint-limit and configured speed/acceleration checks. Approach/transit yaw is derived from the selected IK branch; the pickup and bin target use yaw 0. Joint-space cubic motion gives direct joint bounds. Cartesian waypoints describe task geometry but require IK and sampling. Discrete samples are not a swept-volume collision proof [R1].")
    add_table("Table 3. Named targets in world frame W",["Waypoint","Configured pose / joint target","Engineering note"],[
      ("Home","q=(0,0,.56,0); FK TCP=(+.55,0,.56) m","Configured standby; checked joint cubic"),
      ("Pick","(+.30,0,.37/.38/.39) m; yaw 0","S/M/L package centres above support"),
      ("Lift / clearance","same XY; TCP z=.56 m","Vertical rise after verified attachment"),
      ("Elevated transit","(+.12,+/−.40,.56) m","B1/B2 use +.40 Y; B3 uses −.40 Y"),
      ("Approach","(−.24, binY, .56) m","Above configured lip; branch-continuous IK yaw"),
      ("Place","(−.24, binY,.54) m; yaw 0","TCP 0.08 m above bin lip"),
      ("Return","reverse route, then home cubic","Only after accepted placement + settling"),
    ],[1.2,2.55,2.9],7.5)
    add_body("Cubic example (single J1, at rest): q0=0°, qf=30°, T=2 s, u=t/T. Using q=q0+(qf−q0)(3u²−2u³), at t=1 s, u=.5 and q=15°. The maxima are vmax=1.5Δq/T=.3927 rad/s and amax=6Δq/T²=.7854 rad/s². Both are below the configured J1 limits 1.5708 rad/s and 3.1416 rad/s² [R2]. This calculation illustrates the profile; it is not a campaign route measurement.")
    add_figure("07-route-cubic.svg","Figure 7. Elevated route through clearance and transit waypoints, plus the normalized cubic position profile and its calculated midpoint.",6.45)

    # Page 8 — controller, placement
    add_page(); add_heading("6 · Autonomous control and placement verification",1)
    add_body("The controller is a fixed-tick state machine separate from React. It selects and validates the category/bin mapping, plans the route and return before motion, moves to pickup, aligns and attempts grasp, lifts only after grasp success and Rapier attachment confirmation, transports, releases, verifies actual package state, returns home and then completes. Figure 8 summarizes the normal path and fault exits.")
    add_figure("08-controller-state.svg","Figure 8. Controller state flow. A successful sort requires the correct accepted placement, settling window and Completed return.",6.45)
    add_body("A failed grasp gets one bounded retry. The fault campaign exercised 12 classes ×3: unreachable route, misaligned grasp, lost attachment, release failure, incorrect bin, outside bin, placement timeout, abort at pickup, transport, release and verification, and invalid transition. All 36 outcomes matched expectation with no false success; reset and nominal rerun were clean in 36/36. Some classes use controller hooks or validation-only pose setup and are not natural physics failures. Lost attachment stops transport; invalid transitions are logged; abort/reset leave the controller in a defined stopped/idle state.")
    add_heading("Placement acceptance",2)
    add_body("The detached package centre must lie inside the intended bin interior after shrinking XY by the package's projected half-extents plus a 5 mm margin. Centre Z must be at least floor + half-height −12 mm and no higher than lip − half-height −10 mm. Linear speed must remain <.04 m/s and angular speed <.12 rad/s for .25 simulated seconds. Timeout is 8 s. The classifier reads Rapier package state, not a camera. Only accepted target classification followed by return-home `completed` counts as successful sorting.")

    # Page 9 — validation
    add_page(); add_heading("7 · Validation method and measured results",1)
    add_body("The headless runner uses the production SortingController, route/trajectory code, gripper port, Rapier PackagePhysicsSimulation and classifyPlacement at fixed Δt=1/60 s. It initializes a fresh world per nominal attempt and records actual terminal state and detached package snapshot. The balanced order gives S=34, M=33, L=33. The denominator is all 100 terminal attempts; success requires controller `completed`, accepted target-bin result and independent final snapshot classification to the same bin.")
    add_table("Table 4. Final nominal campaign and physical-state checks",["Measure","Observed value"],[
      ("Verified placements / terminal attempts","100 / 100 = 100%; 95% target met"),
      ("Category / destination","S→B1 34/34; M→B2 33/33; L→B3 33/33"),
      ("Cycle time (simulated)",f"mean {statistics.mean(durations):.3f} s; median {statistics.median(durations):.3f} s; min {min(durations):.3f} s; max {max(durations):.3f} s"),
      ("Grasp / retries","100 first-attempt successes; 0 retries; 0 final failures"),
      ("Placement / planning failures","wrong bin 0; outside 0; timeout 0; route rejection 0"),
      ("Placement final velocity maxima","linear {0:.3g} m/s; angular {1:.3g} rad/s".format(summary["placementVelocityBounds"]["maxLinearVelocityMps"],summary["placementVelocityBounds"]["maxAngularVelocityRadps"])),
      ("Numerical / fixed-step checks","5,000 FK/IK; 3,968/6,561 workspace grid; equal 120-step traces"),
      ("Fault campaign","36/36 expected; 0 false success; 36/36 clean resets and reruns"),
    ],[2.25,4.4],7.7)
    add_figure("09-validation-chart.svg","Figure 9. Per-category cycle-duration ranges and means calculated from the 100 raw attempt rows. All 100 were accepted placements.",6.45)
    add_body("Across valid round trips, maximum position residual was 4.97×10⁻¹⁶ m and yaw residual 1.78×10⁻¹⁵ rad (1e−10 tolerances). Rapier same-setup 120-step snapshots matched; fixed-joint carry tracking error was 8.04×10⁻⁸ m. Corrected controller/physics clock difference was 5.23×10⁻¹³ s. These values are simulation/test outputs; no cross-platform or real-world accuracy claim is made. Cycle-time aspiration ≤12 s median was not achieved (30.350 s).")

    # Page 10 — risk, conclusion, evidence
    add_page(); add_heading("8 · Safety, evaluation and conclusion",1)
    add_table("Table 5. Preliminary hazard review and residual risk",["Hazard","Proposed control","Residual risk / evidence boundary"],[
      ("Arm/jaw pinch or unexpected motion","Real cell: fixed guard, interlocked access, safe operating mode and safety-rated stop; software disables conflicting controls.","UI lock is not a safeguard; no safety system is implemented or certified."),
      ("Dropped or crushed package","Measure friction/crush limits; verify gripper force and add guarded catch region; simulation checks attachment and placement.","Fixed joint prevents modeled slip; virtual force is not real grip force."),
      ("Collision with bin, conveyor or person","Perform application risk assessment; use physical guarding and validated collision/stop system.","No swept-link/tool/package collision test; kinematic links ignore contact forces [R4, R5]."),
      ("Drive, power or control failure","Select rated drives, brakes, interlocks, power isolation and independent fault monitoring before construction.","Drive ratings, voltage, current, brakes and safety PLC are unspecified."),
    ],[1.35,2.8,2.5],7.3)
    add_body("The concept could automate repetitive transfers and reduce routine manual package handling, but would introduce new pinch, impact and dropped-load hazards. Any construction requires a task-specific risk assessment and safeguarded validation; the simulated stop is not an emergency stop [R5]. Practical next steps are swept-volume collision analysis, robot/link dynamics, measured friction and crush testing, physical drive sizing, real category sensing, cycle-time improvement and guarded hardware testing.")
    add_body("Conclusion. SortLab shows a coherent software path from category input through route planning, verified virtual grasp, fixed-step package carry, release, settling-based bin verification and safe/home return. The measured campaign met its 95% simulated placement target but missed the 12 s median aspiration. Before construction, the team would need to verify actuator torque/payload, full swept clearances, gripper contact forces, package variability, repeatability, cycle time and independent safety functions on a physical cell. No physical accuracy or reliability is established.")
    add_heading("Evidence and design evolution",2)
    add_body("V1.0 established the assumed cell and analytic feasibility; V2.0 added routes, trajectories, Rapier package handling, gripper and controller; V3.0 added dashboard/scenarios, 100-cycle and fault validation, and fixed the acceleration term omitted by the virtual force gate. The audited home pose is q=(0,0,.56,0), FK TCP=(+.55,0,.56) m; an earlier Mission 0 note gave a preliminary x=.30 m estimate. No faculty feedback record was found, so none is attributed.")
    add_figure("browser-workcell-smoke.png","Figure 10. Actual Playwright smoke-test capture of the SortLab browser workcell (18 October 2026, cached Chromium and WebGL 2 software rendering). This is application evidence, not a physical robot photograph.",5.9)

    # References and appendix
    add_page(); add_heading("References",1)
    add_reference("[R1] Kevin M. Lynch and Frank C. Park, Modern Robotics: Mechanics, Planning, and Control. Cambridge University Press, 2017. DOI 10.1017/9781316661239. Chapters 4 (Forward Kinematics), 6 (Inverse Kinematics), 9 (Trajectory Generation). Cambridge University Press book record: https://www.cambridge.org/core/books/modern-robotics/57C3BB1C6D5CB40320FA96E5FA3BCEC6. Accessed 18 October 2026.")
    add_reference("[R2] Northwestern University, Modern Robotics, Chapters 9.1–9.2, “Point-to-Point Trajectories (Part 2 of 2),” cubic time scaling lesson: https://modernrobotics.northwestern.edu/nu-gm-book-resource/9-1-and-9-2-point-to-point-trajectories-part-2-of-2/. Accessed 18 October 2026.")
    add_reference("[R3] Dimforge, Rapier JavaScript User Guide, “Determinism”: https://rapier.rs/docs/user_guides/javascript/determinism/. Same simulation conditions require equal parameters and body/collider/joint construction and mutation order; code inputs can still limit reproducibility. Accessed 18 October 2026.")
    add_reference("[R4] Dimforge, Rapier JavaScript User Guide, “Rigid-body type”: https://rapier.rs/docs/user_guides/javascript/rigid_body_type/. Kinematic bodies ignore contact force; application-level handling is needed. Accessed 18 October 2026.")
    add_reference("[R5] U.S. Occupational Safety and Health Administration, “Industrial Robot Systems and Industrial Robot System Safety,” OSHA Technical Manual, Section IV, Chapter 4: https://www.osha.gov/otm/section-4-safety-hazards/chapter-4. Consulted for robot system components, hazards, risk assessment and safeguards. Accessed 18 October 2026.")
    add_reference("[R6] Robotics - Individual Design Project, BCA UG Semester VII, supplied course brief, Option 01 and common minimum requirements. Source inspected at /Users/lochan/Downloads/Robotics Course Project Brief.docx; not modified.")
    add_reference("[R7] SortLab project source and records: src/engineering/config.ts, kinematics.ts, routes.ts, trajectory.ts, packagePhysics.ts, sortingController.ts; validation/results; Phase 1–7 documentation. Version audited 18 October 2026.")
    add_page(); add_heading("Appendices",1)
    add_heading("A · Reproduction and evidence files",2)
    add_body("The validation command uses the production controller and Rapier path, with the campaign label shown below. It writes artifacts to validation/results. This report build reads the checked-in records in deliverables-2/source-data.")
    code=doc.add_paragraph(); code.alignment=WD_ALIGN_PARAGRAPH.LEFT; code.paragraph_format.left_indent=Inches(.25); code.paragraph_format.space_after=Pt(5)
    rr=code.add_run("SORTLAB_CAMPAIGN_LABEL=phase7-grip-fix npm run validate:campaign"); rr.font.name="Menlo"; rr.font.size=Pt(8)
    add_body("The checked-in source data are nominal-phase7-grip-fix.json and its summary, faults-phase7-grip-fix-summary.json, numerics.json and physics.json.")
    add_heading("B · Assumptions and limitations",2)
    for text in [
      "Package dimensions, masses, shapes, friction, gravity and gripper virtual capacity are configured assumptions. The pouch is a rigid rounded-cuboid proxy.",
      "One package is active at a time. There is no camera/barcode sensing, robot dynamics, motor model, contact compliance, slip, crush model or calibrated force sensor.",
      "The package fixed joint is an ideal grasp; robot links are kinematic. Routes are sampled, and continuous swept-volume collision safety is not established.",
      "36 fault trials mix controller fault hooks, actual Rapier detach, validation-only package pose injection and explicit abort commands. They are not physical reliability trials.",
      "Student name and university registration/USN are placeholders. The brief's V3 due-date text ‘30-1 October 2026’ is ambiguous and should be confirmed with faculty.",
    ]: add_bullet(text)
    add_heading("C · Academic integrity and assistance",2)
    add_body("AI assistance was used to organize evidence and draft report text/diagrams. The student must independently verify the mathematics, source attribution and claims, replace personal-information placeholders, revise the work, and acknowledge substantive assistance under the course brief. The project is simulation evidence and is not presented as a built robot.")

    add_running_matter()
    doc.core_properties.title="SortLab — Advanced Warehouse Robotics Digital Twin — V3.0"
    doc.core_properties.subject="Robotics BCA UG Semester VII individual design report"
    doc.core_properties.author="[Student name to be supplied]"
    doc.core_properties.keywords="SCARA, kinematics, package sorting, Rapier, validation"
    doc.save(REPORT)
    print(f"Wrote {REPORT}")
    print(f"Campaign-derived chart: {per_category}")
    print(f"Nominal result: {successes}/{len(records)}; fault matches: {sum(v['matched'] for v in faults.values())}/36")


if __name__ == "__main__":
    build_report()
