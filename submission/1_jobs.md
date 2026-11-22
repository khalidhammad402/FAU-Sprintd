# Must-have 1: workloads

6 job types. Five are sized from open data (Alibaba GPU cluster trace 2020, MLPerf / NVIDIA L4 datasheet, AWS prices); **image recognition** we run and measure on our own laptop.

| Job type | Priority | Tasks per job | Runtime per task (min) | Energy per job (kWh) | Can be paused | Deadline (h) | Jobs per day | Jobs in 2025 | Missed |
|---|---|---|---|---|---|---|---|---|---|
| Transcribe call recordings | critical | 1 | 60 | 0.122 | no | 3 | 23.9 | 8,720 | 0 |
| Retrain recommendation (CTR) model | normal | 1 | 120 | 0.244 | yes | 12 | 12.1 | 4,428 | 0 |
| Embed document archive (BERT) | flexible | 5 | 30 / 15 | 0.137 | yes / yes | 24 | 20.0 | 7,297 | 0 |
| Fine-tune language model (NMT/BERT) | flexible | 5 | 480 / 30 | 3.965 | yes / yes | 72 | 3.1 | 1,128 | 0 |
| Hyper-parameter sweep | flexible | 8 | 15 | 0.061 | yes | 48 | 20.1 | 7,327 | 0 |
| Image recognition (measured on our laptop) | flexible | 1 | 30 | 0.5 | yes | 24 | 15.7 | 5,745 | 22 |

**Total: 34,645 customer jobs in 2025, 95 per day.** Jobs per day per type: the `jobs_per_day` in `data/reference_house/job_types.json` (ASSUMPTION, sized so a few servers per house are busy; the arrival hours follow the trace). Each day the number is drawn around that value (Poisson), so the year is realistic but reproducible (seed 7).

**Unlimited background work: yes, and we say so.** Customer jobs alone would cover only **24 %** of the heat. When the house needs heat and no customer job is waiting, the scheduler runs background work (embeddings, reranking, image, transcription sold at cloud spot prices). We assume this work is always available. In 2025: 22,928 background tasks, 44 % of the server electricity.

## The job we run on our own machine

- Job: image recognition: scikit-learn neural network (MLP, hidden layers 1024-512) on digit images upscaled to 32x32 pixels, batches of 256
- Laptop: LAPTOP-3KIFGH78, AMD64 Family 25 Model 116 Stepping 1, AuthenticAMD, 16 cores, on battery
- Measured 2026-11-22T01:44:52: **2,719,744 images in 120 s (22,664 images/s)**, accuracy 1.0000
- Power: battery discharge meter (Windows WMI BatteryStatus) = whole laptop: **17.7 W idle, 29.3 W with the job**
- Energy: **0.98 Wh** for the run = 1.29 mJ per image
- Scaling to the 1 kW reference server (ASSUMPTION): the same energy per image -> 2,785,997,951 images per server-hour. One job = 30 min of a 1 kW server = 1,392,998,975 images (17 h on our laptop). Whole-laptop power includes the screen etc., so the real server needs less: conservative.
- Can be paused: yes, the process is suspended and resumed (psutil) and keeps its progress (see 2_live_log.txt). Deadline 24 h.

Reproduce: `python -m live.measure` (laptop on battery), then `python make_reference_case.py` and `python -m sim.submission`.
