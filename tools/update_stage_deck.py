"""
Correct the stage deck's numbers to the verified results and leave a comment on every changed slide.

  python -m tools.update_stage_deck "C:/Users/.../DigitalHeat – Stage Deck (1).pptx"
      -> submission/DigitalHeat_Stage_Deck_corrected.pptx   (the original is not touched)

Every number comes from a file in this repository or a cited public source; see submission/6_pitch_fact_check.md
(slide by slide) and submission/REFERENCES.md (links). Inputs read here:
  submission/key_figures.json                 reference house, final run (python -m sim.submission)
  submission/5_university_business_case.xlsx  university rack business case (tools/make_jury_excel.py)
  results/university/greedy/jury.json         university year simulation (python -m sim.university)
"""
import copy
import io
import json
import os
import re
import sys
import uuid
import zipfile
from datetime import datetime, timezone

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt                      # noqa: E402
from pptx import Presentation                        # noqa: E402
from pptx.util import Emu, Inches, Pt                # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "submission", "DigitalHeat_Stage_Deck_corrected.pptx")
NAVY, ORANGE, SLATE, GREY = "#14213D", "#C2541A", "#4A5568", "#8C96A8"

# ------------------------------------------------------------------------------------------------ numbers
K = json.load(open(os.path.join(ROOT, "submission", "key_figures.json")))
U = json.load(open(os.path.join(ROOT, "results", "university", "greedy", "jury.json")))
UNI = {  # submission/5_university_business_case.xlsx, sheet "Business case" (evaluated with pycel)
    "price_kwh": 0.2601, "heat_value": 0.10404, "rev_uni": 151755.75, "rev_ext": 154140.0, "rev_heat": 12853.45,
    "revenue": 318749.20, "electricity": 55053.92, "maintenance": 34600.0, "fixed": 10000.0, "sales": 30589.58,
    "costs": 130243.49, "ebitda": 188505.71, "capex": 692000.0, "payback": 3.671, "after_dep": 50105.71,
    "avg_price": 1.8787, "be_running": 0.5923, "be_hw": 1.5367}
CO2_OIL = 73.7 * 0.0036                              # BAFU: heating oil 73.7 t CO2/TJ -> t CO2 per MWh
heat_used_mwh = U["server_heat_kwh"] / 1000
co2_rack = heat_used_mwh * CO2_OIL                   # t CO2 per rack and year
co2_1000 = round(co2_rack * 1000, -2)                # 1,000 racks, rounded to 100 t
util = U["utilisation_pct"] / 100
k = lambda x: f"{x / 1000:.0f}k"                     # noqa: E731


def check_university():
    """Recompute the business-case figures from the simulation so the deck cannot drift from it."""
    assert abs(U["sold_h_by_group"]["university"] * 1.5 - UNI["rev_uni"]) < 1
    assert abs(U["sold_h_by_group"]["external"] * 2.5 - UNI["rev_ext"]) < 1
    assert abs(U["server_heat_kwh"] * UNI["heat_value"] - UNI["rev_heat"]) < 1
    assert abs(UNI["revenue"] - UNI["costs"] - UNI["ebitda"]) < 1
    assert abs(UNI["capex"] / UNI["ebitda"] - UNI["payback"]) < 0.01


# ------------------------------------------------------------------------------------------------ charts
def _png(fig, size):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=100, transparent=True)
    plt.close(fig)
    return buf.getvalue()


def cash_chart():
    """Cumulative cash of one DH-Pro rack: -CapEx, then + operating profit a year, up to the 5-year hardware life."""
    vals = [-UNI["capex"] + i * UNI["ebitda"] for i in range(6)]
    labels = ["Start"] + [f"Year {i}" for i in range(1, 6)]
    plt.rcParams["font.family"] = "Times New Roman"
    fig = plt.figure(figsize=(20.48, 6.15))
    ax = fig.add_axes([0.03, 0.02, 0.96, 0.96])
    lo, hi = min(vals) * 1.12, max(vals) * 1.45
    for i, v in enumerate(vals):
        c = NAVY if v < 0 else ORANGE
        ax.bar(i, v, width=0.66, color=c, zorder=2)
        txt = f"{'+' if v > 0 else '-'}{abs(v) / 1000:.0f}k"
        if v < 0:
            ax.text(i, v + abs(lo) * 0.06, txt, ha="center", va="bottom", color="#FBF6EE", fontsize=26,
                    fontweight="bold")
            ax.text(i, abs(lo) * 0.035, labels[i], ha="center", va="bottom", color=SLATE, fontsize=22)
        else:
            ax.text(i, v + hi * 0.03, txt, ha="center", va="bottom", color=NAVY, fontsize=26, fontweight="bold")
            ax.text(i, -abs(lo) * 0.035, labels[i], ha="center", va="top", color=SLATE, fontsize=22)
    x = UNI["payback"]                              # payback between year 3 and 4
    ax.axvline(x, color=ORANGE, ls=(0, (4, 3)), lw=3, zorder=1)
    ax.text(x + 0.10, lo * 0.55, f"paid back ≈ {UNI['payback']:.1f} yrs", color=ORANGE, fontsize=28,
            fontweight="bold", va="center")
    ax.axhline(0, color=GREY, lw=2, zorder=3)
    ax.set_xlim(-0.55, 5.55)
    ax.set_ylim(lo, hi)
    ax.axis("off")
    return _png(fig, (2048, 615))


def growth_chart():
    """Revenue per year for 10 / 50 / 250 / 1,000 racks at the simulated revenue of one rack."""
    racks = [10, 50, 250, 1000]
    labels = ["Year 1 · 10 racks", "Year 2 · 50", "Year 3 · 250", "Year 5 · 1,000"]
    rev = [r * UNI["revenue"] / 1e6 for r in racks]
    plt.rcParams["font.family"] = "Times New Roman"
    fig = plt.figure(figsize=(20.48, 6.89))
    ax = fig.add_axes([0.03, 0.10, 0.94, 0.90])
    for i, v in enumerate(rev):
        last = i == len(rev) - 1
        ax.bar(i, v, width=0.62, color=ORANGE if last else NAVY, zorder=2)
        txt = f"CHF ~{v:.0f}M" if last else f"CHF {v:.1f}M"
        if last:
            ax.text(i, v * 0.93, txt, ha="center", va="top", color="#FBF6EE", fontsize=30, fontweight="bold")
            ax.text(i, v * 0.80, f"~{co2_1000:,.0f} t CO₂ avoided", ha="center", va="top",
                    color="#FBF6EE", fontsize=18)
        else:
            ax.text(i, v + max(rev) * 0.025, txt, ha="center", va="bottom", color=NAVY, fontsize=30,
                    fontweight="bold")
        ax.text(i, -max(rev) * 0.05, labels[i], ha="center", va="top", color=SLATE, fontsize=22)
    ax.axhline(0, color=GREY, lw=2, zorder=3)
    ax.set_xlim(-0.6, 3.6)
    ax.set_ylim(0, max(rev) * 1.02)
    ax.axis("off")
    return _png(fig, (2048, 689))


# ------------------------------------------------------------------------------------------------ deck helpers
def shape(slide, sid):
    return next(s for s in slide.shapes if s.shape_id == sid)


def set_runs(sh, *texts):
    runs = [r for p in sh.text_frame.paragraphs for r in p.runs]
    assert len(runs) == len(texts), (sh.name, [r.text for r in runs])
    for r, t in zip(runs, texts):
        r.text = t


def set_notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def replace_picture(slide, sid, png, alt):
    pic = shape(slide, sid)
    rid = pic._element.blipFill.blip.rEmbed
    slide.part.related_part(rid)._blob = png
    pic._element.nvPicPr.cNvPr.set("descr", alt)


def set_cell(cell, text):
    tf = cell.text_frame
    runs = [r for p in tf.paragraphs for r in p.runs]
    runs[0].text = text
    for r in runs[1:]:
        r.text = ""


def job_table(slide6, slide15):
    """Replace slide 6's overlapping table with a clean one styled like the slide-15 rack table."""
    old = next(s for s in slide6.shapes if s.has_table)
    old._element.getparent().remove(old._element)
    src = next(s for s in slide15.shapes if s.has_table)
    el = copy.deepcopy(src._element)
    slide6.shapes._spTree.append(el)
    gf = next(s for s in slide6.shapes if s._element is el)
    gf.name = "Job types table"
    el.nvGraphicFramePr.cNvPr.id = max(s.shape_id for s in slide6.shapes if s._element is not el) + 1
    rows = [["Job type", "Jobs a day", "Work per job", "Can pause", "Deadline", "Numbers from"],
            ["Transcribe call recordings", "24", "1 × 60 min", "No", "3 h", "Alibaba trace, L4 GPU"],
            ["Retrain recommendation model", "12", "1 × 120 min", "Yes", "12 h", "Alibaba trace, L4 GPU"],
            ["Embed document archive", "20", "4 × 30 min + merge", "Yes", "24 h", "Alibaba trace, L4 GPU"],
            ["Fine-tune language model", "3", "4 × 480 min + eval", "Yes", "72 h", "Alibaba trace, L4 GPU"],
            ["Hyper-parameter sweep", "20", "8 × 15 min", "Yes", "48 h", "Alibaba trace, L4 GPU"],
            ["Image recognition", "16", "1 × 30 min (1 kW)", "Yes", "24 h", "measured on our laptop"]]
    tbl = gf.table
    trs = tbl._tbl.tr_lst
    body = [copy.deepcopy(trs[1]), copy.deepcopy(trs[2])]           # the plain and the shaded row style
    for tr in trs[1:]:
        tbl._tbl.remove(tr)
    for i in range(len(rows) - 1):
        tbl._tbl.append(copy.deepcopy(body[i % 2]))
    widths = [3.05, 1.25, 2.30, 1.20, 1.15, 2.59]                    # = 11.54 in, as on slide 15
    for c, w in zip(tbl.columns, widths):
        c.width = Inches(w)
    for r, row in enumerate(rows):
        tbl.rows[r].height = Inches(0.36)
        for c, txt in enumerate(row):
            set_cell(tbl.cell(r, c), txt)
            for p in tbl.cell(r, c).text_frame.paragraphs:
                for run in p.runs:
                    run.font.size = Pt(13)
    gf.left, gf.top = Inches(0.90), Inches(4.48)
    gf.width, gf.height = Inches(sum(widths)), Inches(0.36 * len(rows))


def rack_table(slide15):
    tbl = next(s for s in slide15.shapes if s.has_table).table
    set_cell(tbl.cell(0, 4), "Heat/yr, 62 % busy")
    for r, kw in ((1, 6), (2, 15), (3, 30)):
        set_cell(tbl.cell(r, 4), f"{kw * 0.8 * 8760 * util / 1000:.1f} MWh")


# ------------------------------------------------------------------------------------------------ notes
NOTES = {
    1: "SCRIPT (20 sec) Training one AI model, GPT-3, evaporated about 700,000 litres of clean water in the data "
       "centre itself (5.4 million litres including the power plants). That's why people are protesting against "
       "new data centres. [clip] Even here in Switzerland, 7 out of 10 people fear that the water use of new data "
       "centres harms the environment. (Sources: Li et al., arXiv 2304.03271 v5; AlgorithmWatch CH survey, "
       "reported by swissinfo, Oct 2025. See submission/REFERENCES.md [1][2])",
    2: "SCRIPT (10 sec) And servers get really hot. Data centres just blow that heat into the air. At the same "
       "time, 58% of Swiss households still heat with oil or gas (32% oil, 25% gas). (Source: BFS buildings and "
       "dwellings statistics 2025, press release 15.09.2026 [3])",
    4: "SCRIPT (30 sec) Why not homes? We ran the numbers. A home needs 12.5 servers of heat in January, but only "
       "0.6 in July. That's 20 times less. So no number of servers works all year. A university is different. It "
       "needs heat every single day, and a lot of it: we model a campus with 600 MWh a year, 19 times the "
       f"reference house. One DH-Pro rack of 30 servers covers about a fifth of that ({100 * heat_used_mwh / 600:.0f}% "
       f"in our year simulation), so the rack stays busy all year ({U['utilisation_pct']:.0f}% of the time). Fewer "
       "sites, more money per site. (Sources: case brief: 10 kW / 0.8 kW = 12.5, 12 kWh / 19.2 kWh = 0.6; "
       "campus size = our assumption; coverage = results/university/greedy/jury.json)",
    5: "SCRIPT (30 sec) [Simulation video plays] This is our scheduler running a whole year for the reference house "
       "in Basel, with the real 2025 weather and the real Basel electricity price (ElCom 2026, 33.25 Rp/kWh). "
       "Watch the tank. When it's full, flexible jobs wait or pause. When heat is needed, they start again. "
       f"Result: {K['coverage_pct']:.0f}% of the heat covered, {K['dumped_share_pct']:.1f}% of the server heat "
       f"dumped, {K['missed_deadlines_pct']:.2f}% of jobs late ({K['jobs_missed']} of {K['jobs_total']:,}). "
       "(Sources: case reference house, Open-Meteo 2025, ElCom H4 2026; submission/README.md)",
    6: "SCRIPT (60 sec) We built all three must-haves. One, jobs. Six job types: five sized from the Alibaba GPU "
       "cluster trace and cloud prices, and one we run ourselves: image recognition. On our laptop it classified "
       "2.7 million images in 2 minutes and used 0.98 watt-hours. We scaled that up to the 1 kW server. Five of the "
       f"six can be paused without losing work, and every type has a deadline. That's about "
       f"{K['jobs_total'] / 365:.0f} customer jobs a day. On top of that, we assume unlimited background jobs, "
       f"because customer jobs alone would only cover {K['jobs_only_coverage_pct']:.0f}% of the heat. Two, "
       "scheduler. The same code that plans the year also controls the real job on our laptop. In our log, on "
       "4 October the tank is full at 17:00: it pauses the job at 81%. At 22:00 the evening heating has drained "
       "the tank: it resumes the same process from 81%. Three, the yearly balance for the reference house. "
       f"3 servers cover {K['coverage_pct']:.0f}% of the heat. {K['dumped_share_pct']:.1f}% of the server heat is "
       f"dumped, and just {K['missed_deadlines_pct']:.2f}% of jobs miss their deadline. Break-even is "
       f"{100 * K['break_even_chf_per_server_hour']:.1f} rappen per server-hour. As long as we sell computing above "
       "that, it pays off.\n"
       "BACKUP DETAILS (if asked) Laptop: 16-core AMD, on battery so Windows reports power. 22,700 images/s. 29.3 W "
       "working, 17.7 W idle. 0.98 Wh for 2 minutes = 1.3 mJ per image. One 30-min job on the 1 kW server = "
       f"~1.4 billion images = ~17 h on our laptop. Year: {K['jobs_total']:,} customer jobs "
       f"({K['tasks_total']:,} tasks), {K['filler_tasks']:,} background tasks, {K['pauses']} pauses, "
       f"{K['migrations']:,} task moves. Balance: heat need {K['demand_kwh']:,.0f} kWh, tank 35 kWh. Covered "
       f"{K['delivered_kwh']:,.0f} kWh ({K['coverage_pct']:.1f}%). Dumped {K['dumped_kwh']:,.0f} kWh. Busy "
       f"{K['utilisation_pct']:.1f}%. Missed {K['jobs_missed']} of {K['jobs_total']:,} jobs. Electricity "
       f"{K['electricity_kwh']:,.0f} kWh = CHF {K['electricity_cost_chf']:,.0f} at 33.25 Rp. Heat value "
       f"CHF {K['heat_value_chf']:,.0f}. Income CHF {K['compute_income_chf']:,.0f} "
       f"(CHF {K['avg_price']:.2f} per server-hour). Break-even {100 * K['break_even_chf_per_server_hour']:.1f} Rp. "
       "(Files: submission/1_jobs.md, 2_live_log.txt, 3_balance.xlsx)",
    7: "SCRIPT (30 sec) This is the brain. Every 15 minutes it does three things. Look: how full is each tank, how "
       "much heat does the building need right now, and when is each job due. Plan: urgent and critical jobs go "
       "first; flexible jobs only start where their heat is useful; background work tops the tank up to half full. "
       "Act: start a job, pause it when the tank is full, or move it to another server. So we don't waste heat, and "
       "we don't miss deadlines. (Code: core/scheduler.py. An optimiser (linear program, rolling 24 h) is also "
       "built in; on the university case it gave the same result as these rules.)",
    9: "SCRIPT (30 sec) One university, one DH-Pro rack: 30 servers of 1 kW. We simulated a whole year: the campus "
       f"uses its servers {U['utilisation_pct']:.0f}% of the time. The university buys "
       f"{U['sold_h_by_group']['university']:,.0f} server-hours at CHF 1.50: CHF {k(UNI['rev_uni'])}. Swiss "
       f"companies buy {U['sold_h_by_group']['external']:,.0f} at CHF 2.50: CHF {k(UNI['rev_ext'])}. The campus "
       f"uses {heat_used_mwh:,.1f} MWh of our heat, worth CHF {UNI['heat_value']:.3f} per kWh: CHF "
       f"{k(UNI['rev_heat'])}. Revenue CHF {k(UNI['revenue'])}. Minus all running costs, CHF {k(UNI['costs'])} "
       f"(electricity CHF {k(UNI['electricity'])} at the ElCom business price of 26.01 Rp/kWh, maintenance "
       f"CHF {k(UNI['maintenance'])}, network and insurance CHF {k(UNI['fixed'])}, sales CHF {k(UNI['sales'])}), "
       f"that leaves CHF {k(UNI['ebitda'])} a year. (Source: submission/5_university_business_case.xlsx; prices "
       "per server-hour are our assumption, below the AWS L4 on-demand price.)",
    11: "SCRIPT (20 sec) We pay for the rack and the installation ourselves: 692,000 francs. Every year we get back "
        f"about {k(UNI['ebitda'])} after all running costs. So after about {UNI['payback']:.1f} years, the rack has "
        "paid for itself, well inside its 5-year life. For the reference house, the case's own formula gives a "
        f"break-even of {100 * K['break_even_chf_per_server_hour']:.1f} rappen per server-hour. For the university "
        f"rack, including the hardware, break-even is CHF {UNI['be_hw']:.2f} per server-hour, and we sell at "
        f"CHF {UNI['avg_price']:.2f} on average. (Sources: rack + install = team estimate; "
        "submission/5_university_business_case.xlsx; case formula with ElCom 2026 prices)",
    12: "SCRIPT (15 sec) And the market keeps growing. Swiss data centres used 2.1 terawatt-hours in 2024, 3.6% of "
        "all Swiss electricity, and 2.5 to 3.2 TWh are expected by 2030. Our plan: 10 racks in year one, 1,000 by "
        f"year five. At the simulated revenue of one rack, that's about {UNI['revenue'] * 1000 / 1e6:.0f} million "
        f"francs a year, and about {co2_1000:,.0f} tonnes of CO2 avoided if our heat replaces oil heating. "
        "(Sources: SFOE study, May 2026; BAFU CO2 factor for heating oil 73.7 t/TJ; plan = our model)",
    15: "Backup slide for questions. We sell three standard rack sizes, filled with 1U liquid-cooled servers. Cool "
        "water goes in, 60 degree water comes out to the host's tank. The smallest fits a day spa, the middle one an "
        "indoor pool or bakery, the biggest a university or hospital, and even that needs only 2.4 square metres. "
        f"Heat per year = power x 80% recovered x 8,760 h x {100 * util:.0f}% busy, the utilisation of our "
        "simulated university rack. (Sizes and floor space incl. service clearance: team design assumption)",
}

# ------------------------------------------------------------------------------------------------ comments
COMMENTS = {
    1: "FACT CHECK (notes): '700,000 litres' is GPT-3's ON-SITE cooling water; 5.4 million litres incl. power "
       "generation (Li et al., arXiv 2304.03271 v5). '7 out of 10 worried' made precise: 7 in 10 fear the water "
       "use of new data centres harms the environment (AlgorithmWatch CH survey, swissinfo Oct 2025). "
       "Details: submission/6_pitch_fact_check.md, refs [1][2].",
    2: "FACT CHECK (notes): 58% confirmed and made precise: 58% of Swiss HOUSEHOLDS heated with oil or gas in 2025 "
       "(32% oil, 25% gas). By buildings it is 50%. Source: BFS press release 15.09.2026, ref [3].",
    4: "FACT CHECK: 12.5, 0.6 and 20× are from the case brief (10 kW / 0.8 kW; 12 kWh / 19.2 kWh). Notes "
       f"corrected: one DH-Pro rack covers {100 * heat_used_mwh / 600:.0f}% of the campus heat in our year "
       "simulation (was 'about a quarter'). Absolute demand for the comment above: campus 600 MWh/yr = 19x the "
       "reference house (our assumption). Source: results/university/greedy/jury.json.",
    5: f"CORRECTED: heat wasted 2.5% -> {K['dumped_share_pct']:.1f}% ({K['dumped_kwh']:,.0f} of "
       f"{K['delivered_kwh'] + K['dumped_kwh']:,.0f} kWh server heat). 2.5% came from an older run (5 job types, "
       f"0.33 CHF/kWh). 46% ({K['coverage_pct']:.1f}%) and 0.06% ({K['jobs_missed']} of {K['jobs_total']:,} jobs) "
       "confirmed. Source: submission/README.md + key_figures.json (python -m sim.submission).",
    6: "REBUILT + CORRECTED: the job table overlapped the cards; it now sits below them with a header row. Added "
       "the job type we actually measured (image recognition, 30 min of a 1 kW server, 24 h deadline); the sweep "
       "deadline was blank -> 48 h. '5 types' -> '6 types'. Break-even 23 -> "
       f"{100 * K['break_even_chf_per_server_hour']:.1f} Rp. Notes updated to the final run (job counts, 24% from "
       "customer jobs, live pause/resume). Sources: submission/1_jobs.md, 2_live_log.txt, 3_balance.xlsx.",
    7: "FACT CHECK (notes): the scheduler decides every 15-minute slot, not every 60 s; the yearly results use the "
       "priority rules, not MILP (the optional optimiser is a linear program); it pauses when the tank is full "
       "(heat would be dumped), not at 90%; it does not use a weather forecast. Source: core/scheduler.py, config.py.",
    9: "CORRECTED to the simulated university year + ElCom business price 26.01 Rp/kWh (C5, Basel 2026). The old "
       "numbers assumed 75% busy at CHF 1.08/h; the simulation gives 62% busy: 101,171 h x CHF 1.50 = 152k "
       "(university), 61,656 h x CHF 2.50 = 154k (companies), heat 123.5 MWh x 0.104 = 13k. Revenue 319k - running "
       "costs 130k (electricity 55k, maintenance 35k, fixed 10k, sales 31k) = CHF 189k a year. Source: "
       "submission/5_university_business_case.xlsx, refs [4][5].",
    11: f"CORRECTED: 692k ÷ 189k = {UNI['payback']:.1f} years (was 180k -> 3.9). Chart redrawn from the business "
        "case: -692k, then +189k a year, shown up to year 5 (hardware life). Notes: 23 Rp is the reference HOUSE "
        f"break-even; for the university rack, break-even incl. hardware is CHF {UNI['be_hw']:.2f}/server-hour and "
        f"we sell at CHF {UNI['avg_price']:.2f}. Source: 5_university_business_case.xlsx rows 38, 43-46.",
    12: f"CORRECTED: revenue per rack CHF {UNI['revenue'] / 1000:.0f}k (simulation) instead of 229k -> 10 racks "
        f"{10 * UNI['revenue'] / 1e6:.1f}M, 50 {50 * UNI['revenue'] / 1e6:.1f}M, 250 {250 * UNI['revenue'] / 1e6:.1f}M, "
        f"1,000 {1000 * UNI['revenue'] / 1e6:.0f}M. CO2: {heat_used_mwh:.1f} MWh heat used per rack x 0.265 t/MWh "
        f"(heating oil, BAFU 73.7 t/TJ) = {co2_rack:.1f} t per rack -> ~{co2_1000:,.0f} t (was 42,000 t from "
        "heat produced, not used). 2.1 TWh: SFOE study published May 2026 (not 2025). Refs [6][7].",
    15: f"CORRECTED: heat per year at the simulated {100 * util:.0f}% utilisation (was 75% assumed): power x 0.8 x "
        "8,760 h x 0.62. DH-Pro 130.3 MWh = the simulation (results/university/greedy/jury.json, produced "
        "130,261 kWh). Sizes and floor space are team design assumptions (floor space incl. service clearance).",
}
AUTHOR_ID = "{6D3A2F10-5B7C-4E2A-9C1D-0F1E2D3C4B5A}"


def add_comments(path):
    """Add one modern PowerPoint comment per changed slide (same format as the deck's existing comments)."""
    zin = zipfile.ZipFile(path)
    files = {n: zin.read(n) for n in zin.namelist()}
    zin.close()
    pres = files["ppt/presentation.xml"].decode("utf-8")
    prels = files["ppt/_rels/presentation.xml.rels"].decode("utf-8")
    rid_target = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="(slides/slide\d+\.xml)"', prels))
    rid_target.update({a: b for b, a in re.findall(r'Target="(slides/slide\d+\.xml)"[^>]*Id="(rId\d+)"', prels)})
    order = re.findall(r'<p:sldId id="(\d+)" r:id="(rId\d+)"/>', pres)
    authors = files["ppt/authors.xml"].decode("utf-8")
    if AUTHOR_ID not in authors:
        authors = authors.replace("</p188:authorLst>", f'<p188:author id="{AUTHOR_ID}" name="DigitalHeat fact check" '
                                  'initials="FC" userId="DigitalHeat fact check" providerId="None"/></p188:authorLst>')
        files["ppt/authors.xml"] = authors.encode("utf-8")
    ct = files["[Content_Types].xml"].decode("utf-8")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000")
    for pos, text in COMMENTS.items():
        sld_id, rid = order[pos - 1]
        slide = "ppt/" + rid_target[rid]
        rels_name = slide.replace("slides/", "slides/_rels/") + ".rels"
        rels = files[rels_name].decode("utf-8")
        m = re.search(r'Target="\.\./comments/(modernComment_[^"]+\.xml)"', rels)
        cm = (f'<p188:cm id="{{{str(uuid.uuid4()).upper()}}}" authorId="{AUTHOR_ID}" created="{now}">'
              '<pc:sldMkLst xmlns:pc="http://schemas.microsoft.com/office/powerpoint/2013/main/command"><pc:docMk/>'
              f'<pc:sldMk cId="0" sldId="{sld_id}"/></pc:sldMkLst><p188:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>'
              f'<a:rPr lang="en-US"/><a:t>{_esc(text)}</a:t></a:r></a:p></p188:txBody></p188:cm>')
        if m:
            name = "ppt/comments/" + m.group(1)
            files[name] = files[name].decode("utf-8").replace("</p188:cmLst>", cm + "</p188:cmLst>").encode("utf-8")
        else:
            fname = f"modernComment_{int(sld_id):X}_{uuid.uuid4().hex[:8].upper()}.xml"
            files["ppt/comments/" + fname] = (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p188:cmLst '
                'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
                f'xmlns:p188="http://schemas.microsoft.com/office/powerpoint/2018/8/main">{cm}</p188:cmLst>'
            ).encode("utf-8")
            ids = [int(x) for x in re.findall(r'Id="rId(\d+)"', rels)]
            rels = rels.replace("</Relationships>", f'<Relationship Id="rId{max(ids) + 1}" '
                                'Type="http://schemas.microsoft.com/office/2018/10/relationships/comments" '
                                f'Target="../comments/{fname}"/></Relationships>')
            files[rels_name] = rels.encode("utf-8")
            ct = ct.replace("</Types>", f'<Override PartName="/ppt/comments/{fname}" '
                            'ContentType="application/vnd.ms-powerpoint.comments+xml"/></Types>')
    files["[Content_Types].xml"] = ct.encode("utf-8")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", files.pop("[Content_Types].xml"))
        for n, b in files.items():
            z.writestr(n, b)


def _esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


# ------------------------------------------------------------------------------------------------ main
def main(src):
    check_university()
    p = Presentation(src)
    s = {i: sl for i, sl in enumerate(p.slides, 1)}
    # slide 5: our solution
    set_runs(shape(s[5], 8), f"{K['dumped_share_pct']:.1f}%")
    # slide 6: 3 / 3
    set_runs(shape(s[6], 6), "6 types · 1 measured by us")
    set_runs(shape(s[6], 14), f"46% heat · 0.06% late · {100 * K['break_even_chf_per_server_hour']:.1f} Rp break-even")
    job_table(s[6], s[15])
    # slide 9: 1 university
    set_runs(shape(s[9], 5), k(UNI["rev_uni"]))
    set_runs(shape(s[9], 8), k(UNI["rev_ext"]))
    set_runs(shape(s[9], 11), k(UNI["rev_heat"]))
    set_runs(shape(s[9], 12), f"CHF {k(UNI['revenue'])} revenue − CHF {k(UNI['costs'])} running costs")
    set_runs(shape(s[9], 13), "= ", f"CHF {k(UNI['ebitda'])}", " a year")
    # slide 11: our money back
    set_runs(shape(s[11], 4), f"692k ÷ {k(UNI['ebitda'])} = ", f"{UNI['payback']:.1f} years")
    replace_picture(s[11], 3, cash_chart(),
                    f"Cash over time: minus 692k at start, plus {k(UNI['ebitda'])} each year, positive after about "
                    f"{UNI['payback']:.1f} years")
    # slide 12: 1,000 racks
    replace_picture(s[12], 3, growth_chart(),
                    f"Plan: 10, 50, 250 and 1,000 racks; CHF {UNI['revenue'] * 1000 / 1e6:.0f}M a year at 1,000 racks")
    # slide 15: rack sizes
    rack_table(s[15])
    for pos, text in NOTES.items():
        set_notes(s[pos], text)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    p.save(OUT)
    add_comments(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main(sys.argv[1])
