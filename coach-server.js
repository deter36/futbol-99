const http = require('http');
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) continue;
        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();
        if (!key || process.env[key] !== undefined) continue;
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    }
}

loadEnvFile(path.join(__dirname, '.env'));

const port = Number(process.env.COACH_PORT || 8790);
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const apiKey = process.env.OPENAI_API_KEY;
const systemPromptPath = path.join(__dirname, 'coach-system-prompt.md');

function readSystemPrompt() {
    try {
        return fs.readFileSync(systemPromptPath, 'utf8');
    } catch (error) {
        return "Choose exactly one legal Futbol '99 option. Return only JSON with choice and reason.";
    }
}

function sendJson(res, status, body) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(body));
}

function collectBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 1_000_000) {
                reject(new Error('request body too large'));
                req.destroy();
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function extractJson(text) {
    if (!text) throw new Error('empty model response');
    try {
        return JSON.parse(text);
    } catch (error) {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw error;
        return JSON.parse(match[0]);
    }
}

async function askOpenAI(payload) {
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: readSystemPrompt() },
                {
                    role: 'user',
                    content: JSON.stringify(payload, null, 2)
                }
            ]
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = extractJson(content);
    const choice = Number(parsed.choice);
    if (!Number.isInteger(choice)) {
        throw new Error(`model did not return an integer choice: ${content}`);
    }
    return {
        choice,
        reason: String(parsed.reason || '').slice(0, 300)
    };
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return;
    }

    if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, {
            ok: true,
            model,
            hasApiKey: Boolean(apiKey)
        });
        return;
    }

    if (req.method !== 'POST' || req.url !== '/coach-choice') {
        sendJson(res, 404, { error: 'Not found' });
        return;
    }

    try {
        const rawBody = await collectBody(req);
        const payload = JSON.parse(rawBody || '{}');
        if (!Array.isArray(payload.legal_options) || payload.legal_options.length === 0) {
            sendJson(res, 400, { error: 'legal_options are required' });
            return;
        }

        const result = await askOpenAI(payload);
        const legalChoice = payload.legal_options.some(option => Number(option.choice) === result.choice);
        if (!legalChoice) {
            sendJson(res, 422, {
                error: `model chose unavailable option ${result.choice}`,
                result
            });
            return;
        }
        sendJson(res, 200, result);
    } catch (error) {
        sendJson(res, 500, {
            error: error.message
        });
    }
});

server.listen(port, '127.0.0.1', () => {
    console.log(`Futbol '99 coach server running at http://127.0.0.1:${port}/`);
    console.log(`Model: ${model}`);
    console.log(apiKey ? 'OPENAI_API_KEY loaded.' : 'OPENAI_API_KEY is not set yet.');
});
