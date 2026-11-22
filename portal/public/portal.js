/* DigitalHeat portal: QR of this page's network address, links that follow the host, dashboard status. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/;
  var info = { port: +location.port || 80, dashboardPort: 5173, lan: [], deck: true, video: true };

  /** Draws the QR as one SVG path: dark modules on the paper-coloured card. */
  function drawQr(text) {
    var qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount(), d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    $('qr').innerHTML = '<svg viewBox="-3 -3 ' + (n + 6) + ' ' + (n + 6) + '" shape-rendering="crispEdges" aria-hidden="true"><path fill="#0b0c0b" d="' + d + '"/></svg>';
  }

  /** The address other devices should use: this page's host, or the laptop's LAN address when opened as localhost. */
  function shareHost() {
    if (!LOCAL.test(location.hostname)) return location.hostname;
    var sel = $('pick');
    return sel.value || (info.lan[0] && info.lan[0].address) || location.hostname;
  }

  function render() {
    var host = shareHost();
    var url = 'http://' + host + (info.port === 80 ? '' : ':' + info.port) + '/';
    drawQr(url);
    $('url').textContent = url.replace(/^http:\/\//, '').replace(/\/$/, '');
    var note = $('note');
    if (LOCAL.test(host)) {
      note.textContent = 'No network connection found. Join a Wi-Fi or hotspot, then reload.';
      note.className = 'note warn';
    } else {
      note.textContent = 'Same Wi-Fi as the presenter’s laptop.';
      note.className = 'note';
    }
    $('net').innerHTML = LOCAL.test(host) ? 'Offline' : '<i></i>' + host;
  }

  function links() {
    var dash = 'http://' + location.hostname + ':' + info.dashboardPort + '/login';
    $('lnDash').href = dash;
    if (!info.deck) off('lnDeck', 'Not found on this laptop. Set DH_DECK when starting the portal.');
    if (!info.video) off('lnVideo', 'Video file not found in docs/media.');
    checkDashboard(dash);
  }

  function off(id, why) {
    var a = $(id);
    a.classList.add('off');
    a.removeAttribute('href');
    a.querySelector('.sub').textContent = why;
  }

  /** The dashboard runs on another port; a no-cors request only tells us whether something answers there. */
  function checkDashboard(url) {
    var el = $('dashState');
    var ctl = 'AbortController' in window ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 4000);
    fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctl && ctl.signal })
      .then(function () { el.textContent = 'running'; el.className = 'state mono up'; })
      .catch(function () { el.textContent = 'not started'; el.className = 'state mono down'; })
      .then(function () { clearTimeout(t); });
  }

  function phoneCopy() {
    if (matchMedia('(max-width: 900px)').matches) $('shareTitle').textContent = 'Pass it on: let someone scan this';
  }

  fetch('/info.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (j) { info = j; })
    .catch(function () { /* opened without the portal server: keep the defaults */ })
    .then(function () {
      if (LOCAL.test(location.hostname) && info.lan.length > 1) {
        $('pick').innerHTML = info.lan.map(function (a) { return '<option value="' + a.address + '">' + a.address + ' · ' + a.name + '</option>'; }).join('');
        $('pickWrap').hidden = false;
        $('pick').addEventListener('change', render);
      }
      phoneCopy();
      links();
      render();
    });
  setInterval(function () { checkDashboard($('lnDash').href); }, 15000);
})();
