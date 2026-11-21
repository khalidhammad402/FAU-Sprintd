"""Run with:  python -m pytest -q"""
import math

import pandas as pd
import pytest

import config
from core.engine import Engine
from core.metrics import fleet_summary
from core.models import DONE, MISSED, PAUSED, RUNNING, Job, Server, Site, Task
from core.scheduler import effective_deadlines


def make_engine(demand_values, server_caps, tasks=(), tank=0.0, algorithm="greedy", filler=False):
    config.FILLER_ENABLED = filler
    times = list(pd.date_range("2025-01-13", periods=len(demand_values), freq="15min"))
    sites = {"A": Site("A", "Site A", tank_kwh=tank)}
    servers = {f"S{i}": Server(f"S{i}", "A", c) for i, c in enumerate(server_caps)}
    tasks = {t.task_id: t for t in tasks}
    jobs = {"J": Job("J", "acme", "job", "normal", 0, 999, list(tasks))}
    return Engine(times, {"A": list(demand_values)}, sites, servers, jobs, tasks, algorithm=algorithm)


def task(tid, slots=2, kw=0.5, deadline=50, prio="normal", interruptible=True, deps=(), arrival=0):
    return Task(tid, "J", tid, slots, kw, arrival, deadline, prio, interruptible, 1, list(deps))


@pytest.fixture(autouse=True)
def restore_filler():
    old = config.FILLER_ENABLED
    yield
    config.FILLER_ENABLED = old


def test_dependency_waits_for_all_parts():
    chunks = [task(f"C{i}") for i in range(3)]
    merge = task("M", slots=1, deps=["C0", "C1", "C2"])
    e = make_engine([5.0] * 10, [2.0], chunks + [merge]).run()
    assert all(c.state == DONE for c in chunks) and merge.state == DONE
    merge_start = next(s for s, kind, *_ in merge.events if kind == "started")
    assert merge_start >= max(c.finished_slot for c in chunks)


def test_critical_task_pauses_flexible_task():
    flex = task("F", slots=6, kw=1.0, prio="flexible")
    crit = task("C", slots=2, kw=1.0, prio="critical", arrival=2, deadline=10)
    e = make_engine([5.0] * 12, [1.0], [flex, crit])
    for _ in range(3):
        e.step()
    assert crit.state == RUNNING and flex.state == PAUSED
    e.run()
    assert crit.state == DONE and flex.state == DONE


def test_multi_thread_task_needs_one_big_enough_server():
    big = task("B", slots=2, kw=1.6)
    e = make_engine([5.0] * 6, [1.0, 1.0, 2.0], [big]).run()
    assert big.state == DONE and big.server_id == "S2"


def test_non_interruptible_task_is_not_paused_when_heat_is_not_needed():
    t = task("N", slots=4, kw=1.0, interruptible=False, prio="critical")
    e = make_engine([0.0] * 8, [1.0], [t], tank=config.TANK_KWH_DEFAULT).run()
    assert t.state == DONE
    assert not any(kind == "paused" for _, kind, *_ in t.events)
    assert sum(r["dumped_kwh"] for r in e.slot_rows) > 0          # tank full: its heat is dumped


def test_flexible_task_waits_while_tank_is_full():
    t = task("F", slots=2, kw=1.0, prio="flexible", deadline=40)
    demand = [0.0] * 10 + [2.0] * 20
    e = make_engine(demand, [1.0], [t], tank=config.TANK_KWH_DEFAULT).run()
    start = next(s for s, kind, *_ in t.events if kind == "started")
    assert start >= 10 and t.state == DONE


def test_missed_deadline_cascades_to_dependents():
    a = task("A", slots=5, kw=1.0, deadline=3)
    b = task("B", slots=1, deps=["A"], deadline=20)
    make_engine([5.0] * 10, [1.0], [a, b]).run()
    assert a.state == MISSED and b.state == MISSED


def test_effective_deadline_leaves_time_for_the_merge():
    c = task("C", slots=2, deadline=20)
    m = task("M", slots=3, deadline=20, deps=["C"])
    assert effective_deadlines({"C": c, "M": m})["C"] == 17


def test_offline_server_moves_its_task():
    t = task("T", slots=6, kw=1.0)
    e = make_engine([5.0] * 12, [1.0, 1.0], [t])
    e.step()
    first = t.server_id
    e.servers[first].online = False
    e.run()
    assert t.state == DONE and t.server_id != first
    assert any(kind == "migrated" for _, kind, *_ in t.events)


def test_energy_balance_every_slot():
    e = make_engine([1.0, 3.0, 0.2, 0.0, 2.5] * 10, [2.0, 1.0, 0.5], filler=True).run()
    tank = 0.0
    for r in e.slot_rows:
        assert math.isclose(r["produced_kwh"] + r["unmet_kwh"],
                            r["demand_kwh"] + r["dumped_kwh"] + (r["tank_kwh"] - tank), abs_tol=1e-6)
        tank = r["tank_kwh"]


def test_filler_covers_demand_when_capacity_allows():
    e = make_engine([1.0] * 40, [2.0, 2.0, 2.0], filler=True).run()
    assert fleet_summary(e)["coverage_pct"] > 99.9


def test_mpc_precharges_before_a_peak():
    # quiet, then a peak bigger than the servers can make: only pre-charging covers it
    # deficit in the peak = 16 x (3.0 - 0.8) = 35 kWh: more than a half-full tank holds
    demand = [0.1] * 48 + [3.0] * 16 + [0.1] * 8
    greedy = fleet_summary(make_engine(demand, [2.0, 2.0], filler=True).run())
    mpc = fleet_summary(make_engine(demand, [2.0, 2.0], filler=True, algorithm="mpc").run())
    assert mpc["unmet_kwh"] < greedy["unmet_kwh"] - 5
