# References

Numbered sources for the stage deck (`DigitalHeat_Stage_Deck_corrected.pptx`) and the submission files. Links were
checked on 22 November 2026. Numbers in square brackets match the comments in the deck and
`6_pitch_fact_check.md`.

## External sources

| # | Source | Used for | Link |
|---|---|---|---|
| 1 | Li, P., Yang, J., Islam, M. A., Ren, S.: *Making AI Less "Thirsty": Uncovering and Addressing the Secret Water Footprint of AI Models*, arXiv:2304.03271 (v5) | GPT-3 training: ~700,000 l of on-site cooling water, 5.4 million l in total (slide 1) | https://arxiv.org/abs/2304.03271 |
| 2 | swissinfo.ch: *Swiss concerned by electricity consumption of data centres and AI*, Oct 2025, reporting a survey by AlgorithmWatch CH; also Le News, 30 Oct 2025 | 7 in 10 people in Switzerland fear the water use of new data centres harms the environment (slide 1) | https://www.swissinfo.ch/eng/swiss-ai/swiss-concerned-by-electricity-consumption-of-data-centres-and-ai/90233764 · https://lenews.ch/2025/10/30/ai-boom-sparks-concern-over-data-centre-power-and-water-use-in-switzerland/ |
| 3 | Swiss Federal Statistical Office (BFS): *Gebäude- und Wohnungsstatistik 2025*, press release 15 Sep 2026 | 58 % of households heated with oil or gas in 2025 (32 % oil, 25 % gas); 50 % of residential buildings (slide 2) | https://www.bfs.admin.ch/de/newnsb/xrhcMB8jXvge |
| 4 | ElCom, Swiss electricity prices 2026, Basel (IWB), category **H4**, product Standard | 33.25 Rp/kWh = grid 11.41 + metering 1.20 + energy 10.89 + levies 7.44 + grid surcharge 2.30 (reference house, as the brief requires) | https://www.strompreis.elcom.admin.ch/municipality/2701?period=2026&category=H4 |
| 5 | ElCom, Swiss electricity prices 2026, Basel (IWB), category **C5** (business, < 150 kW, medium voltage) | 26.01 Rp/kWh = grid 8.67 + metering 0.16 + energy 9.10 + levies 5.79 + grid surcharge 2.30 (university rack, slides 9 and 11) | https://www.strompreis.elcom.admin.ch/municipality/2701?period=2026&category=C5 |
| 6 | Swiss Federal Office of Energy (SFOE/BFE): *Rechenzentren in der Schweiz: Stromverbrauch und Effizienzpotenziale*, press release 7 May 2026 | Swiss data centres used 2.1 TWh in 2024 (3.6 % of Swiss electricity); 2.5–3.2 TWh expected by 2030 (slide 12) | https://www.admin.ch/de/newnsb/GV-_d7OgIlqjfQDGZqbkN |
| 7 | Federal Office for the Environment (BAFU/FOEN): *CO2 emission factors*, fact sheet 01-2026 | Heating oil extra light: 73.7 t CO2/TJ = 0.265 t CO2/MWh (slide 12) | https://www.bafu.admin.ch/dam/fr/sd-web/NlGIhzJ8OW0t/Faktenblatt_CO2-Emissionsfaktoren_01-2026_FR.pdf |
| 8 | DigitalHeat case brief (provided by the challenge) | 1 kW server, 80 % heat recovered, 10 kW cold-day demand, 19.2 kWh/day per server, 12.5 vs 0.6 servers, reference house formula, 35 kWh tank, heat value = price ÷ 2.5, break-even formula (slides 4–6) | provided with the case |
| 9 | Open-Meteo historical weather API, Basel (47.56 N, 7.59 E), 2025, hourly | Reference house heating demand (slides 5 and 6) | https://open-meteo.com/en/docs/historical-weather-api |
| 10 | Alibaba GPU cluster trace 2020 (`pai_task_table`, `pai_group_tag_table`) | Task durations and workload mix of the five open-data job types (slide 6) | https://github.com/alibaba/clusterdata/tree/master/cluster-trace-gpu-v2020 |
| 11 | MLCommons MLPerf Inference Datacenter results v6.1 | GPU throughput reference for the job types (slide 6) | https://mlcommons.org/benchmarks/inference-datacenter/ · https://github.com/mlcommons/inference_results_v6.1 |
| 12 | NVIDIA L4 Tensor Core GPU datasheet | 72 W board power per GPU, used for the power per job (slide 6) | https://www.nvidia.com/en-us/data-center/l4/ |
| 13 | AWS EC2 g6.xlarge (1 × NVIDIA L4) on-demand and spot prices, eu-central-1, via third-party trackers (aws-pricing.com, doit.com, devzero.io) | Computing prices per priority (reference house income) | https://aws.amazon.com/ec2/instance-types/g6/ |

## Our own data and code (reproducible)

Repository: https://github.com/khalidhammad402/FAU-Sprintd

| # | File | What it proves | Rebuild with |
|---|---|---|---|
| A | `submission/README.md`, `submission/key_figures.json` | Reference-house balance: 3 servers, 45.7 % covered, 1,227 kWh dumped (7.9 %), 85.9 % busy, 0.06 % late, break-even 0.235 CHF/server-hour | `python -m sim.submission --live` |
| B | `submission/1_jobs.md`, `submission/measurement.json` | Six job types; the laptop measurement (2.72 M images in 120 s, 29.3 W, 0.98 Wh) | `python -m live.measure` (on battery) |
| C | `submission/2_live_log.txt` | The real process paused at 81 % on a full tank (17:00) and resumed at 22:00 | `python -m live.proof` |
| D | `submission/3_balance.xlsx` | Brief's balance with live formulas and the "does not pay off" statement | `python -m sim.submission` |
| E | `results/university/greedy/jury.json` | University year: 600 MWh demand, 123.5 MWh server heat used (20.6 %), 62 % busy, 1 of 18,001 jobs late | `python make_university.py` then `python -m sim.university` |
| F | `submission/5_university_business_case.xlsx` | University rack: revenue CHF 318,749, running costs CHF 130,243, operating profit CHF 188,506, payback 3.7 years, break-even incl. hardware CHF 1.54/server-hour | `python -m tools.make_jury_excel` |
| G | `submission/ASSUMPTIONS.md` | Every assumption with its status (BRIEF / SOURCE / MEASURED / ASSUMPTION) | `python -m sim.submission` |
| H | `tools/update_stage_deck.py` | Every change made to the deck | `python -m tools.update_stage_deck "<deck.pptx>"` |
