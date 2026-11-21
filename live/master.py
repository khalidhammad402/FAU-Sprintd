"""
Live master: runs the same Engine as the simulation, on a demo clock.

  python -m live.master                 # servers with an agent (laptop) run real work, the rest is simulated
  python -m live.master --no-mqtt       # everything simulated (no broker needed)

Every `slot_seconds` real seconds it runs one 15-min slot: the scheduler decides, commands go to the agents of
live servers over MQTT, progress reported by the agents moves those tasks forward. Servers without an agent are
simulated. The clock can be paused, sped up, jumped forward to a date (fast-forward without waiting) or reset.
"""
import argparse
import json
import threading
import time

import config
from core.data import load_all
from core.engine import Engine
from core.models import RUNNING


class LiveMaster:
    def __init__(self, algorithm=None, use_mqtt=True, slot_seconds=config.SLOT_SECONDS, data_dir=config.DATA_DIR):
        self.data_dir, self.algorithm = data_dir, algorithm
        self.engine = Engine(*load_all(data_dir), algorithm=algorithm)
        self.slot_seconds = slot_seconds
        self.lock = threading.RLock()          # the API reads the engine while the master writes it
        self.reports = {}                      # task_id -> progress 0..1 from agents
        self.agents = {}                       # server_id -> last status of its agent (laptop)
        self.listeners = []                    # functions called after every slot (API websocket)
        self.running = False                   # the clock thread is alive
        self.paused = False                    # clock thread alive but not advancing
        self.jump = None                       # {"target_slot", "done", "started"} while fast-forwarding
        self.newly_live = set()                # servers whose agent just came online
        self.client = None
        self.mqtt_status = "disabled"
        if use_mqtt:
            self._connect()

    # ------------------------------------------------------------ MQTT
    def _connect(self):
        import paho.mqtt.client as mqtt
        try:
            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="digitalheat-master")
            self.client.on_message = self._on_status
            self.client.connect(config.MQTT_HOST, config.MQTT_PORT, keepalive=10)
            self.client.subscribe(f"{config.TOPIC}/server/+/status", qos=1)
            self.client.loop_start()
            self.mqtt_status = f"connected to {config.MQTT_HOST}:{config.MQTT_PORT}"
            print(f"MQTT {self.mqtt_status}")
        except OSError as e:
            self.mqtt_status = f"not available ({e})"
            print(f"MQTT {self.mqtt_status}; all servers are simulated")
            self.client = None

    def _on_status(self, client, userdata, msg):
        server_id = msg.topic.split("/")[2]
        try:
            status = json.loads(msg.payload)
        except ValueError:
            return
        with self.lock:
            server = self.engine.servers.get(server_id)
            if server is None:
                return
            if not status.get("online", False):
                if server.live and server.online:
                    server.online = False
                    self.engine.alert("critical", "server_offline", f"Server {server_id} went offline",
                                      site_id=server.site_id, server_id=server_id)
                if server_id in self.agents:
                    self.agents[server_id]["online"] = False
                return
            if not server.live or not server.online:
                print(f"agent online for {server_id}")
                self.newly_live.add(server_id)
            server.live, server.online = True, True
            server.cpu_pct, server.last_seen = status.get("cpu_pct", 0.0), time.time()
            self.agents[server_id] = {"server_id": server_id, "site_id": server.site_id, "online": True,
                                      "host": status.get("host"), "cpu_pct": status.get("cpu_pct", 0.0),
                                      "last_seen": time.time(), "workload": status.get("workload"),
                                      "processes": status.get("tasks", {})}
            for tid, info in status.get("tasks", {}).items():
                self.reports[tid] = info["progress"]

    def _send(self, server_id, payload):
        self.client.publish(f"{config.TOPIC}/server/{server_id}/cmd", json.dumps(payload), qos=1)

    # ------------------------------------------------------------ one tick
    def tick(self):
        with self.lock:
            e = self.engine
            if e.finished:
                return
            # live servers silent for 3 slots count as offline (backup for the Last Will)
            for s in e.servers.values():
                if s.live and s.online and time.time() - s.last_seen > max(3 * self.slot_seconds, 5):
                    s.online = False
                    if s.server_id in self.agents:
                        self.agents[s.server_id]["online"] = False
            on_live = {t.task_id for t in e.tasks.values()
                       if t.state == RUNNING and t.server_id and e.servers[t.server_id].live}
            reports = {tid: p for tid, p in self.reports.items() if tid in on_live}
            running_live = {t.task_id: t.server_id for t in e.tasks.values() if t.task_id in on_live}
            cmds = e.step(progress_reports=reports)
            # a task stopped by the engine (missed / cancelled) must stop on its laptop too
            for tid, server_id in running_live.items():
                t = e.task(tid)
                if t and t.state in ("missed", "cancelled"):
                    cmds.append(("stop", t, server_id))
            # an agent that just connected takes over the tasks the engine already runs on its server
            for server_id in self.newly_live:
                cmds += [("run", t, server_id) for t in e.tasks.values()
                         if t.state == RUNNING and t.server_id == server_id]
            self.newly_live.clear()
            self._dispatch(cmds)
        for fn in self.listeners:
            fn(self)

    def _dispatch(self, cmds):
        if not self.client:
            return
        e = self.engine
        for action, task, server_id in cmds:
            if not server_id or not e.servers[server_id].live:
                continue
            msg = {"action": action, "task_id": task.task_id, "name": task.name}
            if action == "run":
                start = getattr(e, "cmd_progress", {}).get(task.task_id, task.progress)
                msg.update(seconds=task.runtime_slots * self.slot_seconds, threads=task.threads,
                           start=round(start, 4))
            self._send(server_id, msg)

    # ------------------------------------------------------------ clock control
    def loop(self):
        self.running = True
        while self.running and not self.engine.finished:
            started = time.time()
            if not self.paused and self.jump is None:
                self.tick()
            time.sleep(max(0.05, self.slot_seconds - (time.time() - started)))
        self.running = False

    def start(self):
        if not self.running:
            threading.Thread(target=self.loop, daemon=True).start()

    def stop(self):
        self.running = False

    def jump_to(self, target_slot):
        """Fast-forward (simulated, no waiting) until target_slot, in a background thread. Forward only."""
        target_slot = int(min(target_slot, self.engine.n_slots))
        if target_slot <= self.engine.now or self.jump is not None:
            return False
        self.jump = {"target_slot": target_slot, "from_slot": self.engine.now, "started": time.time()}

        def run():
            while True:
                with self.lock:                          # small chunks so the API stays responsive
                    for _ in range(96):
                        if self.engine.now >= target_slot or self.engine.finished:
                            break
                        self.engine.step()
                    done = self.engine.now >= target_slot or self.engine.finished
                    if done:
                        self.newly_live |= {s.server_id for s in self.engine.servers.values() if s.live}
                        self.reports.clear()
                if done:
                    break
            self.jump = None
            for fn in self.listeners:
                fn(self)
        threading.Thread(target=run, daemon=True).start()
        return True

    def reset(self):
        """Start again from the first slot with freshly loaded input files (agents stay connected)."""
        with self.lock:
            old = self.engine
            self.engine = Engine(*load_all(self.data_dir), algorithm=self.algorithm or old.algorithm)
            for sid, s in old.servers.items():               # keep what we know about connected laptops
                if sid in self.engine.servers and s.live:
                    new = self.engine.servers[sid]
                    new.live, new.online, new.cpu_pct, new.last_seen = s.live, s.online, s.cpu_pct, s.last_seen
            self.reports.clear()
            if self.client:
                for sid, s in old.servers.items():           # stop whatever the laptops were running
                    if s.live:
                        for t in old.tasks.values():
                            if t.state == RUNNING and t.server_id == sid:
                                self._send(sid, {"action": "stop", "task_id": t.task_id})

    def status(self):
        e = self.engine
        return {"mode": "jumping" if self.jump else ("paused" if self.paused else
                                                     ("live" if self.running else "stopped")),
                "slot": e.now, "slots_total": e.n_slots, "time": e.time_of(e.now),
                "slot_seconds": self.slot_seconds, "mqtt": self.mqtt_status, "jump": self.jump}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--algorithm", default=config.ALGORITHM, choices=["greedy", "mpc"])
    ap.add_argument("--no-mqtt", action="store_true")
    ap.add_argument("--slot-seconds", type=float, default=config.SLOT_SECONDS)
    a = ap.parse_args()
    m = LiveMaster(a.algorithm, use_mqtt=not a.no_mqtt, slot_seconds=a.slot_seconds)

    def show(master):
        e = master.engine
        rows = e.slot_rows[-len(e.sites):]
        running = sum(1 for t in e.tasks.values() if t.state == RUNNING)
        live = [s.server_id for s in e.servers.values() if s.live and s.online]
        print(f"{e.time_of(e.now - 1)} | running {running:3d} | live {live} | " +
              " ".join(f"{r['site_id']}: tank {r['tank_kwh']:.1f}" for r in rows))
    m.listeners.append(show)
    m.loop()
