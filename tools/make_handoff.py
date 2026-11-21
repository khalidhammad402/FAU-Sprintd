"""
Build the frontend handover file from the REAL backend: every example in it is a real response.

  python -m tools.make_handoff

Writes
  docs/openapi.json          machine-readable contract (FastAPI / OpenAPI 3)
  docs/BACKEND_HANDOFF.md    docs/_guide.md (hand-written context) + generated endpoint reference with real
                             request/response examples + real WebSocket messages
Runs the API in-process (no broker, clock driven by this script), advances a few simulated hours, then calls
every endpoint. Long lists are cut to 2 items, long strings to 160 characters.
"""
import json
import os
import sys

os.environ["DH_MQTT"] = "0"
os.environ["DH_AUTOSTART"] = "0"

from fastapi.testclient import TestClient  # noqa: E402

from api.server import P, app, master  # noqa: E402

DOCS = "docs"


def trim(x, depth=0):
    if isinstance(x, list):
        out = [trim(v, depth + 1) for v in x[:2]]
        if len(x) > 2:
            out.append(f"... {len(x) - 2} more")
        return out
    if isinstance(x, dict):
        return {k: trim(v, depth + 1) for k, v in x.items()}
    if isinstance(x, float):
        return round(x, 4)
    if isinstance(x, str) and len(x) > 160:
        return x[:157] + "..."
    return x


def main():
    os.makedirs(DOCS, exist_ok=True)
    with TestClient(app) as c:
        master.running = True                       # examples show mode "live" (this script drives the clock)
        for _ in range(4 * 30):                     # 30 simulated hours so every list has content
            master.tick()
        tok = {u: {"Authorization": f"Bearer {u}"} for u in ("admin", "acme", "h1owner")}
        a, cu, so = tok["admin"], tok["acme"], tok["h1owner"]
        some_task = c.get(f"{P}/admin/tasks?state=done&limit=1", headers=a).json()["items"][0]["id"]
        waiting = c.get(f"{P}/admin/tasks?state=waiting&limit=1", headers=a).json()["items"][0]["id"]
        some_job = c.get(f"{P}/admin/jobs?limit=1", headers=a).json()["items"][0]["id"]
        server = c.get(f"{P}/admin/servers", headers=a).json()[0]["id"]
        submitted = c.post(f"{P}/customer/jobs", headers=cu, json={
            "name": "Embed archive", "priority": "flexible", "deadlineInMin": 600,
            "tasks": [{"taskId": "A", "runtimeMin": 30, "powerKw": 0.3},
                      {"taskId": "B", "runtimeMin": 30, "powerKw": 0.3},
                      {"taskId": "M", "runtimeMin": 15, "powerKw": 0.3, "dependsOn": ["A", "B"]}]}).json()
        my_job = submitted["id"]
        for _ in range(2):
            master.tick()
        notif = c.get(f"{P}/site/notifications", headers=so).json()
        alert = c.get(f"{P}/admin/events?limit=1", headers=a).json()["items"]

        calls = [  # (group, method, path, headers, body, note)
            ("meta", "GET", "/health", {}, None, "no login"),
            ("meta", "GET", "/meta", {}, None, "no login; use it to configure the app (period, sites, units)"),
            ("auth", "POST", "/auth/login", {}, {"username": "admin", "password": "demo"}, ""),
            ("auth", "GET", "/auth/me", a, None, ""),
            ("operator: fleet", "GET", "/admin/map/sites", a, None, "GeoJSON for the 3D map"),
            ("operator: fleet", "GET", "/admin/kpis", a, None, "KPI strip, fleet scope"),
            ("operator: fleet", "GET", "/admin/kpis?scope=site&siteId=H1", a, None, "KPI strip, site scope"),
            ("operator: fleet", "GET", "/admin/sites", a, None, ""),
            ("operator: fleet", "GET", "/admin/sites/H1", a, None, "site drawer header"),
            ("operator: fleet", "GET", "/admin/sites/H1/timeline?resolution=1h", a, None, "site drawer chart"),
            ("operator: fleet", "GET", "/admin/sites/H1/servers", a, None, "server rack view"),
            ("operator: fleet", "GET", "/admin/servers", a, None, "all servers (map rings)"),
            ("operator: fleet", "GET", f"/admin/servers/{server}", a, None, ""),
            ("operator: fleet", "GET", f"/admin/servers/{server}/timeline?resolution=1h", a, None, ""),
            ("operator: jobs & tasks", "GET", "/admin/jobs?limit=2", a, None, "paginated"),
            ("operator: jobs & tasks", "GET", f"/admin/jobs/{some_job}", a, None, ""),
            ("operator: jobs & tasks", "GET", "/admin/tasks?state=running&limit=2", a, None, "task explorer"),
            ("operator: jobs & tasks", "GET", f"/admin/tasks/{some_task}", a, None, "task detail + lifecycle"),
            ("operator: jobs & tasks", "POST", f"/admin/tasks/{waiting}/pause", a, None,
             "also /resume and /cancel"),
            ("operator: jobs & tasks", "GET", "/admin/task-types", a, None, "job-type catalogue with sources"),
            ("operator: jobs & tasks", "GET", "/admin/customers", a, None, ""),
            ("operator: live control", "GET", "/admin/scheduler", a, None, "clock state; poll during a jump"),
            ("operator: live control", "PUT", "/admin/scheduler", a, {"slotSeconds": 10, "paused": False}, ""),
            ("operator: live control", "POST", "/admin/scheduler/jump", a, {"to": "2021-01-03T00:00:00"},
             "fast-forward; forward only"),
            ("operator: live control", "GET", "/admin/live/agents", a, None,
             "real laptops; empty without agents (example shape: see section 'Live laptops')"),
            ("operator: results", "GET", "/admin/results?algorithm=greedy", a, None,
             "yearly balance (must-have 3); needs `python -m sim.run` once"),
            ("operator: results", "GET", "/admin/results/timeline?siteId=H1&resolution=1mo", a, None,
             "year chart per site"),
            ("operator: results", "GET", "/admin/assumptions", a, None, "assumptions register"),
            ("operator: results", "GET", "/admin/datasets", a, None, ""),
            ("operator: results", "GET", "/admin/simulations", a, None,
             "POST /admin/simulations {algorithm, datasetId} starts a run (takes ~1-2 min)"),
            ("operator: events & settings", "GET", "/admin/events?limit=2", a, None, ""),
            ("operator: events & settings", "GET", "/admin/settings/pricing", a, None, ""),
            ("customer", "POST", "/customer/jobs", cu, {
                "name": "Embed archive", "priority": "flexible", "deadlineInMin": 600,
                "tasks": [{"taskId": "A", "runtimeMin": 30, "powerKw": 0.3},
                          {"taskId": "B", "runtimeMin": 30, "powerKw": 0.3},
                          {"taskId": "M", "runtimeMin": 15, "powerKw": 0.3, "dependsOn": ["A", "B"]}]}, ""),
            ("customer", "GET", "/customer/overview", cu, None, ""),
            ("customer", "GET", "/customer/jobs?limit=2", cu, None, ""),
            ("customer", "GET", f"/customer/jobs/{my_job}", cu, None, ""),
            ("customer", "GET", f"/customer/jobs/{my_job}/tasks", cu, None, ""),
            ("customer", "GET", f"/customer/jobs/{my_job}/results", cu, None, ""),
            ("customer", "GET", "/customer/usage", cu, None, ""),
            ("customer", "GET", "/customer/invoices", cu, None, ""),
            ("customer", "GET", "/customer/impact", cu, None, ""),
            ("site owner", "GET", "/site/sites", so, None, ""),
            ("site owner", "GET", "/site/sites/H1/overview", so, None, "portal home"),
            ("site owner", "GET", "/site/sites/H1/energy?period=day", so, None, "period=day|week|month|year"),
            ("site owner", "GET", "/site/sites/H1/savings", so, None, ""),
            ("site owner", "GET", "/site/sites/H1/servers", so, None, ""),
            ("site owner", "GET", "/site/notifications", so, None, ""),
            ("errors", "GET", "/admin/sites", {}, None, "no token -> 401"),
            ("errors", "GET", "/admin/sites", cu, None, "wrong role -> 403"),
            ("errors", "GET", "/admin/sites/NOPE", a, None, "unknown id -> 404"),
            ("errors", "POST", "/customer/jobs", cu, {"deadlineInMin": 60, "tasks": []}, "invalid body -> 422"),
        ]
        examples = []
        for group, method, path, h, body, note in calls:
            r = c.request(method, P + path, headers=h, json=body)
            if path.startswith("/admin/scheduler/jump"):
                import time
                while c.get(f"{P}/admin/scheduler", headers=a).json()["mode"] == "jumping":
                    time.sleep(0.2)
            examples.append((group, method, path, body, r.status_code, trim(r.json()), note))

        # WebSocket: real messages of one tick
        ws_msgs = []
        with c.websocket_connect(f"{P}/ws?token=admin") as ws:
            ws.send_json({"action": "subscribe", "channels": ["fleet", "site:H1", f"server:{server}"]})
            ws_msgs.append(ws.receive_json())
            master.tick()
            seen = set()
            for _ in range(60):
                m = ws.receive_json()
                if m["type"] not in seen:
                    seen.add(m["type"])
                    ws_msgs.append(trim(m))
                if {"clock.tick", "slot.tick", "kpi.update", "server.status"} <= seen:
                    break
        openapi = app.openapi()
    master.engine.servers  # keep reference

    with open(os.path.join(DOCS, "openapi.json"), "w", encoding="utf-8") as f:
        json.dump(openapi, f, indent=1)

    lines = []
    lines.append("## 8. Endpoint reference (generated from the running backend)\n")
    lines.append(f"All paths start with `{P}`. Auth: `Authorization: Bearer <token>` (token = username after login).\n")
    lines.append("| Method | Path | Role | Summary |\n|---|---|---|---|")
    for path, ops in openapi["paths"].items():
        for method, op in ops.items():
            tag = (op.get("tags") or [""])[0]
            role = ("none" if tag in ("meta",) or path.endswith("/auth/login") else
                    "admin" if tag.startswith("operator") else
                    "customer (or admin)" if tag == "customer" else
                    "site_owner (or admin)" if tag == "site owner" else "any logged-in")
            lines.append(f"| {method.upper()} | `{path}` | {role} | {op.get('summary', '')} |")
    lines.append(f"\nPlus the WebSocket `{P}/ws?token=<token>` (section 6).\n")
    lines.append("## 9. Real request / response examples\n")
    lines.append("Taken from the backend after 30 simulated hours on the 5-site data. Lists are cut to 2 items "
                 "(`\"... N more\"`), numbers rounded to 4 decimals.\n")
    group = None
    for g, method, path, body, status, resp, note in examples:
        if g != group:
            lines.append(f"\n### {g}\n")
            group = g
        lines.append(f"**{method} `{P}{path}`** → `{status}`" + (f" — {note}" if note else ""))
        if body is not None:
            lines.append("\nRequest body:\n```json\n" + json.dumps(body, indent=1) + "\n```")
        lines.append("Response:\n```json\n" + json.dumps(resp, indent=1, default=str) + "\n```\n")
    lines.append("## 10. Real WebSocket messages (one slot, channels fleet + site:H1 + server)\n")
    for m in ws_msgs:
        lines.append("```json\n" + json.dumps(m, indent=1, default=str) + "\n```")

    with open(os.path.join(DOCS, "_guide.md"), encoding="utf-8") as f:
        guide = f.read()
    with open(os.path.join(DOCS, "BACKEND_HANDOFF.md"), "w", encoding="utf-8") as f:
        f.write(guide.rstrip() + "\n\n" + "\n".join(lines) + "\n")
    n_ops = sum(len(v) for v in openapi["paths"].values())
    print(f"wrote {DOCS}/BACKEND_HANDOFF.md ({len(examples)} examples, {len(ws_msgs)} websocket messages) "
          f"and {DOCS}/openapi.json ({n_ops} operations)")
    bad = [(m, p, s) for _, m, p, _, s, _, _ in examples if s >= 500]
    if bad:
        print("SERVER ERRORS:", bad)
        sys.exit(1)


if __name__ == "__main__":
    main()
