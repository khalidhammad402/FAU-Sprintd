"""Plain data classes. Times are slot numbers (float): slot 0 = first row of the demand file."""
from dataclasses import dataclass, field

import config

# task states
WAITING, READY, RUNNING, PAUSED, DONE, MISSED, CANCELLED = (
    "waiting", "ready", "running", "paused", "done", "missed", "cancelled")
ACTIVE = (READY, RUNNING, PAUSED)          # can be scheduled
FINISHED = (DONE, MISSED, CANCELLED)


@dataclass
class Site:
    site_id: str
    name: str
    type: str = "household"                # household | farm | hotel | spa | business
    lat: float = 47.56
    lon: float = 7.59
    building_height_m: float = 10.0
    tank_cap_kwh: float = config.TANK_KWH_DEFAULT
    tank_kwh: float = 0.0
    owner: str = ""


@dataclass
class Server:
    server_id: str
    site_id: str
    capacity_kw: float
    online: bool = True
    live: bool = False                     # True when a real agent (laptop) runs this server
    cpu_pct: float = 0.0
    last_seen: float = 0.0


@dataclass
class Task:
    task_id: str
    job_id: str
    name: str
    runtime_slots: float                   # runtime in slots (runtime_min / 15)
    power_kw: float                        # power while running, all threads together
    arrival: float                         # slot when it may start
    deadline: float                        # slot by which it must be finished
    priority: str = "normal"               # critical | normal | flexible
    interruptible: bool = True
    threads: int = 1
    depends_on: list = field(default_factory=list)
    filler: bool = False                   # background work created by the scheduler
    # --- runtime state ---
    state: str = WAITING
    server_id: str = None                  # where it runs or is paused
    remaining_slots: float = None
    started: bool = False
    hold: bool = False                     # set by an admin: do not schedule
    energy_kwh: float = 0.0
    heat_kwh: float = 0.0
    finished_slot: float = None
    events: list = field(default_factory=list)   # (slot, kind, from_server, to_server)

    def __post_init__(self):
        if self.remaining_slots is None:
            self.remaining_slots = self.runtime_slots

    def heat_this_slot(self) -> float:
        """Heat (kWh) this task gives if it runs during the current slot."""
        return self.power_kw * min(1.0, self.remaining_slots) * config.SLOT_H * config.RECOVERY

    @property
    def progress(self) -> float:
        return 1.0 - self.remaining_slots / self.runtime_slots if self.runtime_slots else 1.0


@dataclass
class Job:
    job_id: str
    customer: str
    name: str
    priority: str
    arrival: float
    deadline: float
    task_ids: list = field(default_factory=list)
