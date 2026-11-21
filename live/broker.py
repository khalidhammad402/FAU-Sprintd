"""
MQTT broker in pure Python (amqtt), so no Mosquitto installation is needed.

  python -m live.broker                 # listens on 0.0.0.0:1883 (all network interfaces)

Run it on the host laptop (the one that also runs the API). Agents on the other laptops connect to
this laptop's IP address. Windows may ask to allow Python through the firewall: allow it on private networks.
"""
import argparse
import asyncio

from amqtt.broker import Broker


async def main(port):
    broker = Broker({
        "listeners": {"default": {"type": "tcp", "bind": f"0.0.0.0:{port}"}},
        "plugins": {"amqtt.plugins.authentication.AnonymousAuthPlugin": {"allow_anonymous": True}},
    })
    await broker.start()
    print(f"MQTT broker listening on 0.0.0.0:{port} (Ctrl+C to stop)", flush=True)
    await asyncio.Event().wait()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=1883)
    asyncio.run(main(ap.parse_args().port))
