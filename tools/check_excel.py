"""
Evaluate every formula of a workbook with pycel (no Excel / LibreOffice needed) and report errors.

  python -m tools.check_excel results/DigitalHeat_Jury.xlsx
"""
import sys

from openpyxl import load_workbook
from pycel import ExcelCompiler


def main(path):
    wb = load_workbook(path)
    xl = ExcelCompiler(filename=path)
    total, errors, values = 0, [], {}
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.startswith("="):
                    total += 1
                    ref = f"'{ws.title}'!{c.coordinate}"
                    try:
                        v = xl.evaluate(ref)
                    except Exception as e:                       # noqa: BLE001
                        errors.append((ref, f"exception: {e}"))
                        continue
                    if isinstance(v, str) and v.startswith("#"):
                        errors.append((ref, v))
                    values[ref] = v
    print(f"{total} formulas, {len(errors)} errors")
    for ref, e in errors[:40]:
        print("  ", ref, e)
    return values, errors


if __name__ == "__main__":
    main(sys.argv[1])
