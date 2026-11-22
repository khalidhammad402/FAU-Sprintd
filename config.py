"""
All settings in one place. Change values here, not in the code.
Numbers marked ASSUMPTION are placeholders: replace them with your own sources.
"""

# --- time ---------------------------------------------------------------------------
SLOT_MIN = 15                 # length of one scheduling slot (minutes)
SLOT_H = SLOT_MIN / 60        # same in hours

# --- heat physics (case brief) ---------------------------------------------------------
RECOVERY = 0.8                # share of server electricity recovered as usable heat
TANK_KWH_DEFAULT = 35.0       # tank capacity per site if sites.csv gives none
TANK_START_FRACTION = 0.0     # tank level at the start (0 = empty)

# --- scheduler ------------------------------------------------------------------------
ALGORITHM = "greedy"          # "greedy" or "mpc"
TARGET_FRACTION = 0.5         # greedy: aim to keep each tank this full
URGENT_SLACK_SLOTS = 1.0      # a task with less slack than this must run now
FILLER_ENABLED = True         # True = unlimited background work (spot market) fills heat gaps
FILLER_TASKS = [              # ASSUMPTION: background work types used as filler
    {"name": "filler-embeddings",    "runtime_min": 30, "power_kw": 0.3},
    {"name": "filler-reranking",     "runtime_min": 15, "power_kw": 0.5},
    {"name": "filler-image",         "runtime_min": 45, "power_kw": 0.8},
    {"name": "filler-transcription", "runtime_min": 60, "power_kw": 1.0},
]

# --- MPC planner (rolling-horizon optimisation) ----------------------------------------
MPC_HORIZON_SLOTS = 96        # look ahead 24 h
FORECAST = "perfect"          # "perfect" (reads ahead in the demand file) or "persistence" (same slot yesterday)
W_UNMET, W_DUMP, W_ELEC = 1000.0, 1.0, 0.001   # objective weights: meet demand > avoid dumping > save power
W_TANK_END = 0.5              # value of heat left in the tank at the end of the horizon
MPC_RESERVE_KWH = 3.0         # try to keep this much heat in the tank as a safety buffer
W_RESERVE = 10.0              # cost per kWh the tank goes below the buffer
MPC_TIME_LIMIT_S = 5

# --- economics ---------------------------------------------------------------------------
# ElCom 2026, Basel (BFS 2701), IWB, category H4, product Standard, total incl. all fees: 33.25 Rp./kWh
# (grid 11.41 + metering 1.20 + energy 10.89 + levies 7.44 + grid surcharge 2.30). Read 2026-11-22 from
# https://www.strompreis.elcom.admin.ch/municipality/2701?period=2026&category=H4
ELECTRICITY_CHF_PER_KWH = 0.3325
HEAT_PUMP_COP = 2.5           # heat value = electricity price / 2.5 (case brief)
# Compute income in CHF per kWh of server electricity (metrics: income = task energy_kwh x price).
# Derived from cloud GPU prices (see data/job_types.json "prices"):
#   CHF/kWh = USD per L4 GPU-hour x USD_TO_CHF / KW_PER_GPU
#   AWS g6.xlarge (1x L4), Frankfurt: on-demand 1.01 USD/h, spot 0.36 USD/h (retrieved 2026-11-21)
#   critical = on-demand, normal = midpoint, flexible (and filler) = spot
GPU_HOUR_USD = {"critical": 1.01, "normal": (1.01 + 0.36) / 2, "flexible": 0.36}
USD_TO_CHF = 0.80             # ASSUMPTION: set the current exchange rate
KW_PER_GPU = 0.122            # 72 W L4 board (NVIDIA datasheet) + 50 W host share (ASSUMPTION)
COMPUTE_CHF_PER_SERVER_HOUR = {p: usd * USD_TO_CHF / KW_PER_GPU for p, usd in GPU_HOUR_USD.items()}
# -> critical 6.62, normal 4.49, flexible 2.36 CHF per kWh

# --- files ----------------------------------------------------------------------------
DATA_DIR = "data"
RESULTS_DIR = "results"
DEMAND_FILE = "demand - latest.xlsx"   # first column timestamp, then one column per site (kWh per slot)
                                       # (case reference house: "reference_house_2025.csv", inputs in data/backup_reference_house/)
SITES_FILE = "sites.csv"      # optional: site_id, name, type, lat, lon, building_height_m, tank_kwh, owner
SERVERS_FILE = "servers.csv"  # server_id, site_id, capacity_kw
JOBS_FILE = "jobs.json"       # jobs with their tasks

# --- live prototype -------------------------------------------------------------------
SLOT_SECONDS = 10             # demo clock: one 15-min slot lasts this many real seconds
MQTT_HOST = "localhost"
MQTT_PORT = 1883
TOPIC = "dh"                  # MQTT topic prefix

# --- demo users (NOT secure: for the prototype only) -----------------------------------
USERS = {
    "admin":   {"password": "demo", "role": "admin",      "name": "DigitalHeat Admin"},
    "acme":    {"password": "demo", "role": "customer",   "name": "ACME AI", "customer": "acme"},
    "globex":  {"password": "demo", "role": "customer",   "name": "Globex",  "customer": "globex"},
    "h1owner": {"password": "demo", "role": "site_owner", "name": "Owner H1", "sites": ["H1"]},
    "h2owner": {"password": "demo", "role": "site_owner", "name": "Owner H2", "sites": ["H2"]},
    "farm1owner": {"password": "demo", "role": "site_owner", "name": "Owner FARM1", "sites": ["FARM1"]},
    "hotel1owner": {"password": "demo", "role": "site_owner", "name": "Owner HOTEL1", "sites": ["HOTEL1"]},
    "hotel2owner": {"password": "demo", "role": "site_owner", "name": "Owner HOTEL2", "sites": ["HOTEL2"]},
    "hotelgroup": {"password": "demo", "role": "site_owner", "name": "Hotel group (2 hotels)",
                   "sites": ["HOTEL1", "HOTEL2"]},
}
