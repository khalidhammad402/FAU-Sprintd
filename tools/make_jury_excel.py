"""
Jury workbook: the university case on the brief's reference profile, simple to read, every number traceable.

  python make_university.py                      # inputs (once)
  python -m sim.university --algorithm greedy    # year simulation
  python -m sim.university --algorithm mpc
  python -m tools.make_jury_excel                # -> results/DigitalHeat_Jury.xlsx

Physical results (heat, hours, jobs) come from the scheduler's year simulation (results/university/*/jury.json).
All money is calculated with live Excel formulas from the yellow input cells on 'Business case'.
"""
import json
import os

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

import config

OUT = os.environ.get("DH_JURY_OUT", os.path.join(config.RESULTS_DIR, "DigitalHeat_Jury.xlsx"))
FONT = "Arial"
C = {"heat": "E8742A", "tank": "2F6FB0", "backup": "8C8C8C", "dumped": "F2B134", "unmet": "C0392B",
     "ink": "1F2937", "muted": "6B7280", "line": "D1D5DB", "band": "F3F4F6", "good": "D9F2E3", "bad": "F9D6D5",
     "input": "FFFF00", "dark": "111827"}
BLUE, GREEN = "0000FF", "008000"
thin = Side(style="thin", color=C["line"])
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
BOTTOM = Border(bottom=thin)

CHF = '#,##0;(#,##0);"-"'
CHF2 = '#,##0.00;(#,##0.00);"-"'
KWH = '#,##0;(#,##0);"-"'
PCT = '0.0%;(0.0%);"-"'
YRS = '0.0 "years"'


def f(size=10, bold=False, color=C["ink"], italic=False):
    return Font(name=FONT, size=size, bold=bold, color=color, italic=italic)


def title(ws, text, sub):
    ws["A1"] = text
    ws["A1"].font = f(18, True, C["dark"])
    ws["A2"] = sub
    ws["A2"].font = f(10, color=C["muted"], italic=True)
    ws.row_dimensions[1].height = 28
    ws.sheet_view.showGridLines = False


def header(ws, row, labels, col=1, fill=C["dark"]):
    for i, lab in enumerate(labels):
        c = ws.cell(row=row, column=col + i, value=lab)
        c.font = f(10, True, "FFFFFF")
        c.fill = PatternFill("solid", fgColor=fill)
        c.alignment = Alignment(vertical="center", wrap_text=True)
        c.border = BOX
    ws.row_dimensions[row].height = 22


def put(ws, ref, value, fmt=None, kind="calc", bold=False, size=10, note=None):
    """kind: input (blue on yellow), data (blue: simulation result), link (green), calc (black)."""
    c = ws[ref]
    c.value = value
    color = {"input": BLUE, "data": BLUE, "link": GREEN}.get(kind, C["ink"])
    c.font = f(size, bold, color)
    if kind == "input":
        c.fill = PatternFill("solid", fgColor=C["input"])
    if fmt:
        c.number_format = fmt
    c.border = BOX
    if note:
        c.comment = Comment(note, "DigitalHeat")
    return c


def label(ws, ref, text, bold=False, color=C["ink"], size=10, wrap=False):
    c = ws[ref]
    c.value = text
    c.font = f(size, bold, color)
    c.alignment = Alignment(vertical="center", wrap_text=wrap)
    c.border = BOX
    return c


def widths(ws, w):
    for col, width in w.items():
        ws.column_dimensions[col].width = width


def chart_style(ch):
    ch.roundedCorners = False
    if ch.legend is not None:
        ch.legend.overlay = False
        ch.legend.position = "b"
    if ch.title is not None:
        ch.title.overlay = False
    ch.x_axis.delete = False
    ch.y_axis.delete = False


def load(algo):
    with open(os.path.join(config.RESULTS_DIR, "university", algo, "jury.json")) as fh:
        return json.load(fh)


def main():
    g, m = load("greedy"), load("mpc")
    wb = Workbook()
    ov = wb.active
    ov.title = "Overview"
    yb = wb.create_sheet("Year balance")
    bc = wb.create_sheet("Business case")
    po = wb.create_sheet("When it pays off")
    al = wb.create_sheet("Algorithms")
    pl = wb.create_sheet("Product line")
    asum = wb.create_sheet("Assumptions")
    YB, BC = "'Year balance'", "'Business case'"

    # ================================================================ YEAR BALANCE (must-have 3)
    title(yb, "Year balance – university campus, one DH-Pro rack",
          "Case reference profile (Basel 2025) scaled to a 600 MWh campus · 30 × 1 kW servers · greedy scheduler · "
          "full year in 15-min steps")
    header(yb, 4, ["Simulation result (input to this sheet)", "Value", "Unit", "Note"])
    sim_rows = [
        ("Annual heat demand (space heating + hot water)", g["demand_kwh"], "kWh", "Brief's reference house profile × 19.17"),
        ("Heat delivered to the campus by the servers", g["server_heat_kwh"], "kWh", "via the buffer tank"),
        ("Heat produced by the servers (80 % recovered)", g["produced_kwh"], "kWh", ""),
        ("Heat dumped (tank full, mostly summer)", g["dumped_kwh"], "kWh", ""),
        ("Servers in the building (1 kW each)", g["servers"], "servers", "one DH-Pro rack"),
        ("Hours in the year", 8760, "h", ""),
        ("Server running hours", g["server_running_h"], "h", "a server counts as running when it has load"),
        ("Server-hours sold – university", g["sold_h_by_group"].get("university", 0), "server-h",
         "labs, R&D training, genomics"),
        ("Server-hours sold – external companies", g["sold_h_by_group"].get("external", 0), "server-h",
         "overnight batch, 12 h SLA"),
        ("Jobs finished (done + missed)", g["jobs_done"] + g["jobs_missed"], "jobs", f"{g['jobs_total']:,} jobs arrived"),
        ("Jobs that missed a deadline", g["jobs_missed"], "jobs", "deadline-first scheduling"),
        ("Campus buffer tank", g["tank_kwh"], "kWh", "35 kWh house tank scaled with demand"),
    ]
    for i, (lab, val, unit, note) in enumerate(sim_rows):
        r = 5 + i
        label(yb, f"A{r}", lab)
        put(yb, f"B{r}", val, KWH, kind="data")
        label(yb, f"C{r}", unit, color=C["muted"])
        label(yb, f"D{r}", note, color=C["muted"])
    # rows: B5 demand, B6 delivered, B7 produced, B8 dumped, B9 servers, B10 hours, B11 running, B12 uni, B13 ext,
    #       B14 finished, B15 missed, B16 tank

    header(yb, 18, ["Key figure (problem statement)", "Value", "Unit", "How it is calculated"])
    kf = [
        ("Servers per building", "=B9", "0", "servers", "one DH-Pro rack"),
        ("Share of heat demand covered by server heat", "=IF(B5>0,B6/B5,0)", PCT, "%", "heat delivered ÷ demand"),
        ("Heat from the backup heater", "=B5-B6", KWH, "kWh", "demand not covered by servers"),
        ("Heat dumped", "=B8", KWH, "kWh", "tank full"),
        ("Dumped share of produced heat", "=IF(B7>0,B8/B7,0)", PCT, "%", "dumped ÷ produced"),
        ("Utilisation", "=IF(B9>0,B11/(B9*B10),0)", PCT, "%", "running hours ÷ (servers × 8,760)"),
        ("Missed deadlines", "=IF(B14>0,B15/B14,0)", '0.00%', "% of jobs", "jobs with a missed task ÷ finished jobs"),
        ("Electricity cost", f"={BC}!B33", CHF, "CHF/yr", "see Business case"),
        ("Computing income", f"={BC}!B28+{BC}!B29", CHF, "CHF/yr", "see Business case"),
        ("Value of heat used", f"={BC}!B30", CHF, "CHF/yr", "heat × electricity price ÷ 2.5"),
        ("Break-even computing price (running costs)", f"={BC}!B45", CHF2, "CHF/server-h",
         "(electricity + maintenance + fixed − heat value) ÷ server-hours sold"),
        ("Break-even computing price (incl. hardware)", f"={BC}!B46", CHF2, "CHF/server-h", "… + depreciation"),
        ("Average computing price achieved", f"={BC}!B44", CHF2, "CHF/server-h", "compute revenue ÷ server-hours"),
    ]
    for i, (lab, formula, fmt, unit, how) in enumerate(kf):
        r = 19 + i
        label(yb, f"A{r}", lab, bold=True)
        put(yb, f"B{r}", formula, fmt, kind="link" if "Business case" in formula else "calc", bold=True)
        label(yb, f"C{r}", unit, color=C["muted"])
        label(yb, f"D{r}", how, color=C["muted"])
    # B19 servers, B20 coverage, B21 backup, B22 dumped, B23 dumped share, B24 utilisation, B25 missed,
    # B26 elec cost, B27 income, B28 heat value, B29 BE running, B30 BE full, B31 avg price
    yb["A33"] = '=IF(' + BC + '!B42>0,"Pays off: computing sells at "&TEXT(B31,"0.00")&" CHF per server-hour, above the '\
                'break-even of "&TEXT(B30,"0.00")&" (incl. hardware).","Does NOT pay off: computing sells at "&'\
                'TEXT(B31,"0.00")&" CHF per server-hour, below the break-even of "&TEXT(B30,"0.00")&" (incl. hardware).")'
    yb["A33"].font = f(11, True, C["dark"])

    header(yb, 4, ["Month", "Heat demand (MWh)", "Server heat (MWh)", "Backup heater (MWh)", "Dumped (MWh)"], col=6)
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    for i, row in enumerate(g["monthly"]):
        r = 5 + i
        label(yb, f"F{r}", months[int(row["month"]) - 1])
        put(yb, f"G{r}", row["demand_kwh"] / 1000, '#,##0.0', kind="data")
        put(yb, f"H{r}", row["server_heat_kwh"] / 1000, '#,##0.0', kind="data")
        put(yb, f"I{r}", f"=G{r}-H{r}", '#,##0.0')
        put(yb, f"J{r}", row["dumped_kwh"] / 1000, '#,##0.0', kind="data")
    label(yb, "F17", "Year", bold=True)
    for col in "GHIJ":
        put(yb, f"{col}17", f"=SUM({col}5:{col}16)", '#,##0.0', bold=True)
    ch = BarChart()
    ch.type, ch.grouping, ch.overlap = "col", "stacked", 100
    ch.title = "Where the campus heat comes from (MWh per month)"
    ch.y_axis.title = "MWh per month"
    ch.add_data(Reference(yb, min_col=8, max_col=9, min_row=4, max_row=16), titles_from_data=True)
    ch.set_categories(Reference(yb, min_col=6, min_row=5, max_row=16))
    ch.series[0].graphicalProperties.solidFill = C["heat"]
    ch.series[1].graphicalProperties.solidFill = C["backup"]
    ch.height, ch.width = 9, 17
    chart_style(ch)
    yb.add_chart(ch, "F19")
    widths(yb, {"A": 46, "B": 15, "C": 13, "D": 44, "E": 3, "F": 9, "G": 13, "H": 13, "I": 13, "J": 12})

    # ================================================================ BUSINESS CASE
    title(bc, "Business case – one DH-Pro rack at a university campus (per year)",
          "Yellow cells are inputs: change them and every sheet updates. Blue = typed-in value, green = taken from "
          "another sheet, black = calculated.")
    header(bc, 4, ["Input", "Value", "Unit", "Source / note"])
    inputs = [
        ("Servers in the rack", f"={YB}!B9", "0", "servers", "from the simulation", "link"),
        ("Hardware cost per rack (CapEx)", 692000, CHF, "CHF", "Pitch spec sheet: 42U rack incl. liquid cooling, CDU, "
                                                                "Swiss HVAC plumbing", "input"),
        ("Hardware life", 5, "0", "years", "GPU servers: 3–5 years economic life (assumption)", "input"),
        ("University co-funding of hardware", 0, PCT, "%", "pitch option: 30 % for priority access", "input"),
        ("Electricity price", 0.2601, '0.0000', "CHF/kWh", "ElCom 2026, Basel, IWB, business category C5 "
                                                          "(medium voltage), total incl. all fees", "input"),
        ("Heat-pump efficiency (COP)", 2.5, '0.0', "", "Case brief", "input"),
        ("Value of heat", "=IF(B10>0,B9/B10,0)", '0.000', "CHF/kWh", "electricity price ÷ COP (case brief)", "calc"),
        ("Idle power (share of full power)", 0.35, PCT, "%", "idle servers still draw power (assumption)", "input"),
        ("Cooling, pumps, network overhead", 0.07, PCT, "%", "on top of server power (assumption)", "input"),
        ("Compute price – university", 1.50, CHF2, "CHF/server-h", "academic rate (assumption)", "input"),
        ("Compute price – external companies", 2.50, CHF2, "CHF/server-h", "below cloud GPU prices (assumption)",
         "input"),
        ("Maintenance (share of hardware cost per year)", 0.05, PCT, "%", "assumption", "input"),
        ("Fixed costs (network, insurance, software)", 10000, CHF, "CHF/yr", "assumption", "input"),
        ("Sales & platform costs (share of compute revenue)", 0.10, PCT, "%", "assumption", "input"),
    ]
    for i, (lab, val, fmt, unit, src, kind) in enumerate(inputs):
        r = 5 + i
        label(bc, f"A{r}", lab)
        put(bc, f"B{r}", val, fmt, kind=kind)
        label(bc, f"C{r}", unit, color=C["muted"])
        label(bc, f"D{r}", src, color=C["muted"])
    # B5 servers, B6 capex, B7 life, B8 cofund, B9 elec, B10 COP, B11 heat value, B12 idle, B13 overhead,
    # B14 price uni, B15 price ext, B16 maint, B17 fixed, B18 sales

    header(bc, 20, ["From the year simulation", "Value", "Unit", ""])
    vols = [("Server-hours sold – university", f"={YB}!B12", "server-h"),
            ("Server-hours sold – external companies", f"={YB}!B13", "server-h"),
            ("Server-hours sold – total", "=B21+B22", "server-h"),
            ("Idle server-hours", f"=B5*{YB}!B10-{YB}!B11", "server-h"),
            ("Heat used by the campus", f"={YB}!B6", "kWh")]
    for i, (lab, formula, unit) in enumerate(vols):
        r = 21 + i
        label(bc, f"A{r}", lab)
        put(bc, f"B{r}", formula, KWH, kind="link" if "Year balance" in formula else "calc")
        label(bc, f"C{r}", unit, color=C["muted"])
        label(bc, f"D{r}", "")

    header(bc, 27, ["Per year", "CHF", "", "Calculation"])
    pl_rows = [
        (28, "Compute revenue – university", "=B21*B14", CHF, "server-hours × price"),
        (29, "Compute revenue – external companies", "=B22*B15", CHF, "server-hours × price"),
        (30, "Heat sold to the campus", "=B25*B11", CHF, "heat used × value of heat"),
        (31, "Total revenue", "=SUM(B28:B30)", CHF, ""),
        (32, "Electricity used (kWh)", "=(B23+B24*B12)*(1+B13)", KWH, "(running + idle × idle share) × (1 + overhead)"),
        (33, "Electricity cost", "=B32*B9", CHF, "kWh × electricity price"),
        (34, "Maintenance", "=B6*B16", CHF, "hardware cost × maintenance share"),
        (35, "Fixed costs", "=B17", CHF, ""),
        (36, "Sales & platform costs", "=B18*(B28+B29)", CHF, "share of compute revenue"),
        (37, "Total operating costs", "=B33+B34+B35+B36", CHF, ""),
        (38, "Operating profit (EBITDA)", "=B31-B37", CHF, "revenue − operating costs"),
        (39, "EBITDA margin", "=IF(B31>0,B38/B31,0)", PCT, ""),
        (40, "Hardware paid by DigitalHeat", "=B6*(1-B8)", CHF, "after co-funding"),
        (41, "Depreciation per year", "=IF(B7>0,B40/B7,0)", CHF, "hardware ÷ life"),
        (42, "Profit after depreciation", "=B38-B41", CHF, "the real yearly profit"),
        (43, "Payback", '=IF(B38>0,B40/B38,"never")', YRS, "hardware ÷ EBITDA"),
        (44, "Average compute price achieved", "=IF(B23>0,(B28+B29)/B23,0)", CHF2, "CHF per server-hour"),
        (45, "Break-even compute price – running costs", "=IF(B23>0,(B33+B34+B35-B30)/(B23*(1-B18)),0)", CHF2,
         "CHF per server-hour"),
        (46, "Break-even compute price – incl. hardware", "=IF(B23>0,(B33+B34+B35+B41-B30)/(B23*(1-B18)),0)", CHF2,
         "CHF per server-hour"),
        (47, "Heat value per server-hour sold", "=IF(B23>0,B30/B23,0)", CHF2, "used on 'When it pays off'"),
    ]
    strong = {31, 37, 38, 42, 43, 46}
    for r, lab, formula, fmt, how in pl_rows:
        label(bc, f"A{r}", lab, bold=r in strong)
        put(bc, f"B{r}", formula, fmt, bold=r in strong)
        label(bc, f"C{r}", "kWh" if r == 32 else "", color=C["muted"])
        label(bc, f"D{r}", how, color=C["muted"])
        if r in (38, 42):
            for col in "ABCD":
                bc[f"{col}{r}"].fill = PatternFill("solid", fgColor=C["band"])
    widths(bc, {"A": 46, "B": 16, "C": 13, "D": 70})

    # ================================================================ WHEN IT PAYS OFF
    title(po, "When does one rack pay off?",
          "Profit after depreciation (CHF per year) for different utilisation and average compute prices. "
          "Green = profit, red = loss. All other inputs from 'Business case'.")
    po["A4"] = "Utilisation ↓   /   average compute price (CHF per server-hour) →"
    po["A4"].font = f(10, True)
    prices = [1.00, 1.50, 2.00, 2.50, 3.00]
    utils = [0.20, 0.40, 0.60, 0.75, 0.90]
    header(po, 5, ["Utilisation"] + [None] * len(prices))
    for j, p in enumerate(prices):
        put(po, f"{chr(66 + j)}5", p, CHF2, kind="input")
    for i, u in enumerate(utils):
        r = 6 + i
        put(po, f"A{r}", u, PCT, kind="input", bold=True)
        for j in range(len(prices)):
            col = chr(66 + j)
            sold = f"({BC}!$B$5*8760*$A{r})"
            idle = f"({BC}!$B$5*8760*(1-$A{r}))"
            po[f"{col}{r}"] = (f"={sold}*{col}$5*(1-{BC}!$B$18)+{sold}*{BC}!$B$47"
                               f"-({sold}+{idle}*{BC}!$B$12)*(1+{BC}!$B$13)*{BC}!$B$9"
                               f"-{BC}!$B$6*{BC}!$B$16-{BC}!$B$17-{BC}!$B$41")
            po[f"{col}{r}"].number_format = CHF
            po[f"{col}{r}"].font = f(11, True)
            po[f"{col}{r}"].border = BOX
            po[f"{col}{r}"].alignment = Alignment(horizontal="center")
    rng = "B6:F10"
    po.conditional_formatting.add(rng, CellIsRule(operator="greaterThanOrEqual", formula=["0"],
                                                  fill=PatternFill("solid", fgColor=C["good"])))
    po.conditional_formatting.add(rng, CellIsRule(operator="lessThan", formula=["0"],
                                                  fill=PatternFill("solid", fgColor=C["bad"])))
    header(po, 13, ["Utilisation", "Break-even price incl. hardware (CHF/server-h)",
                    "Break-even price running costs only (CHF/server-h)"])
    for i, u in enumerate(utils):
        r = 14 + i
        put(po, f"A{r}", f"=A{6 + i}", PCT, bold=True)
        sold = f"({BC}!$B$5*8760*A{r})"
        idle = f"({BC}!$B$5*8760*(1-A{r}))"
        base = f"(({sold}+{idle}*{BC}!$B$12)*(1+{BC}!$B$13)*{BC}!$B$9+{BC}!$B$6*{BC}!$B$16+{BC}!$B$17-{sold}*{BC}!$B$47)"
        put(po, f"B{r}", f"=({base}+{BC}!$B$41)/({sold}*(1-{BC}!$B$18))", CHF2, bold=True)
        put(po, f"C{r}", f"={base}/({sold}*(1-{BC}!$B$18))", CHF2)
    po["A20"] = ('="Our simulated campus: "&TEXT(' + YB + '!B24,"0%")&" utilisation at "&TEXT(' + BC +
                 '!B44,"0.00")&" CHF per server-hour → profit after depreciation "&TEXT(' + BC +
                 '!B42,"#,##0")&" CHF per year."')
    po["A20"].font = f(11, True, C["dark"])
    po["A21"] = ("Read: the business is decided by utilisation and the compute price. Heat income is a bonus "
                 "(about 5 % of revenue). Heat value per server-hour is taken from the simulated year.")
    po["A21"].font = f(10, color=C["muted"], italic=True)
    widths(po, {"A": 22, "B": 26, "C": 26, "D": 16, "E": 16, "F": 16})

    # ================================================================ ALGORITHMS
    title(al, "Two scheduling algorithms, same year",
          "Greedy = fast rules every 15 min · MPC = 24 h look-ahead optimisation (linear program), then the same "
          "placement rules. Both: deadline-first.")
    header(al, 4, ["Simulation result", "Greedy", "MPC", "Unit"])
    raw = [("Heat demand", "demand_kwh", "kWh"), ("Heat delivered by servers", "server_heat_kwh", "kWh"),
           ("Heat produced", "produced_kwh", "kWh"), ("Heat dumped", "dumped_kwh", "kWh"),
           ("Server running hours", "server_running_h", "h"), ("Servers", "servers", ""),
           ("Jobs finished", None, "jobs"), ("Jobs that missed a deadline", "jobs_missed", "jobs"),
           ("Computing time for the whole year", "run_seconds", "seconds")]
    for i, (lab, key, unit) in enumerate(raw):
        r = 5 + i
        label(al, f"A{r}", lab)
        for col, d in (("B", g), ("C", m)):
            v = d["jobs_done"] + d["jobs_missed"] if key is None else d[key]
            put(al, f"{col}{r}", v, KWH, kind="data")
        label(al, f"D{r}", unit, color=C["muted"])
    # B5 demand, B6 delivered, B7 produced, B8 dumped, B9 running, B10 servers, B11 finished, B12 missed, B13 secs
    header(al, 15, ["Key figure", "Greedy", "MPC", "Better"])
    metrics = [("Share of heat demand covered", "={c}6/{c}5", PCT, "higher"),
               ("Heat dumped (% of produced)", "={c}8/{c}7", PCT, "lower"),
               ("Utilisation", "={c}9/({c}10*8760)", PCT, "higher"),
               ("Missed deadlines (% of jobs)", "={c}12/{c}11", '0.00%', "lower"),
               ("Computing time for the year (minutes)", "={c}13/60", '#,##0.0', "lower")]
    for i, (lab, tmpl, fmt, better) in enumerate(metrics):
        r = 16 + i
        label(al, f"A{r}", lab, bold=True)
        put(al, f"B{r}", tmpl.format(c="B"), fmt, bold=True)
        put(al, f"C{r}", tmpl.format(c="C"), fmt, bold=True)
        op = ">" if better == "higher" else "<"
        put(al, f"D{r}", f'=IF(ROUND(B{r},4)=ROUND(C{r},4),"equal",IF(C{r}{op}B{r},"MPC","Greedy"))', None, bold=True)
    al["A22"] = ('="On the campus both reach "&TEXT(B16,"0.0%")&" vs "&TEXT(C16,"0.0%")&" coverage and dump "&'
                 'TEXT(B8/1000,"0.0")&" vs "&TEXT(C8/1000,"0.0")&" MWh: the deadlines, not the algorithm, decide '
                 'when jobs run, and in summer the campus cannot use the heat."')
    al["A22"].font = f(10, True, C["dark"])
    al["A23"] = ("Where look-ahead helps: with flexible jobs and long deadlines (our 5-house case) MPC dumped 63 % "
                 "less heat than greedy. Greedy computes a year in seconds, MPC in minutes – both fit easily in a "
                 "15-minute step in live use.")
    al["A23"].font = f(10, color=C["muted"], italic=True)
    ch2 = BarChart()
    ch2.type = "col"
    ch2.title = "Heat dumped in the year (kWh)"
    ch2.add_data(Reference(al, min_col=2, max_col=3, min_row=8, max_row=8), from_rows=True, titles_from_data=False)
    ch2.set_categories(Reference(al, min_col=2, max_col=3, min_row=4, max_row=4))
    ch2.series[0].graphicalProperties.solidFill = C["dumped"]
    ch2.legend = None
    ch2.height, ch2.width = 7, 11
    chart_style(ch2)
    al.add_chart(ch2, "F4")
    widths(al, {"A": 40, "B": 15, "C": 15, "D": 12})

    # ================================================================ PRODUCT LINE
    title(pl, "Product line – one server standard, four sizes",
          "Same 1 kW liquid-cooled server everywhere; only the cabinet changes. Floor space includes service "
          "clearance in front and behind.")
    header(pl, 4, ["Input", "Value", "Unit", "Source / note"])
    pin = [("Hardware cost of a DH-Pro rack (30 servers)", f"={BC}!B6", CHF, "CHF", "from Business case", "link"),
           ("Cabinet base cost (CDU, network, enclosure)", 12000, CHF, "CHF", "assumption", "input"),
           ("Cost per 1 kW server slot", "=(B5-B6)/30", CHF, "CHF", "derived from the DH-Pro price", "calc"),
           ("Service clearance (front + back)", 1.8, '0.0', "m", "0.9 m each side", "input"),
           ("Utilisation for heat per year", f"={YB}!B24", PCT, "%", "simulated campus", "link"),
           ("Heat demand of the brief's reference house", 31307, KWH, "kWh/yr", "Case brief (Basel 2025)", "input")]
    for i, (lab, val, fmt, unit, src, kind) in enumerate(pin):
        r = 5 + i
        label(pl, f"A{r}", lab)
        put(pl, f"B{r}", val, fmt, kind=kind)
        label(pl, f"C{r}", unit, color=C["muted"])
        label(pl, f"D{r}", src, color=C["muted"])
    # B5 pro capex, B6 base, B7 slot, B8 clearance, B9 util, B10 ref house
    header(pl, 12, ["Product", "Servers", "Cabinet", "Width (m)", "Depth (m)", "Floor incl. clearance (m²)",
                    "Recoverable heat (kW)", "Heat per year (MWh)", "Share of a reference house",
                    "Hardware cost (CHF)", "Typical building"])
    skus = [("DH-Home", 2, "6U wall unit", 0.6, 0.6, "single house, small apartment block"),
            ("DH-Nano", 6, "12U cabinet", 0.6, 1.0, "boutique hotel, small spa, 12-unit apartment block"),
            ("DH-Mid", 15, "24U half rack", 0.8, 1.2, "medium hotel, indoor pool, bakery / dairy"),
            ("DH-Pro", 30, "42U full rack", 0.8, 1.2, "university building, hospital wing, lab")]
    for i, (name, n, cab, w, d, typ) in enumerate(skus):
        r = 13 + i
        label(pl, f"A{r}", name, bold=True)
        put(pl, f"B{r}", n, "0", kind="input")
        label(pl, f"C{r}", cab)
        put(pl, f"D{r}", w, '0.0', kind="input")
        put(pl, f"E{r}", d, '0.0', kind="input")
        put(pl, f"F{r}", f"=D{r}*(E{r}+$B$8)", '0.00')
        put(pl, f"G{r}", f"=B{r}*0.8", '0.0')
        put(pl, f"H{r}", f"=G{r}*8760*$B$9/1000", '#,##0.0')
        put(pl, f"I{r}", f"=IF($B$10>0,H{r}*1000/$B$10,0)", '0%')
        put(pl, f"J{r}", f"=$B$6+B{r}*$B$7", CHF)
        label(pl, f"K{r}", typ, color=C["muted"])
    pl["A18"] = ("Rule of thumb: servers needed = heat to cover per year ÷ (0.8 kW × 8,760 h × utilisation). "
                 "In summer only hot water is needed, so size for the baseload, not the coldest hour.")
    pl["A18"].font = f(10, True, C["dark"])
    widths(pl, {"A": 44, "B": 10, "C": 15, "D": 10, "E": 10, "F": 14, "G": 13, "H": 13, "I": 14, "J": 16, "K": 46})

    # ================================================================ ASSUMPTIONS
    title(asum, "Assumptions and sources",
          "BRIEF = given by the case · SOURCE = public data · SIMULATION = our scheduler's result · "
          "ASSUMPTION = our choice, can be changed on 'Business case'")
    header(asum, 4, ["Topic", "Value used", "Type", "Source / reasoning"])
    rows = [
        ("Heat demand profile", "Basel 2025, hourly: heating max(0, 10 kW × (20 − T) ÷ 25.6) + 12 kWh/day hot water",
         "BRIEF", "Open-Meteo archive, profile provided with the case (31,307 kWh for one house)"),
        ("University size", "600 MWh/year = reference house × 19.17", "ASSUMPTION",
         "typical campus building group (labs, dorms, sports centre)"),
        ("Server and heat recovery", "1 kW per server, 80 % of the heat recovered into water", "BRIEF", ""),
        ("Buffer tank", f"{g['tank_kwh']:,.0f} kWh", "ASSUMPTION", "35 kWh house tank scaled with demand (~19 m³ water)"),
        ("Value of heat", "electricity price ÷ 2.5", "BRIEF", "heat replaces a heat pump"),
        ("Electricity price", "0.2601 CHF/kWh", "SOURCE", "ElCom 2026, Basel, IWB, category C5 (business, medium "
                                                           "voltage): grid 8.67 + metering 0.16 + energy 9.10 + levies "
                                                           "5.79 + grid surcharge 2.30 Rp/kWh. strompreis.elcom.admin.ch"
                                                           "/municipality/2701?period=2026&category=C5"),
        ("Job mix", "student labs (weekdays 9–18, semester), PhD/R&D training (24 h deadline), genomics (48 h), "
                    "external batch (overnight, 12 h)", "ASSUMPTION", "sized for ~60 % utilisation"),
        ("Job durations", "2–4 h tasks", "SOURCE", "Alibaba GPU cluster trace 2020: p90 task 212 min, long tasks "
                                                    "hold most GPU time"),
        ("Scheduling policy", "deadline-first: a task must start when its slack is below 8 h", "SIMULATION",
         "1 h → 3.2 % jobs missed, 8 h → 0.01 %, same heat coverage"),
        ("Compute prices", "university 1.50, external 2.50 CHF per server-hour", "ASSUMPTION",
         "below cloud GPU prices (AWS L4 Frankfurt ~1.01 USD per GPU-hour, retrieved 2026-11-21)"),
        ("Hardware", "CHF 692,000 per 30-server rack, 5-year life", "ASSUMPTION", "pitch spec sheet; GPU economic life"),
        ("Idle power / overhead", "35 % / 7 %", "ASSUMPTION", "idle servers still draw power; pumps and network"),
        ("Maintenance / fixed / sales", "5 % of hardware / CHF 10,000 / 10 % of revenue", "ASSUMPTION", ""),
        ("Not included", "CO₂ certificates, grid flexibility income, building rent", "ASSUMPTION",
         "left out to stay conservative"),
        ("What the model does not show", "real heat measurement, live container migration, Kubernetes integration",
         "LIMIT", "roadmap; the prototype pauses, resumes and moves real jobs between laptops"),
    ]
    colors = {"BRIEF": "DBEAFE", "SOURCE": "E0E7FF", "SIMULATION": "DCFCE7", "ASSUMPTION": "FEF3C7", "LIMIT": "FEE2E2"}
    for i, (topic, val, typ, src) in enumerate(rows):
        r = 5 + i
        label(asum, f"A{r}", topic, bold=True)
        label(asum, f"B{r}", val, wrap=True)
        c = label(asum, f"C{r}", typ, bold=True)
        c.fill = PatternFill("solid", fgColor=colors[typ])
        label(asum, f"D{r}", src, color=C["muted"], wrap=True)
        asum.row_dimensions[r].height = 30
    widths(asum, {"A": 28, "B": 62, "C": 14, "D": 62})

    # ================================================================ OVERVIEW
    title(ov, "DigitalHeat – university campus case",
          "One DH-Pro rack (30 × 1 kW servers) heating a 600 MWh campus in Basel · the brief's 2025 reference "
          "profile · full-year simulation in 15-minute steps")
    cards = [
        ("B4", "Heat demand covered by servers", f"={YB}!B20", PCT, C["heat"],
         "share of the campus's yearly heat"),
        ("E4", "Missed deadlines", f"={YB}!B25", '0.00%', C["tank"], "jobs finished late"),
        ("H4", "Server utilisation", f"={YB}!B24", PCT, C["tank"], "running hours ÷ (30 × 8,760)"),
        ("B10", "Profit after depreciation", f"={BC}!B42", '"CHF "#,##0;"CHF -"#,##0', C["dark"], "per rack and year"),
        ("E10", "Payback of the hardware", f"={BC}!B43", YRS, C["dark"], "hardware ÷ operating profit"),
        ("H10", "Break-even compute price", f"={BC}!B46", '"CHF "0.00', C["dark"],
         "per server-hour, incl. hardware"),
    ]
    for ref, lab, formula, fmt, color, expl in cards:
        col, row = ref[0], int(ref[1:])
        col2 = chr(ord(col) + 1)
        ov.merge_cells(f"{col}{row}:{col2}{row}")
        ov.merge_cells(f"{col}{row + 1}:{col2}{row + 2}")
        ov.merge_cells(f"{col}{row + 3}:{col2}{row + 3}")
        ov[f"{col}{row}"] = lab
        ov[f"{col}{row}"].font = f(10, True, C["muted"])
        ov[f"{col}{row + 1}"] = formula
        ov[f"{col}{row + 1}"].number_format = fmt
        ov[f"{col}{row + 1}"].font = Font(name=FONT, size=26, bold=True, color=color)
        ov[f"{col}{row + 1}"].alignment = Alignment(horizontal="left", vertical="center")
        ov[f"{col}{row + 3}"] = expl
        ov[f"{col}{row + 3}"].font = f(9, color=C["muted"], italic=True)
        for rr in range(row, row + 4):
            for cc in (col, col2):
                ov[f"{cc}{rr}"].fill = PatternFill("solid", fgColor=C["band"])
    ov["B16"] = "What the jury should take away"
    ov["B16"].font = f(12, True, C["dark"])
    msgs = [
        '="1. Heat: the rack covers "&TEXT(' + YB + '!B20,"0%")&" of the campus heat; "&TEXT(' + YB +
        '!B22/1000,"0.0")&" MWh dumped ("&TEXT(' + YB + '!B23,"0.0%")&" of the heat produced, "&TEXT(IF(' + YB +
        '!J17>0,SUM(' + YB + '!J10:J13)/' + YB + '!J17,0),"0%")&" of it in June–September)."',
        '="2. Customers: "&TEXT(1-' + YB + '!B25,"0.00%")&" of jobs on time ("&' + YB + '!B15&" of "&TEXT(' + YB +
        '!B14,"#,##0")&" late) at "&TEXT(' + YB + '!B24,"0%")&" utilisation – students by day, external batch at night."',
        '="3. Money: pays off from "&TEXT(' + BC + '!B46,"0.00")&" CHF per server-hour (incl. hardware); we charge "&'
        'TEXT(' + BC + '!B44,"0.00")&" → "&TEXT(' + BC + '!B42,"#,##0")&" CHF profit per rack and year."',
        "4. Compute is the business, heat is the bonus: utilisation and price decide profit (see 'When it pays off').",
        "5. Summer is the bottleneck: the campus needs little heat from June to September → add a summer partner "
        "(pool, spa) or accept some dumping.",
    ]
    for i, msg in enumerate(msgs):
        ov[f"B{17 + i}"] = msg
        ov[f"B{17 + i}"].font = f(10, color=C["ink"])
    ch3 = BarChart()
    ch3.type, ch3.grouping, ch3.overlap = "col", "stacked", 100
    ch3.title = "Campus heat per month: servers vs backup heater (MWh)"
    ch3.add_data(Reference(yb, min_col=8, max_col=9, min_row=4, max_row=16), titles_from_data=True)
    ch3.set_categories(Reference(yb, min_col=6, min_row=5, max_row=16))
    ch3.series[0].graphicalProperties.solidFill = C["heat"]
    ch3.series[1].graphicalProperties.solidFill = C["backup"]
    ch3.height, ch3.width = 8.5, 22
    chart_style(ch3)
    ov.add_chart(ch3, "B23")
    ov["B41"] = "Sheets: Year balance (problem-statement figures) · Business case (change the yellow inputs) · " \
                "When it pays off · Algorithms · Product line · Assumptions"
    ov["B41"].font = f(9, color=C["muted"], italic=True)
    widths(ov, {"A": 2, "B": 16, "C": 16, "D": 3, "E": 16, "F": 16, "G": 3, "H": 16, "I": 16})

    for ws in wb.worksheets:
        ws.sheet_properties.tabColor = {"Overview": C["heat"], "Year balance": C["tank"],
                                        "Business case": C["dark"]}.get(ws.title, C["backup"])
        for row in ws.iter_rows():
            for c in row:
                if c.value is not None and c.font is not None and c.font.name != FONT:
                    c.font = Font(name=FONT, size=c.font.size, bold=c.font.bold, color=c.font.color,
                                  italic=c.font.italic)
    wb.calculation.fullCalcOnLoad = True
    wb.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
