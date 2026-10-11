const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = "SuaSenhaSuperSegura123"; // <--- Altere essa senha depois!

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./luauverify.db', (err) => {
    if (err) console.error("Erro banco:", err.message);
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY,
            username TEXT,
            status TEXT DEFAULT 'pending',
            firstSeen DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT,
            username TEXT,
            placeId TEXT,
            jobId TEXT,
            executor TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

app.post('/api/verify', (req, res) => {
    const { username, userId, placeId, jobId, executor } = req.body;

    if (!userId || !username) {
        return res.status(400).json({ error: "Dados incompletos" });
    }

    const uId = String(userId);

    db.run(
        `INSERT INTO logs (userId, username, placeId, jobId, executor) VALUES (?, ?, ?, ?, ?)`,
        [uId, username, String(placeId), String(jobId), String(executor)]
    );

    db.get(`SELECT * FROM users WHERE userId = ?`, [uId], (err, user) => {
        if (err) return res.status(500).json({ error: "Erro interno" });

        if (!user) {
            db.run(
                `INSERT INTO users (userId, username, status) VALUES (?, ?, 'pending')`,
                [uId, username]
            );
            return res.json({ status: "pending" });
        } else {
            db.run(`UPDATE users SET username = ? WHERE userId = ?`, [username, uId]);
            return res.json({ status: user.status });
        }
    });
});

const authMiddleware = (req, res, next) => {
    const key = req.headers['x-admin-key'];
    if (key === ADMIN_KEY) return next();
    res.status(401).json({ error: "Chave inválida" });
};

app.get('/api/admin/data', authMiddleware, (req, res) => {
    db.all(`SELECT * FROM users ORDER BY firstSeen DESC`, [], (err, users) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.all(`SELECT * FROM logs ORDER BY timestamp DESC LIMIT 50`, [], (err, logs) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ users, logs });
        });
    });
});

app.post('/api/admin/set-status', authMiddleware, (req, res) => {
    const { userId, status } = req.body;
    if (!['whitelisted', 'blacklisted', 'pending'].includes(status)) {
        return res.status(400).json({ error: "Status inválido" });
    }

    db.run(`UPDATE users SET status = ? WHERE userId = ?`, [status, String(userId)], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.listen(PORT, () => console.log(`LuauVerify online na porta ${PORT}`));
