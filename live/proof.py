"""
Proof for must-have 2: the same scheduler that makes the yearly balance controls a REAL process on this laptop and
pauses / resumes it on the heat signal (tank full -> pause, heat needed again -> resume).

  python -m live.proof                         # search the scenario, then run it live (~3 min)
  python -m live.proof --day 2025-10-04 --slot-seconds 3

Scenario (live demo, labelled as such in the log): the reference house (3 x 1 kW servers, 35 kWh tank, the brief's
Basel 2025 demand) on an autumn day that is warm in the daytime and needs heating in the evening. Three image-
recognition batch jobs arrive in the morning (12 h of a 1 kW server each, can be paused, deadline 72 h, so the
scheduler is free to follow the heat). Server H1-S1 is this laptop; H1-S2 and H1-S3 are simulated.
  - morning: the tank is low -> heat wanted -> the scheduler starts the jobs (the laptop starts a real process)
  - afternoon: the house needs almost nothing, the tank fills -> heat would be dumped -> the scheduler PAUSES the
    jobs (the laptop suspends the real process; it keeps its progress)
  - evening: heating starts, the tank drains -> heat wanted again -> the scheduler RESUMES them (same process)
The engine, the scheduler and the tank model are exactly the ones of the yearly balance (core/engine.py,
core/scheduler.py); only the job list is the demo's. A first pass without the laptop finds the start time and tank
level that show this within ~100 slots; the second pass runs it live over MQTT.
"""
import argparse
import json
import os
import subprocess
import sys
import time

import pandas as pd

import config

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER = "H1-S1"
JOBS, JOB_HOURS, DEADLINE_H = 3, 12, 72


def build(day, start_hour, tank):
    """Engine on the reference house at `day start_hour`, tank at `tank` kWh, with the demo jobs arriving then."""
    from sim.submission import REF, use_reference_house
    use_reference_house()
    config.FILLER_ENABLED = False                  # only the demo jobs: the heat signal is easy to follow
    from core.data import load_all, make_job
    from core.engine import Engine
    times, demand, sites, servers, _, _ = load_all(REF)
    t0 = pd.Timestamp(times[0])
    at = pd.Timestamp(day) + pd.Timedelta(hours=start_hour)
    start = int((at - t0) / pd.Timedelta(minutes=config.SLOT_MIN))
    jobs, tasks = {}, {}
    for i in range(JOBS):
        job, ts = make_job({"job_id": f"DEMO{i + 1}", "customer": "acme", "priority": "flexible",
                            "name": "Image recognition batch (live demo)", "arrival": at.isoformat(),
                            "deadline": (at + pd.Timedelta(hours=DEADLINE_H)).isoformat(),
                            "tasks": [{"task_id": f"DEMO{i + 1}-T1", "name": "classify images",
                                       "runtime_min": JOB_HOURS * 60, "power_kw": 1.0, "interruptible": True}]},
                           t0=t0)
        jobs[job.job_id] = job
        tasks.update({t.task_id: t for t in ts})
    e = Engine(times, demand, sites, servers, {}, {})
    while e.now < start:                           # fast-forward the empty house to the start
        e.step()
    e.jobs.update(jobs)
    e.tasks.update(tasks)
    next(iter(e.sites.values())).tank_kwh = tank
    return e, start


def first_pause_resume(events, task_ids):
    paused = next((x for x in events if x["kind"] == "paused" and x["task_id"] in task_ids), None)
    if paused is None:
        return None, None
    resumed = next((x for x in events if x["kind"] == "resumed" and x["task_id"] == paused["task_id"]
                    and x["slot"] > paused["slot"]), None)
    return paused, resumed


def find_scenario(day, max_slots=110):
    """Start hour and tank level where a job on SERVER is started, paused on a full tank and resumed."""
    for start_hour in (7, 8, 9, 10, 6, 11):
        for tank in (14.0, 12.0, 16.0, 10.0):
            e, start = build(day, start_hour, tank)
            ids = set()
            for _ in range(max_slots):
                e.step()
                ids |= {t.task_id for t in e.tasks.values() if t.server_id == SERVER}
                p, r = first_pause_resume(e.events, ids)
                if r is not None:
                    return {"day": day, "start_hour": start_hour, "tank_kwh": tank, "start_slot": start,
                            "pause_slot": p["slot"], "resume_slot": r["slot"], "task_id": p["task_id"],
                            "end_slot": r["slot"] + 4}
    return None


def _wait_port(port, seconds=15):
    import socket
    end = time.time() + seconds
    while time.time() < end:
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                return True
        time.sleep(0.3)
    return False


def run(out_path, day="2025-10-04", slot_seconds=3.0):
    sc = find_scenario(day)
    if sc is None:
        raise SystemExit(f"no pause/resume scenario found on {day}: try another --day")
    print(f"scenario: {json.dumps(sc)}")
    config.MQTT_HOST = "127.0.0.1"
    from core.models import PAUSED, RUNNING
    from live.master import LiveMaster
    from sim.submission import REF

    agent_log = os.path.join(ROOT, "logs", f"agent_{SERVER}.log")
    offset = os.path.getsize(agent_log) if os.path.exists(agent_log) else 0
    procs, lines = [], []

    def note(text):
        line = f"{time.strftime('%H:%M:%S')} {text}"
        print(line, flush=True)
        lines.append((time.time(), line))

    try:
        procs.append(subprocess.Popen([sys.executable, "-m", "live.broker"], cwd=ROOT,
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        if not _wait_port(config.MQTT_PORT):
            raise SystemExit("MQTT broker did not start")
        procs.append(subprocess.Popen([sys.executable, "-m", "live.agent", "--server-id", SERVER,
                                       "--host", "127.0.0.1"], cwd=ROOT,
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        m = LiveMaster(use_mqtt=True, slot_seconds=slot_seconds, data_dir=REF)
        m.engine, _ = build(day, sc["start_hour"], sc["tank_kwh"])
        e = m.engine
        sent = []
        send = m._send
        m._send = lambda server_id, payload: (sent.append((server_id, payload)), send(server_id, payload))
        end = time.time() + 20
        while not (e.servers[SERVER].live and e.servers[SERVER].online) and time.time() < end:
            time.sleep(0.2)
        if not e.servers[SERVER].live:
            raise SystemExit("agent did not come online")
        m.newly_live.clear()                       # nothing runs yet: the first tick starts the jobs itself
        cap = next(iter(e.sites.values())).tank_cap_kwh
        note(f"[master] reference house, {e.time_of(e.now)}: tank {sc['tank_kwh']:.0f} of {cap:.0f} kWh, "
             f"{JOBS} image-recognition jobs arrive ({JOB_HOURS} h each, can be paused, deadline {DEADLINE_H} h)")
        note(f"[master] agent online: {SERVER} is this laptop (H1-S2, H1-S3 simulated). "
             f"1 slot (15 min) = {slot_seconds:g} s")
        for _ in range(sc["start_slot"], sc["end_slot"] + 1):
            started = time.time()
            sent.clear()
            m.tick()
            row = e.slot_rows[-1]
            full = row["tank_kwh"] >= cap - 0.5
            want = "TANK FULL: heat not needed" if full else "heat wanted"
            on_laptop = [t for t in e.all_tasks().values() if t.server_id == SERVER and t.state in (RUNNING, PAUSED)]
            jobs = ", ".join(f"{t.task_id} {t.state} {t.progress:.0%}" for t in on_laptop) or "-"
            note(f"[heat]   {pd.Timestamp(e.time_of(e.now - 1)):%H:%M}  house needs {row['demand_kwh']:.2f} kWh/15 min, "
                 f"tank {row['tank_kwh']:5.1f} kWh, dumped {row['dumped_kwh']:.2f}  => {want:27s} | laptop: {jobs}")
            for server_id, p in sent:
                if server_id == SERVER and p["action"] != "stop":
                    note(f"[master] scheduler -> MQTT -> {SERVER}: {p['action'].upper()} {p['task_id']}")
            time.sleep(max(0.0, slot_seconds - (time.time() - started)))
        time.sleep(1.5)
        for t in list(e.tasks.values()):
            if t.server_id == SERVER and t.state in (RUNNING, PAUSED):
                send(SERVER, {"action": "stop", "task_id": t.task_id})
        time.sleep(1.5)
        note("[master] end of the demo stretch: remaining work stopped")
    finally:
        for p in reversed(procs):
            p.terminate()
    with open(agent_log, encoding="utf-8") as f:
        f.seek(offset)
        for raw in f.read().splitlines():
            ts = time.mktime(time.strptime(raw[:19], "%Y-%m-%d %H:%M:%S"))
            lines.append((ts + 0.5, f"{raw[11:19]} [agent]  {raw[20:].split('] ', 1)[-1]}"))
    lines.sort(key=lambda x: x[0])
    header = [
        "DigitalHeat - must-have 2: the scheduler pauses and resumes a REAL process on the heat signal",
        f"Generated {time.strftime('%Y-%m-%d %H:%M')} by: python -m live.proof",
        "",
        "Same Engine, scheduler and tank model as the yearly balance (core/engine.py, core/scheduler.py), on the",
        f"reference house (3 x 1 kW, 35 kWh tank, Basel 2025 demand), {day}: warm day, heating needed in the evening.",
        f"Live demo job list: {JOBS} image-recognition batches ({JOB_HOURS} h of a 1 kW server each, can be paused, "
        f"deadline {DEADLINE_H} h).",
        f"{SERVER} is this laptop: a real Python process classifies images (live/workload.py); the agent suspends and",
        "resumes it with the OS (psutil) when the scheduler says so over MQTT. H1-S2 and H1-S3 are simulated.",
        "",
        "[heat]   = the heat signal every 15-min slot (house demand, tank level, dumped heat) and what runs on the laptop",
        "[master] = the scheduler's decision for the laptop, sent over MQTT",
        "[agent]  = what the laptop did with the real process (pid, pause, resume, progress, images classified)",
        "Expected: start (heat wanted) -> PAUSE when the tank is full -> RESUME when the evening heating drains it.",
        ""]
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(header + [x[1] for x in lines]) + "\n")
    with open(os.path.splitext(out_path)[0] + "_scenario.json", "w") as f:
        json.dump(sc, f, indent=1)
    print(f"wrote {out_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "submission", "2_live_log.txt"))
    ap.add_argument("--day", default="2025-10-04")
    ap.add_argument("--slot-seconds", type=float, default=3.0)
    a = ap.parse_args()
    run(a.out, a.day, a.slot_seconds)


if __name__ == "__main__":
    main()
