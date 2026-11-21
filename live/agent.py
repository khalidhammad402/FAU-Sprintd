"""
Runs on each laptop. One agent = one server of the fleet.

  python -m live.agent --server-id H1-S1 --host 192.168.1.20          # host = laptop running the broker + API
  python -m live.agent --server-id H1-S1 --host 192.168.1.20 --kind sha   # synthetic CPU job instead of AI

Listens on  dh/server/<id>/cmd     {"action": "run"|"pause"|"resume"|"stop", "task_id": ..., ...}
Publishes   dh/server/<id>/status  every second: online, host, cpu %, progress/state/images of each task
If the laptop disconnects, the broker publishes {"online": false} for it (MQTT Last Will).
Every command and state change is written to logs/agent_<server-id>.log (proof that the scheduler controls
real processes: started, paused, resumed, stopped, done).
"""
import argparse
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time

import paho.mqtt.client as mqtt
import psutil

import config
from live.workload import read_progress

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Agent:
    def __init__(self, server_id, host, port, kind="digits"):
        self.server_id, self.kind = server_id, kind
        self.jobs = {}          # task_id -> {"proc", "file", "state", "name", "since"}
        self.lock = threading.Lock()
        self.cmd_topic = f"{config.TOPIC}/server/{server_id}/cmd"
        self.status_topic = f"{config.TOPIC}/server/{server_id}/status"
        os.makedirs(os.path.join(ROOT, "logs"), exist_ok=True)
        self.log_path = os.path.join(ROOT, "logs", f"agent_{server_id}.log")
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"agent-{server_id}")
        self.client.will_set(self.status_topic, json.dumps({"online": False}), qos=1, retain=True)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.connect(host, port, keepalive=5)

    def log(self, text):
        line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} [{self.server_id}] {text}"
        print(line, flush=True)
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")

    # ------------------------------------------------------------ MQTT
    def on_connect(self, client, userdata, flags, reason, props=None):
        client.subscribe(self.cmd_topic, qos=1)
        self.log(f"connected as {socket.gethostname()}, waiting for commands on {self.cmd_topic}")

    def on_message(self, client, userdata, msg):
        try:
            cmd = json.loads(msg.payload)
            action, tid = cmd["action"], cmd["task_id"]
        except (ValueError, KeyError):
            return
        with self.lock:
            if action == "run":
                self.run(tid, cmd["seconds"], cmd.get("threads", 1), cmd.get("start", 0.0), cmd.get("name", tid))
            elif action == "pause":
                self.signal(tid, "suspend", "paused")
            elif action == "resume":
                self.signal(tid, "resume", "running")
            elif action == "stop":
                self.signal(tid, "kill", "stopped")

    # ------------------------------------------------------------ processes
    def run(self, tid, seconds, threads, start, name):
        self.signal(tid, "kill", "stopped", quiet=True)      # restart cleanly if it ran here before
        pfile = os.path.join(tempfile.gettempdir(), f"dh_{self.server_id}_{tid}.progress")
        with open(pfile, "w") as f:
            json.dump({"progress": start}, f)
        proc = subprocess.Popen([sys.executable, "-m", "live.workload", "--seconds", str(seconds),
                                 "--threads", str(threads), "--start", str(start), "--progress-file", pfile,
                                 "--kind", self.kind], cwd=ROOT)
        self.jobs[tid] = {"proc": proc, "file": pfile, "state": "running", "name": name, "since": time.time()}
        self.log(f"run    {tid} ({name}) pid {proc.pid}, {seconds:.0f} s of work, from {start:.0%}")

    def signal(self, tid, how, new_state, quiet=False):
        job = self.jobs.get(tid)
        if not job or job["proc"].poll() is not None:
            return
        try:
            p = psutil.Process(job["proc"].pid)
            for proc in [p] + p.children(recursive=True):       # the job and its extra threads
                getattr(proc, how)()
        except psutil.NoSuchProcess:
            pass
        job["state"], job["since"] = new_state, time.time()
        if not quiet:
            word = {"suspend": "pause ", "resume": "resume", "kill": "stop  "}[how]
            self.log(f"{word} {tid} ({job['name']}) at {read_progress(job['file'])[0]:.0%}")

    # ------------------------------------------------------------ main loop
    def loop(self):
        self.client.loop_start()
        host = socket.gethostname()
        while True:
            tasks = {}
            with self.lock:
                for tid, job in list(self.jobs.items()):
                    p, info = read_progress(job["file"])
                    if job["proc"].poll() is not None and job["state"] in ("running", "paused"):
                        job["state"], job["since"] = "done", time.time()
                        self.log(f"done   {tid} ({job['name']}), {info.get('images', 0):,} images classified")
                    if job["state"] in ("done", "stopped") and time.time() - job["since"] > 30:
                        del self.jobs[tid]                       # report finished tasks for 30 s, then forget
                        continue
                    tasks[tid] = {"progress": p, "state": job["state"], "name": job["name"],
                                  "images": info.get("images"), "accuracy": info.get("accuracy"),
                                  "pid": job["proc"].pid}
            status = {"online": True, "host": host, "workload": self.kind, "cpu_pct": psutil.cpu_percent(),
                      "tasks": tasks, "time": time.time()}
            self.client.publish(self.status_topic, json.dumps(status), qos=0, retain=True)
            time.sleep(1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--server-id", required=True, help="must match a server_id in data/servers.csv")
    ap.add_argument("--host", default=config.MQTT_HOST, help="IP of the laptop running the broker")
    ap.add_argument("--port", type=int, default=config.MQTT_PORT)
    ap.add_argument("--kind", default="digits", choices=["digits", "sha"], help="real AI job or synthetic CPU job")
    a = ap.parse_args()
    Agent(a.server_id, a.host, a.port, a.kind).loop()
