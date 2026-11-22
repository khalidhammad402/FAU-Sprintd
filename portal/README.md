# DigitalHeat portal

One page on the local network that links the pitch deck, the live dashboard and the walkthrough video, with a QR code of its
own address. The last slide of the deck shows the same QR code.

```bash
node portal/server.mjs        # from the repo root (or `pnpm portal` in frontend/), Node 18+, no dependencies
```

It prints the addresses, for example `http://10.175.55.190:8080/`. Open that on any device on the same Wi-Fi.

| Path | What |
|---|---|
| `/` | the portal page; its QR code always shows the laptop's network address, also when opened as `localhost` |
| `/deck/` | the pitch deck, served from `../pitch-deck` next to this repo (override with `DH_DECK`) |
| `/dashboard` | redirect to the dashboard on the same host, port 5173 (`pnpm lan` in `frontend/`) |
| `/video` | `docs/media/DigitalHeat_walkthrough.mp4`, with range requests so phones can seek |
| `/info.json` | network addresses and what is available; the deck's QR slide reads it |

Settings (environment variables): `DH_PORTAL_PORT` (default 8080), `DH_DASH_PORT` (5173), `DH_DECK` (deck folder).

For a full stage setup run three things: the backend, `pnpm lan` and the portal (see `frontend/docs/DEMO_CHECKLIST.md`).
The dashboard row on the portal shows whether the dashboard answers.

Notes:

- The address changes with the network. Nothing is hard-coded: the portal and the deck ask for the current address each time.
- University Wi-Fi (eduroam) usually blocks traffic between devices. Use a phone hotspot for the demo.
- Windows asks once whether Node may accept connections; allow it for private networks.
- `public/vendor/qrcode.js` is qrcode-generator 1.4.4 (MIT). Fonts are Inter, Inter Tight and JetBrains Mono (OFL), the same as the deck.
