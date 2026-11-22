# Stage deck: fact check and justification

Every number in `DigitalHeat – Stage Deck (1).pptx`, checked against our simulation outputs and public sources.
The corrected deck is `DigitalHeat_Stage_Deck_corrected.pptx`, built by `python -m tools.update_stage_deck`.
Each changed slide has a PowerPoint comment by **"DigitalHeat fact check"** that says what changed and why.
Source numbers in [brackets] refer to `REFERENCES.md`.

**Status:**
- ✅ correct as it was;
- ✏️ corrected;
- 🅰️ our assumption, which no data can prove; it is labelled as an assumption and is defensible.

## The brief's three must-haves and where each is proven

| Must-have | Deck slide | Proof | Status |
|---|---|---|---|
| 1. At least two job types with runtime, energy, interruptible flag and deadline; one runs and is measured on our machine; scaling to 1 kW; jobs per day and their source; unlimited jobs stated | 6 (table + notes) | `1_jobs.md`, `measurement.json` [B] | ✅ six types; image recognition measured: 2.72 M images in 120 s, 29.3 W, 0.98 Wh |
| 2. The same scheduler pauses and resumes a real running job on the heat signal | 6, 7 | `2_live_log.txt` [C]: on 4 Oct, tank full at 17:00, pause at 81 %; at 22:00, tank at 17.7 kWh, resume from 81 % | ✅ |
| 3. Yearly balance for the reference house: servers, coverage, dumped heat, utilisation, missed deadlines, electricity cost, income, break-even, when it does not pay off | 5, 6 | `3_balance.xlsx`, `README.md` [A, D] | ✅ |

## Slide by slide

### Slide 1: Servers are thirsty (notes only)

| Claim in deck | Verified | Status | Evidence |
|---|---|---|---|
| GPT-3 training used ~700,000 litres of water | 700,000 l of **on-site** cooling water; 5.4 million l including power generation | ✏️ made precise | [1] |
| "7 out of 10 people are worried" (swissinfo survey 2025) | 7 in 10 fear that the **water use** of new data centres harms the environment (AlgorithmWatch CH survey, reported Oct 2025) | ✏️ made precise | [2] |

### Slide 2: All that heat? Gone. (notes only)

| Claim in deck | Verified | Status | Evidence |
|---|---|---|---|
| 58 % of Swiss homes burn oil or gas (BFS) | 58 % of **households** in 2025 (32 % oil, 25 % gas). By buildings it is 50 %. | ✅ value, ✏️ wording | [3] |

### Slide 4: Homes? No. Businesses.

| Claim in deck | Verified | Status | Evidence |
|---|---|---|---|
| 12.5 servers in January | 10 kW ÷ 0.8 kW = 12.5 | ✅ | [8] |
| 0.6 servers in July | 12 kWh ÷ 19.2 kWh = 0.63 | ✅ | [8] |
| 20× less | 12.5 ÷ 0.6 = 20.8 | ✅ | [8] |
| One big rack covers "about a quarter" of a university's base heat | One DH-Pro rack covers **21 %** (123.5 of 600 MWh a year) in our year simulation | ✏️ notes | [E] |
| Absolute heat demand of a business (open comment on this slide) | Campus: **600 MWh a year**, 19× the reference house | 🅰️ | `make_university.py` |

### Slide 5: Our solution

| Claim in deck | Verified | Status | Evidence |
|---|---|---|---|
| 46 % heat covered | 45.7 % (14,310 of 31,307 kWh) | ✅ | [A] |
| **2.5 % heat wasted** | **7.9 %** (1,227 of 15,537 kWh server heat). The 2.5 % came from an older run with 5 job types and 0.33 CHF/kWh. | ✏️ corrected | [A] |
| 0.06 % jobs late | 0.064 % (22 of 34,645 jobs) | ✅ | [A] |
| "real Basel electricity prices" | ElCom 2026, IWB, H4: 33.25 Rp/kWh | ✅ | [4] |

### Slide 6: 3 / 3 ✓

| Claim in deck | Verified | Status | Evidence |
|---|---|---|---|
| "5 types" | **6 types**: five from open data plus image recognition, which we measured | ✏️ corrected | [B] |
| Job table | It overlapped the three cards and had no header. Rebuilt below the cards, with the measured job added. | ✏️ corrected | [B] |
| Sweep deadline (blank) | 48 h | ✏️ corrected | `data/reference_house/job_types.json` |
| 23 Rp break-even | 23.5 Rp (0.235 CHF per server-hour) | ✏️ made precise | [A, D] |
| Notes: "two job types", "78 jobs a day", "19 % from customer jobs", 28,565 jobs, 82 % busy, 371 kWh wasted, CHF 50,075 income | Final run: 6 types, 95 jobs a day, 24 %, 34,645 jobs, 85.9 % busy, 1,227 kWh dumped, CHF 52,685 income | ✏️ notes | [A] |
| Laptop: 2.7 M images in 2 min, 0.98 Wh, 29.3 W / 17.7 W | Same | ✅ | [B] |

### Slide 7: The brain (notes only)

| Claim in deck | Verified | Status | Evidence |
|---|---|---|---|
| "Every 60 seconds" | Every **15-minute** slot. On the live demo clock, one slot lasts 3–10 real seconds. | ✏️ | `config.py` |
| "a math method called MILP picks the best plan" | The yearly results use **priority rules** (greedy). The optional optimiser is a linear program (LP), not a MILP, and on the university case it gave the same result. | ✏️ | `core/scheduler.py`, `core/mpc.py` |
| "at 90 % full tank, pause it" | It pauses when the tank is **full** (heat would be dumped). Background work fills the tank up to **50 %**. | ✏️ | `core/scheduler.py` |
| "what's the weather" | The scheduler reads the heat demand and does not use a weather forecast. The ⛅ icon could be dropped. | ✏️ notes | `core/scheduler.py` |

### Slide 9: 1 university

All values come from the simulated university year [E] and the business case [F], at the ElCom business price of 26.01 Rp/kWh [5].

| Claim in deck | Verified | Status | Evidence |
|---|---|---|---|
| 106k from the university | 101,171 server-hours × CHF 1.50 = **CHF 152k** | ✏️ | [E, F] |
| 106k from companies | 61,656 server-hours × CHF 2.50 = **CHF 154k** | ✏️ | [E, F] |
| 17k heat: 157,700 kWh × CHF 0.11 | 123,543 kWh **used** × CHF 0.104 (= 0.2601 ÷ 2.5) = **CHF 13k** | ✏️ | [E, F, 5, 8] |
| = CHF 180k a year | Revenue CHF 319k − running costs CHF 130k = **CHF 189k a year**. Running costs: electricity 55k, maintenance 35k, network and insurance 10k, sales 31k. | ✏️ | [F] |
| Notes: 75 % utilisation, CHF 1.08 per hour, 0.25 CHF/kWh | Simulation: 62 % busy. Prices CHF 1.50 and CHF 2.50 are 🅰️ (below AWS L4 on-demand, about CHF 0.81 per GPU-hour × 8 GPUs per kW). Electricity: ElCom C5. | ✏️ | [E, F, 13] |

Why the old numbers were wrong:
- They assumed 75 % utilisation; the simulation shows 62 %.
- They counted all heat produced as sold, but 6.7 MWh is dumped in summer.
- They left out maintenance, fixed costs and sales costs.

### Slide 11: Our money back

| Claim in deck | Verified | Status | Evidence |
|---|---|---|---|
| 692k ÷ 180k = 3.9 years | 692k ÷ 189k = **3.7 years** | ✏️ | [F] |
| Cash chart: −692k, −512k, −332k, −152k, +28k, +208k, +388k | −692k, −503k, −315k, −126k, +62k, +251k (up to year 5, the hardware life) | ✏️ redrawn | [F] |
| Rack and installation CHF 692,000 | Team estimate | 🅰️ | `5_university_business_case.xlsx` B6 |
| "We break even at 23 Rp; we sell at about 1 franc" | 23.5 Rp is the **reference house**, using the brief's formula. The university rack breaks even at CHF 1.54 per server-hour including hardware, and we sell at CHF 1.88 on average. | ✏️ notes | [A, F] |

### Slide 12: 1,000 racks by year 5

| Claim in deck | Verified | Status | Evidence |
|---|---|---|---|
| Swiss data centres: 2.1 TWh in 2024 (SFOE study 2025) | 2.1 TWh, 3.6 % of Swiss electricity. The SFOE study was published in **May 2026**. | ✅ value, ✏️ year | [6] |
| 2.3M / 11.6M / 58M / ~230M | At CHF 318,749 per rack (simulated): **3.2M / 15.9M / 79.7M / ~319M** | ✏️ redrawn | [F] |
| 42,000 t CO2 | 123.5 MWh of heat **used** per rack × 0.265 t/MWh (heating oil) = 32.8 t per rack, so **~32,800 t** for 1,000 racks. Assumes our heat replaces oil heating. | ✏️ redrawn | [E, 7] |
| 10 → 50 → 250 → 1,000 racks | Growth plan | 🅰️ | – |

### Slide 15: Three rack sizes (backup)

| Claim in deck | Verified | Status | Evidence |
|---|---|---|---|
| Heat per year 31.5 / 78.8 / 157.7 MWh (75 % busy assumed) | At the simulated 62 % utilisation: **26.1 / 65.1 / 130.3 MWh**. DH-Pro matches the simulation (130,261 kWh produced). | ✏️ | [E] |
| Sizes, floor space, 6 / 15 / 30 kW, 60 °C water | Design assumptions. Floor space includes service clearance. | 🅰️ | – |

### Slides with nothing to correct

- **Slides 3, 10 and 14** contain no numbers.
- **Slide 13** has no numbers to check. "10-year contracts" is a strategy assumption 🅰️.
- **Slide 8** is a placeholder for the PDF.

## Assumptions the jury may ask about (no data can prove them; state them as ours)

| Assumption | Value | Why it is reasonable |
|---|---|---|
| Campus heat demand | 600 MWh a year | The brief's reference profile × 19.2. This is a mid-size campus building cluster. |
| Rack CapEx incl. installation | CHF 692,000 | Team estimate for 30 GPU servers, liquid cooling, heat exchanger and installation |
| Compute prices | University CHF 1.50, companies CHF 2.50 per server-hour | Below the AWS on-demand price for the same GPU power ([13]: L4 at about USD 1.01 per GPU-hour) |
| Utilisation | 62 % | Not assumed: it is the result of the simulated university job mix [E] |
| Maintenance / fixed / sales | 5 % of CapEx / CHF 10k / 10 % of revenue | Typical shares; inputs in `5_university_business_case.xlsx` |
| Heat replaces | Heat pump (value, as in the brief) / oil heating (CO2) | The brief values heat as electricity ÷ 2.5. 58 % of households still use oil or gas [3]. |
| Background work | Unlimited, sold at spot price | Stated in the brief's must-have 1. Customer jobs alone cover 24 %. |
