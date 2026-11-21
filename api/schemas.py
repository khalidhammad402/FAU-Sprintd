"""
Request bodies of the API (typed, so /docs and openapi.json show every field).
JSON uses camelCase; Python uses snake_case (aliases are generated).
"""
from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Body(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class LoginRequest(Body):
    username: str = Field(examples=["admin"])
    password: str = Field(examples=["demo"])


class TaskSpec(Body):
    task_id: Optional[str] = Field(None, description="Your own id inside this job (e.g. 'T1'); made unique by the API",
                                   examples=["A"])
    name: Optional[str] = Field(None, examples=["embed batch 1"])
    runtime_min: float = Field(gt=0, description="Runtime on one server, minutes", examples=[30])
    power_kw: float = Field(gt=0, description="Power while running (all threads), kW", examples=[0.3])
    threads: int = Field(1, ge=1)
    interruptible: bool = Field(True, description="False = once started it cannot be paused or moved")
    depends_on: List[str] = Field(default_factory=list, description="taskIds of this job that must finish first")


class JobSubmit(Body):
    name: Optional[str] = Field(None, examples=["Embed archive"])
    priority: Literal["critical", "normal", "flexible"] = "normal"
    deadline: Optional[datetime] = Field(None, description="ISO 8601; give this or deadlineInMin")
    deadline_in_min: Optional[float] = Field(None, gt=0, description="Deadline in minutes of simulated time from now",
                                             examples=[600])
    tasks: List[TaskSpec] = Field(min_length=1)


class SchedulerUpdate(Body):
    algorithm: Optional[Literal["greedy", "mpc"]] = None
    slot_seconds: Optional[float] = Field(None, gt=0, le=3600,
                                          description="Real seconds per 15-min slot of the demo clock")
    paused: Optional[bool] = Field(None, description="True = stop the clock, False = let it run")


class JumpRequest(Body):
    to: Optional[datetime] = Field(None, description="Fast-forward to this time (forward only)",
                                   examples=["2021-01-19T00:00:00"])
    slot: Optional[int] = Field(None, ge=0, description="... or to this slot number")


class PricingUpdate(Body):
    electricity_chf_per_kwh: Optional[float] = Field(None, gt=0)
    heat_pump_cop: Optional[float] = Field(None, gt=0)
    compute_chf_per_server_hour: Optional[Dict[str, float]] = Field(
        None, description="Per priority: {critical, normal, flexible}")


class SimulationRequest(Body):
    algorithm: Literal["greedy", "mpc"] = "greedy"
    dataset_id: Optional[str] = Field(None, description="File name from GET /admin/datasets; default = active file")


class AckRequest(Body):
    acknowledged: bool = True


class ReadRequest(Body):
    read: bool = True
