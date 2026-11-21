"""
The real job run on the laptops: AI image recognition (handwritten digits, scikit-learn neural network, CPU only).

  python -m live.workload --seconds 40 --threads 2 --start 0.25 --progress-file /tmp/t1.progress

- Model: MLPClassifier (1024-1024-512-10) trained once on scikit-learn's bundled digits dataset (1,797 images,
  upscaled from 8x8 to 32x32 pixels, no download), cached in the temp folder. Each work step classifies a batch of
  256 slightly noisy images (~1.6 million multiply-adds per image).
- Total work = `seconds` of inference on this machine (throughput measured at start), so the scheduler's demo
  clock decides how long a task runs: runtime_slots x SLOT_SECONDS.
- Starts from `start` (0..1): a task moved from another laptop continues where it stopped (checkpoint).
- Writes progress (0..1) to the progress file twice a second = its checkpoint, plus images classified so far.
- Pausing the process (psutil.suspend) stops the work, so progress stops too.
- threads > 1: extra processes run the same inference to keep more CPU cores busy.
- --kind sha: the old synthetic CPU burner (no scikit-learn needed).
"""
import argparse
import hashlib
import json
import multiprocessing as mp
import os
import pickle
import tempfile
import time

BATCH = 256
SIDE = 32                                   # images are upscaled to SIDE x SIDE pixels
MODEL_PATH = os.path.join(tempfile.gettempdir(), f"dh_digits_mlp_{SIDE}.pkl")


def load_model():
    """Train once (a few seconds) and cache; returns (model, images, labels)."""
    import numpy as np
    from sklearn.datasets import load_digits
    digits = load_digits()
    f = SIDE // 8
    X = np.kron(digits.images / 16.0, np.ones((f, f))).reshape(len(digits.images), -1)   # 8x8 -> 32x32
    y = digits.target
    if os.path.exists(MODEL_PATH):
        with open(MODEL_PATH, "rb") as fh:
            return pickle.load(fh), X, y
    from sklearn.neural_network import MLPClassifier
    model = MLPClassifier(hidden_layer_sizes=(1024, 512), max_iter=60, random_state=0).fit(X, y)
    tmp = MODEL_PATH + f".{os.getpid()}"
    with open(tmp, "wb") as f:
        pickle.dump(model, f)
    os.replace(tmp, MODEL_PATH)
    return model, X, y


class DigitsJob:
    """One work step = classify BATCH noisy digit images."""
    def __init__(self, seed=0):
        import numpy as np
        self.np = np
        self.model, self.X, self.y = load_model()
        self.rng = np.random.default_rng(seed)
        self.correct = self.seen = 0

    def step(self):
        idx = self.rng.integers(0, len(self.X), BATCH)
        imgs = self.np.clip(self.X[idx] + self.rng.normal(0, 0.05, (BATCH, self.X.shape[1])), 0, 1)
        pred = self.model.predict(imgs)
        self.correct += int((pred == self.y[idx]).sum())
        self.seen += BATCH


class ShaJob:
    def __init__(self, seed=0):
        self.correct = self.seen = 0

    def step(self, n=2000):
        h = b"digitalheat"
        for _ in range(n):
            h = hashlib.sha256(h).digest()
        self.seen += 1


def make_job(kind, seed=0):
    return DigitsJob(seed) if kind == "digits" else ShaJob(seed)


def burner(kind, seed):
    """Extra thread of the job: keeps one more core busy until the job ends."""
    job = make_job(kind, seed)
    while True:
        job.step()


def write_progress(path, p, job, attempts=20):
    """Atomic write. On Windows the rename fails while the agent is reading the file: retry, never crash."""
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"progress": round(p, 4), "images": job.seen, "accuracy": round(job.correct / job.seen, 4)
                   if job.seen and job.correct else None}, f)
    for _ in range(attempts):
        try:
            os.replace(tmp, path)
            return True
        except PermissionError:
            time.sleep(0.05)
    return False


def read_progress(path):
    """Progress file -> (progress 0..1, details dict). Accepts the old plain-number format too."""
    try:
        with open(path) as f:
            txt = f.read().strip()
        if txt.startswith("{"):
            d = json.loads(txt)
            return float(d.get("progress", 0)), d
        return float(txt or 0), {}
    except (OSError, ValueError):
        return 0.0, {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, required=True, help="total runtime of the whole task")
    ap.add_argument("--threads", type=int, default=1)
    ap.add_argument("--start", type=float, default=0.0, help="progress already done (0..1)")
    ap.add_argument("--progress-file", required=True)
    ap.add_argument("--kind", default="digits", choices=["digits", "sha"])
    a = ap.parse_args()

    job = make_job(a.kind)
    # calibrate: how many work steps this machine does per second
    t0, n = time.perf_counter(), 0
    while time.perf_counter() - t0 < 0.3:
        job.step()
        n += 1
    steps_per_s = n / (time.perf_counter() - t0)
    total = max(1, int(a.seconds * steps_per_s))
    done = int(a.start * total)

    helpers = [mp.Process(target=burner, args=(a.kind, i + 1), daemon=True) for i in range(max(0, a.threads - 1))]
    for h in helpers:
        h.start()

    last = 0.0
    while done < total:
        job.step()
        done += 1
        if time.monotonic() - last > 0.5:
            write_progress(a.progress_file, done / total, job)
            last = time.monotonic()
    write_progress(a.progress_file, 1.0, job)
    for h in helpers:
        h.terminate()


if __name__ == "__main__":
    main()
