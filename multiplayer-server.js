const http = require('http');

const port = Number(process.env.MULTIPLAYER_PORT || process.env.PORT || 8795);
const rooms = new Map();

function sendJson(res, status, payload) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(payload));
}

function getRoom(roomCode) {
    const code = String(roomCode || '').trim().toUpperCase();
    if (!code) return null;
    if (!rooms.has(code)) {
        rooms.set(code, {
            code,
            nextId: 1,
            events: [],
            clients: new Set()
        });
    }
    return rooms.get(code);
}

function addRoomEvent(room, event) {
    const relayEvent = {
        id: room.nextId++,
        receivedAt: new Date().toISOString(),
        ...event
    };
    room.events.push(relayEvent);
    while (room.events.length > 250) {
        room.events.shift();
    }
    const payload = `id: ${relayEvent.id}\nevent: game-event\ndata: ${JSON.stringify(relayEvent)}\n\n`;
    for (const client of room.clients) {
        client.write(payload);
    }
    return relayEvent;
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 5_000_000) {
                reject(new Error('Request body too large'));
                req.destroy();
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health' || url.pathname === '/health/')) {
        sendJson(res, 200, { ok: true, rooms: rooms.size });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/events') {
        const room = getRoom(url.searchParams.get('room'));
        if (!room) {
            sendJson(res, 400, { ok: false, error: 'room is required' });
            return;
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, room: room.code })}\n\n`);
        room.events.slice(-20).forEach(event => {
            res.write(`id: ${event.id}\nevent: game-event\ndata: ${JSON.stringify(event)}\n\n`);
        });
        room.clients.add(res);
        req.on('close', () => room.clients.delete(res));
        return;
    }

    if (req.method === 'POST' && url.pathname === '/rooms') {
        try {
            const payload = JSON.parse(await readBody(req) || '{}');
            const room = getRoom(payload.room);
            if (!room) {
                sendJson(res, 400, { ok: false, error: 'room is required' });
                return;
            }
            sendJson(res, 200, { ok: true, room: room.code, eventCount: room.events.length });
        } catch (error) {
            sendJson(res, 400, { ok: false, error: error.message });
        }
        return;
    }

    if (req.method === 'POST' && url.pathname === '/events') {
        try {
            const payload = JSON.parse(await readBody(req) || '{}');
            const room = getRoom(payload.room);
            if (!room) {
                sendJson(res, 400, { ok: false, error: 'room is required' });
                return;
            }
            const event = addRoomEvent(room, payload);
            sendJson(res, 200, { ok: true, id: event.id });
        } catch (error) {
            sendJson(res, 400, { ok: false, error: error.message });
        }
        return;
    }

    sendJson(res, 404, { ok: false, error: 'not found' });
});

server.listen(port, '0.0.0.0', () => {
    console.log(`Futbol '99 multiplayer relay running at http://127.0.0.1:${port}/`);
});
