/* =====================================================================
   net.js — Netzwerk-Client (Phase 1: Verbindung + Passwort)
   Reines Browser-WebSocket, keine Bibliothek, kein Bundler. Verbindet sich
   zu einem PartyKit-Raum ("main"/"world") und liefert eine kleine API, an
   die game.js Nachrichtentypen anmeldet und über die es später (Phase 2+)
   Spielzustände verschickt. Kennt kein DOM — reine Netzwerklogik, die UI
   (Passwort-Abfrage, Toasts) lebt in game.js.
   ===================================================================== */

// EINZIGE Stelle, die für einen echten Server angepasst werden muss:
// lokal ein PartyKit-Dev-Server, in Produktion die deployte wss://-Adresse.
export const PARTY_URL = 'wss://erntedominik.manigames.xyz';

const CONNECT_TIMEOUT = 5000;           // ms, bis ein Verbindungsversuch als "offline" gilt
const BACKOFFS = [2000, 5000, 10000];   // ms, Wiederverbindung nach unerwartetem Abbruch

let ws = null;                          // aktueller Socket, oder null
let currentPassword = null;             // für Wiederverbindungsversuche
let manualClose = false;                // true = kein automatisches Reconnect (Nutzeraktion oder 4001/4002)
let reconnectAttempt = 0;
let reconnectTimer = null;
let pid = null;
let roster = [];

const handlers = new Map();             // Typ ("welcome","join","leave","disconnected",...) -> Set<fn>

function dispatch(type, msg){
  const set = handlers.get(type);
  if(!set) return;
  for(const fn of set){ try{ fn(msg); }catch(e){ console.error(e); } }
}

function makeErr(reason, cause){
  const e = new Error('net:'+reason);
  e.reason = reason;                    // 'bad-password' | 'full' | 'offline'
  if(cause) e.cause = cause;
  return e;
}

// ------------------------------------------------------------------ Öffentliche API
// on(type, handler) — hört auf Server-Nachrichten (t-Feld: 'welcome','join',
// 'leave', später mehr) sowie auf interne Verbindungsereignisse:
// 'disconnected' ({reason,code}), 'reconnecting' ({attempt,wait}),
// 'reconnected' ({pid,roster,now}). Gibt eine Abmeldefunktion zurück.
export function on(type, handler){
  let set = handlers.get(type);
  if(!set){ set = new Set(); handlers.set(type, set); }
  set.add(handler);
  return () => set.delete(handler);
}

// send(obj) — schickt eine Nachricht (JSON) auf dem offenen Socket.
// Phase 1 verschickt noch keine Spiel-Nachrichten, aber die Verkabelung
// steht schon für spätere Phasen. Gibt zurück, ob wirklich gesendet wurde.
export function send(obj){
  if(ws && ws.readyState === WebSocket.OPEN){
    ws.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

export function getPid(){ return pid; }
export function getRoster(){ return roster.slice(); }
export function isConnected(){ return !!ws && ws.readyState === WebSocket.OPEN; }

// disconnect() — bewusstes Trennen; verhindert automatisches Reconnect.
export function disconnect(){
  manualClose = true;
  clearTimeout(reconnectTimer);
  if(ws){ try{ ws.close(); }catch(e){} }
  ws = null;
}

// connect(password) — baut die Verbindung auf. Löst mit {pid,roster,now}
// auf, sobald 'welcome' ankommt. Lehnt mit einem Error ab, dessen .reason
// 'bad-password' (Schließen-Code 4001), 'full' (4002) oder 'offline' ist
// (jeder andere Abbruch, Fehler oder Timeout — inklusive schlicht
// unerreichbarem Server). Wirft nie unkontrolliert und hängt nie endlos:
// nach CONNECT_TIMEOUT gilt der Versuch als 'offline'.
export function connect(password){
  manualClose = false;
  currentPassword = password;
  reconnectAttempt = 0;
  clearTimeout(reconnectTimer);
  return openSocket(password);
}

function openSocket(password){
  return new Promise((resolve, reject) => {
    let settled = false;                // true, sobald 'welcome' diesen Versuch beendet hat
    let socket;
    try{
      socket = new WebSocket(`${PARTY_URL}/parties/main/world?pw=${encodeURIComponent(password)}`);
    }catch(e){
      reject(makeErr('offline', e));
      return;
    }
    ws = socket;

    const timer = setTimeout(() => {
      if(settled) return;
      try{ socket.close(); }catch(e){}  // löst unten den 'close'-Handler aus
    }, CONNECT_TIMEOUT);

    socket.addEventListener('message', ev => {
      let msg;
      try{ msg = JSON.parse(ev.data); }catch(e){ return; }
      if(msg.t === 'welcome'){
        pid = msg.pid;
        roster = Array.isArray(msg.roster) ? msg.roster.slice() : [];
        if(!settled){
          settled = true;
          clearTimeout(timer);
          reconnectAttempt = 0;         // erfolgreiche Verbindung setzt die Rückzugsstufe zurück
          resolve({pid: msg.pid, roster, now: msg.now});
        }
      }else if(msg.t === 'join'){
        if(!roster.includes(msg.pid)) roster.push(msg.pid);
      }else if(msg.t === 'leave'){
        roster = roster.filter(p => p !== msg.pid);
      }
      dispatch(msg.t, msg);
    });

    socket.addEventListener('close', ev => {
      clearTimeout(timer);
      if(ws === socket) ws = null;

      if(!settled){
        // Dieser Verbindungsversuch selbst ist gescheitert — kein Reconnect
        // hier; das entscheidet der Aufrufer (game.js) anhand des Fehlers.
        settled = true;
        if(ev.code === 4001) reject(makeErr('bad-password'));
        else if(ev.code === 4002) reject(makeErr('full'));
        else reject(makeErr('offline'));
        return;
      }

      // War schon verbunden (welcome kam an) und die Verbindung bricht jetzt
      // unerwartet ab.
      if(manualClose) return;
      if(ev.code === 4001 || ev.code === 4002){
        // Server sagt jetzt aktiv nein (z.B. Passwort zwischenzeitlich
        // geändert) — das ist ebenfalls terminal, kein Reconnect-Loop.
        manualClose = true;
        dispatch('disconnected', {reason: ev.code===4001?'bad-password':'full', code: ev.code});
        return;
      }
      dispatch('disconnected', {reason:'offline', code: ev.code});
      scheduleReconnect();
    });

    // 'error' liefert im Browser keine brauchbaren Details; das folgende
    // 'close'-Ereignis übernimmt die eigentliche Behandlung.
    socket.addEventListener('error', () => {});
  });
}

function scheduleReconnect(){
  if(manualClose) return;
  const wait = BACKOFFS[Math.min(reconnectAttempt, BACKOFFS.length-1)];
  reconnectAttempt++;
  clearTimeout(reconnectTimer);
  dispatch('reconnecting', {attempt: reconnectAttempt, wait});
  reconnectTimer = setTimeout(() => {
    if(manualClose || !currentPassword) return;
    openSocket(currentPassword).then(info => {
      dispatch('reconnected', info);
    }).catch(err => {
      if(err.reason === 'bad-password' || err.reason === 'full'){
        manualClose = true;
        dispatch('disconnected', {reason: err.reason, code: err.reason==='bad-password'?4001:4002});
        return;
      }
      scheduleReconnect();
    });
  }, wait);
}
