"""Tank physics for one site and one slot."""


def tank_step(tank_kwh, produced_kwh, demand_kwh, cap_kwh):
    """
    Heat goes into the tank, the house takes what it needs from it.
    Returns (new_tank, delivered, dumped, unmet).
      unmet  = demand the servers + tank could not cover (backup heater)
      dumped = heat that did not fit into a full tank
    """
    level = tank_kwh + produced_kwh - demand_kwh
    unmet = max(0.0, -level)
    dumped = max(0.0, level - cap_kwh)
    new_tank = min(max(level, 0.0), cap_kwh)
    return new_tank, demand_kwh - unmet, dumped, unmet
