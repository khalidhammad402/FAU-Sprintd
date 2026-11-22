"""
Measure the real job on this laptop: runtime, throughput and energy, and scale it to the 1 kW reference server.

  python -m live.measure                       # 30 s, power from the battery meter (laptop must run on battery)
  python -m live.measure --device-w 35         # plugged in: give the device power draw yourself (e.g. wall meter)

Power meter: on battery, Windows reports the battery discharge rate (WMI BatteryStatus.DischargeRate, mW) = the
whole laptop's power draw. We read it while idle and while the job runs.
Energy per image = laptop power under load / images per second (whole-device power: conservative).
Scaling to the 1 kW reference server (ASSUMPTION): the same energy per image on the server, so
  images per server-hour = 3.6e6 J / (J per image)  and a job of N images keeps a 1 kW server busy N / that hours.
Writes data/measurements/<hostname>.json.
"""
import argparse
import json
import os
import platform
import socket
import statistics
import subprocess
import threading
import time

import psutil

import config
from live.workload import BATCH, DigitsJob

PS = ("Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus | "
      "Select-Object -First 1 DischargeRate,RemainingCapacity,PowerOnline | ConvertTo-Json")


def battery():
    """{'w': power draw W, 'mwh': remaining capacity mWh} from the battery meter, or None (plugged in / no meter)."""
    if platform.system() != "Windows":
        return None
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command", PS], capture_output=True, text=True,
                             timeout=10).stdout
        d = json.loads(out)
        if d.get("PowerOnline") or not d.get("DischargeRate"):
            return None
        return {"w": d["DischargeRate"] / 1000.0, "mwh": d.get("RemainingCapacity")}
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


def sample_power(seconds, out):
    end = time.time() + seconds
    while time.time() < end:
        b = battery()
        if b:
            out.append((time.time(), b["w"], b["mwh"]))
        time.sleep(3.0)


def summarise(samples):
    """Mean of the rate readings, and power from the drop in stored energy (first -> last reading)."""
    if not samples:
        return None, None
    mean_w = statistics.mean(s[1] for s in samples)
    (t0, _, e0), (t1, _, e1) = samples[0], samples[-1]
    delta_w = (e0 - e1) / 1000 / ((t1 - t0) / 3600) if e0 and e1 and t1 > t0 and e0 > e1 else None
    return mean_w, delta_w


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=60)
    ap.add_argument("--idle-seconds", type=float, default=60)
    ap.add_argument("--device-w", type=float, default=None, help="device power under load if no battery meter")
    ap.add_argument("--job-server-min", type=float, default=30, help="size of one job in minutes of a 1 kW server")
    a = ap.parse_args()

    print("training / loading the model ...")
    job = DigitsJob(seed=1)
    print(f"measuring idle power ({a.idle_seconds:.0f} s) ...")
    idle = []
    sample_power(a.idle_seconds, idle)

    print(f"running the job for {a.seconds:.0f} s ...")
    load = []
    sampler = threading.Thread(target=sample_power, args=(a.seconds, load), daemon=True)
    proc = psutil.Process()
    proc.cpu_percent()
    psutil.cpu_percent()
    sampler.start()
    t0 = time.perf_counter()
    while time.perf_counter() - t0 < a.seconds:
        job.step()
    runtime = time.perf_counter() - t0
    cpu_job, cpu_total = proc.cpu_percent(), psutil.cpu_percent()
    sampler.join()

    images_per_s = job.seen / runtime
    idle_rate, idle_delta = summarise(idle)
    load_rate, load_delta = summarise(load)
    p_idle = idle_delta or idle_rate
    p_load = load_delta or load_rate or a.device_w
    if p_load is None:
        raise SystemExit("No battery meter (plugged in?). Unplug the laptop, or pass --device-w <W under load>.")
    meter = ("battery: drop in stored energy (WMI BatteryStatus.RemainingCapacity)" if load_delta else
             "battery discharge rate (WMI BatteryStatus.DischargeRate)" if load_rate else "given by --device-w")
    j_per_image = p_load / images_per_s
    images_per_server_h = 3.6e6 / j_per_image
    job_images = int(images_per_server_h * a.job_server_min / 60)
    res = {
        "host": socket.gethostname(), "measured_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "cpu": platform.processor(), "cores": psutil.cpu_count(),
        "job": "image recognition: scikit-learn neural network (MLP, hidden layers 1024-512) on digit images upscaled to 32x32 pixels, batches of %d" % BATCH,
        "runtime_s": round(runtime, 2), "images": job.seen, "images_per_s": round(images_per_s, 1),
        "accuracy": round(job.correct / job.seen, 4),
        "cpu_pct_job_process": cpu_job, "cpu_pct_machine": cpu_total,
        "power_meter": meter, "power_idle_w": round(p_idle, 2) if p_idle else None,
        "power_load_w": round(p_load, 2), "power_samples": len(load),
        "power_readings": {"idle_rate_w": idle_rate, "idle_from_capacity_w": idle_delta,
                           "load_rate_w": load_rate, "load_from_capacity_w": load_delta},
        "energy_j": round(p_load * runtime, 1), "energy_wh": round(p_load * runtime / 3600, 4),
        "energy_per_image_j": round(j_per_image, 5),
        "energy_per_1000_images_wh": round(j_per_image * 1000 / 3600, 4),
        "scaling": "ASSUMPTION: same energy per image on the 1 kW reference server (whole-laptop power, "
                   "so conservative); images per server-hour = 3.6e6 J / energy per image",
        "images_per_server_hour": int(images_per_server_h),
        "job_definition": {"server_minutes": a.job_server_min, "images_per_job": job_images,
                           "server_power_kw": 1.0, "laptop_seconds_per_job": round(job_images / images_per_s)},
    }
    out_dir = os.path.join(config.DATA_DIR, "measurements")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{res['host']}.json")
    with open(path, "w") as f:
        json.dump(res, f, indent=1)
    print(json.dumps(res, indent=1))
    print(f"\nsaved {path}")


if __name__ == "__main__":
    main()
