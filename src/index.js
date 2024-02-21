import process from 'node:process';
import { URL } from 'node:url';
import { Client, GatewayIntentBits } from 'discord.js';
import { loadCommands, loadEvents } from './util/loaders.js';
import { registerEvents } from './util/registerEvents.js';
import express from 'express';
import session from 'express-session';
import crypto from 'crypto';
import * as db from './util/db.js';
import * as oauth from './util/oauth.js';

async function getIpData(ip) {
    const query = await fetch(`https://proxycheck.io/v2/${ip}&short=1&vpn=3`);
    const data = await query.json();
    return data;
}




// Initialize the Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Initizalize the Express server
const app = express();
const port = 3113;

// Connect to the database (connection pooling)

// Load the events and commands
const events = await loadEvents(new URL('events/', import.meta.url));
const commands = await loadCommands(new URL('commands/', import.meta.url));

// Register the event handlers
registerEvents(commands, events, client);

// Login to the client
void client.login(process.env.DISCORD_TOKEN);

const secret = crypto.randomBytes(64).toString('hex');
const authURL = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&scope=identify&state=`

app.use(session({
    secret: secret,
    resave: false,
    saveUninitialized: true
}));

app.get("/login", (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    console.log(state);
    req.session.state = state;
    res.redirect(authURL + state);

});

app.get("/callback", async (req, res) => {
    const ip = process.env.TEST_IP.toString();
    console.log(process.env.TEST_IP.toString());
    if (req.query.code === undefined) {
        res.status(401).send('Unauthorized');
        return;
    }
    const callbackState = req.query.state;
    console.log(callbackState);

    if (callbackState === req.session.state) {
        const token = await oauth.getToken(req.query.code);
        const user = await oauth.getUserData(token);
        console.log(user.id);
        const id = user.id;
        await oauth.invalidateToken(token);

        const ipData = await getIpData(process.env.TEST_IP);
        console.log(ipData);
        if (ipData.proxy === "yes" || ipData.vpn === "yes" || ipData.type === "TOR") {
            res.send("flagged");
            return;
        }
        if (await db.checkIp(ip)) {
            console.log('ip in db');
            res.send("flagged");
            return;
        }
        await db.setData(id, ip)
        res.send("passed");
    }
    else {
        res.status(401).send('OAuth callback failed.');
    }
});

app.listen(port, () => {
    console.log(`Listening on port ${port}...`);
});

