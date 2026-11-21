"""API smoke test: every endpoint group answers with the agreed shape."""
import os

os.environ["DH_MQTT"] = "0"          # no broker needed
os.environ["DH_AUTOSTART"] = "0"     # the test drives the clock itself

import pytest
from fastapi.testclient import TestClient

from api.server import P, app, master


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        for _ in range(8):
            master.tick()
        yield c


def h(c, user):
    token = c.post(f"{P}/auth/login", json={"username": user, "password": "demo"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_login_and_roles(client):
    assert client.post(f"{P}/auth/login", json={"username": "admin", "password": "x"}).status_code == 401
    assert client.get(f"{P}/admin/sites", headers=h(client, "acme")).status_code == 403
    assert client.get(f"{P}/auth/me", headers=h(client, "admin")).json()["role"] == "admin"


def test_admin_endpoints(client):
    a = h(client, "admin")
    fc = client.get(f"{P}/admin/map/sites", headers=a).json()
    assert fc["type"] == "FeatureCollection" and fc["features"]
    site = fc["features"][0]["properties"]["id"]
    assert "coveragePct" in client.get(f"{P}/admin/kpis", headers=a).json()
    assert client.get(f"{P}/admin/sites/{site}", headers=a).json()["id"] == site
    tl = client.get(f"{P}/admin/sites/{site}/timeline?resolution=1h", headers=a).json()
    assert tl and {"demandKwh", "tankKwh", "dumpedKwh"} <= set(tl[0])
    servers = client.get(f"{P}/admin/sites/{site}/servers", headers=a).json()
    assert client.get(f"{P}/admin/servers/{servers[0]['id']}/timeline", headers=a).status_code == 200
    assert "items" in client.get(f"{P}/admin/jobs", headers=a).json()
    tasks = client.get(f"{P}/admin/tasks?includeFiller=true", headers=a).json()["items"]
    assert client.get(f"{P}/admin/tasks/{tasks[0]['id']}", headers=a).json()["events"] is not None
    assert client.get(f"{P}/admin/customers", headers=a).status_code == 200
    assert client.put(f"{P}/admin/scheduler", json={"algorithm": "greedy"}, headers=a).json()["algorithm"] == "greedy"
    assert client.get(f"{P}/admin/events", headers=a).status_code == 200
    assert "electricityChfPerKwh" in client.get(f"{P}/admin/settings/pricing", headers=a).json()


def test_customer_submit_and_follow_a_job(client):
    c = h(client, "acme")
    job = client.post(f"{P}/customer/jobs", headers=c, json={
        "name": "Embed archive", "priority": "flexible", "deadlineInMin": 600,
        "tasks": [{"taskId": "A", "runtimeMin": 30, "powerKw": 0.3},
                  {"taskId": "B", "runtimeMin": 30, "powerKw": 0.3},
                  {"taskId": "M", "runtimeMin": 15, "powerKw": 0.3, "dependsOn": ["A", "B"]}]}).json()
    assert job["status"] == "queued" and len(job["taskIds"]) == 3
    for _ in range(6):
        master.tick()
    detail = client.get(f"{P}/customer/jobs/{job['id']}", headers=c).json()
    assert detail["tasks"][2]["dependsOn"] == [job["taskIds"][0], job["taskIds"][1]]
    assert client.get(f"{P}/customer/jobs/{job['id']}", headers=h(client, "globex")).status_code == 404
    assert client.get(f"{P}/customer/overview", headers=c).status_code == 200
    for path in ("usage", "invoices", "impact"):
        assert client.get(f"{P}/customer/{path}", headers=c).status_code == 200
    bad = client.post(f"{P}/customer/jobs", headers=c, json={"deadlineInMin": 60,
                      "tasks": [{"runtimeMin": 15, "powerKw": 99}]})
    assert bad.status_code == 400


def test_site_owner_sees_only_own_site(client):
    s = h(client, "h1owner")
    assert [x["id"] for x in client.get(f"{P}/site/sites", headers=s).json()] == ["H1"]
    ov = client.get(f"{P}/site/sites/H1/overview", headers=s).json()
    assert {"serverHeatSharePctToday", "tankKwh", "savingsMonthChf"} <= set(ov)
    assert client.get(f"{P}/site/sites/H1/energy?period=day", headers=s).status_code == 200
    assert client.get(f"{P}/site/sites/H1/savings", headers=s).json()["explanation"]
    assert client.get(f"{P}/site/sites/H1/servers", headers=s).status_code == 200
    assert client.get(f"{P}/site/sites/H2/overview", headers=s).status_code == 404


def test_websocket_pushes_slot_ticks(client):
    with client.websocket_connect(f"{P}/ws?token=admin") as ws:
        ws.send_json({"action": "subscribe", "channels": ["fleet"]})
        assert ws.receive_json()["type"] == "subscribed"
        master.tick()
        msg = ws.receive_json()
        assert msg["channel"] == "fleet" and msg["type"] == "clock.tick"
        assert {"slot", "currentTime", "mode"} <= set(msg["data"])
        msg = ws.receive_json()
        assert msg["type"] == "slot.tick" and {"siteId", "demandKwh", "tankKwh", "status"} <= set(msg["data"])
        ws.send_json({"action": "ping"})


def test_meta_and_health_need_no_login(client):
    assert client.get(f"{P}/health").json()["status"] == "ok"
    m = client.get(f"{P}/meta").json()
    assert m["slotMinutes"] == 15 and m["sites"] and {"periodStart", "periodEnd", "units"} <= set(m)


def test_errors_have_one_shape(client):
    r = client.get(f"{P}/admin/sites")
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"
    r = client.get(f"{P}/admin/sites/NOPE", headers=h(client, "admin"))
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"
    r = client.post(f"{P}/customer/jobs", headers=h(client, "acme"), json={"deadlineInMin": 60, "tasks": []})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    r = client.post(f"{P}/auth/login", json={"username": "admin"})
    assert r.status_code == 422


def test_new_operator_endpoints(client):
    a = h(client, "admin")
    servers = client.get(f"{P}/admin/servers", headers=a).json()
    assert servers and {"id", "siteId", "capacityKw", "status", "tasks"} <= set(servers[0])
    types = client.get(f"{P}/admin/task-types", headers=a).json()
    assert types and {"id", "jobsPerDay", "tasks", "source"} <= set(types[0])
    assert "items" in client.get(f"{P}/admin/live/agents", headers=a).json()
    assert any(x["status"] for x in client.get(f"{P}/admin/assumptions", headers=a).json())
    assert any(d["active"] for d in client.get(f"{P}/admin/datasets", headers=a).json())
    page = client.get(f"{P}/admin/tasks?limit=2", headers=a).json()
    assert len(page["items"]) == 2 and page["total"] >= 2 and page["nextCursor"] == "2"


def test_clock_control_pause_speed_jump_reset(client):
    a = h(client, "admin")
    s = client.put(f"{P}/admin/scheduler", headers=a, json={"slotSeconds": 2, "paused": True}).json()
    assert s["slotSeconds"] == 2 and s["paused"] is True and s["mode"] == "paused"
    now = s["slot"]
    r = client.post(f"{P}/admin/scheduler/jump", headers=a, json={"slot": now + 8})
    assert r.status_code == 200
    import time
    for _ in range(100):
        if client.get(f"{P}/admin/scheduler", headers=a).json()["mode"] != "jumping":
            break
        time.sleep(0.1)
    assert client.get(f"{P}/admin/scheduler", headers=a).json()["slot"] == now + 8
    assert client.post(f"{P}/admin/scheduler/jump", headers=a, json={"slot": 1}).status_code == 409
    assert client.post(f"{P}/admin/scheduler/reset", headers=a).json()["slot"] == 0
    for _ in range(3):
        master.tick()
    client.put(f"{P}/admin/scheduler", headers=a, json={"paused": False, "slotSeconds": 10})


def test_task_pause_resume_cancel(client):
    a = h(client, "admin")
    tid = client.get(f"{P}/admin/tasks?state=waiting&limit=1", headers=a).json()["items"][0]["id"]
    assert client.post(f"{P}/admin/tasks/{tid}/pause", headers=a).json()["hold"] is True
    assert client.post(f"{P}/admin/tasks/{tid}/resume", headers=a).json()["hold"] is False
    assert client.post(f"{P}/admin/tasks/{tid}/cancel", headers=a).json()["state"] == "cancelled"
    assert client.post(f"{P}/admin/tasks/{tid}/pause", headers=a).status_code == 409
    assert client.post(f"{P}/admin/tasks/{tid}/explode", headers=a).status_code == 400
