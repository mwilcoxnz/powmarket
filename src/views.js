import * as timeago from "timeago.js"

import * as helpers from "./helpers"
const database = require("./db");
const connect = database.connect;

const BAD_EMOJIS = ["👎", "😠"];

function processMagicNumber(m, view) {

    let bsvusd;

    if (m.mined_bsvusd) {
        bsvusd = m.mined_bsvusd;
    } else {
        bsvusd = view.bsvusd;
    }

    m.display_date = timeago.format(m.created_at * 1000);
    m.display_mined_date = timeago.format((m.mined_at || m.created_at) * 1000);
    m.display_value = helpers.satoshisToDollars(m.value, bsvusd);
    m.display_magicnumber = (m.magicnumber.length > 10 ? m.magicnumber.substr(0, 10) + "..." : m.magicnumber);
    return m;
}

function process({ tx, bsvusd, type, header }) {

    if (tx.mined_bsvusd) {
        tx.bsvusd = helpers.satoshisToDollars(tx.value, tx.mined_bsvusd);
    } else {
        tx.bsvusd = helpers.satoshisToDollars(tx.value, bsvusd);
    }

    tx = processMagicNumber(tx, { bsvusd });

    if (tx.mined_at) {
        tx.mined_in = helpers.humanReadableInterval(Math.floor(((tx.mined_at - tx.created_at) * 100)) / 100);
    }

    tx.type = type;
    tx.header = header;
    if (tx.mined_number) {
        tx.power = helpers.countpow(tx.mined_number, tx.magicnumber);
    }

    if (!tx.emoji) {
        tx.emoji = null;
    }

    if (!tx.mined_number) {
        tx.mined_number = null;
    }

    return tx;
}



export async function dashboard(view={}) {
    if (!database.db) { throw new Error("expected db") }

    if (!view.bsvusd) {
        view.bsvusd = await helpers.bsvusd();
    }

    const unmined_num = await database.db.collection("magicnumbers").find({"mined": false}).count();

    let mined_num = 0, mined_earnings = 0;
    const mined = await database.db.collection("magicnumbers").find({"mined": true}, {"value": 1, "mined_bsvusd": 1}).toArray();
    for (const m of mined) {
        mined_earnings += Number(helpers.satoshisToDollars(m.value, m.mined_bsvusd));
        mined_num += 1;
    }

    mined_earnings = Math.floor(mined_earnings * 100) / 100;
    
    const unmined_satoshis = (await database.db.collection("magicnumbers").aggregate([{"$match": {mined: false}}, {"$group": {_id: null, "amount": {"$sum": "$value"}}}]).toArray())[0].amount;

    return Object.assign(view, {
        "dashboard": {
            mined_num: helpers.numberWithCommas(mined_num),
            mined_earnings,
            unmined_num: helpers.numberWithCommas(unmined_num),
            unmined_earnings: helpers.satoshisToDollars(unmined_satoshis, view.bsvusd)
        }
    });
}


export async function all(view={}, limit=10000) {
    if (!database.db) { throw new Error("expected db") }

    if (!view.bsvusd) {
        view.bsvusd = await helpers.bsvusd();
    }

    const recentlyMined = await (database.db.collection("magicnumbers").find({}).sort({"created_at": -1}).limit(limit).toArray());

    view.mined = recentlyMined.map(m => {
        return processMagicNumber(m, view);
    });

    return view;
}


export async function mined(view={}, limit=10000) {

    if (!view.bsvusd) {
        view.bsvusd = await helpers.bsvusd();
    }

    const recentlyMined = await (database.db.collection("magicnumbers").find({"mined": true}).sort({"mined_at": -1}).limit(limit).toArray());

    view.mined = recentlyMined.map(m => {
        return processMagicNumber(m, view);
    });

    return view;
}

export async function unmined(view={}, limit=10000, sortby=null) {
    if (!database.db) { throw new Error("expected db") }

    if (!view.bsvusd) {
        view.bsvusd = await helpers.bsvusd();
    }

    const sort = {};
    if (sortby === "profitable") {
        sort["value"] = -1;
    } else {
        sort["created_at"] = -1;
    }

    const pending = await (database.db.collection("magicnumbers").find({"mined": false}).sort(sort).limit(limit).toArray());

    view.unmined = pending.map(m => {
        return processMagicNumber(m, view);
    });

    return view;
}


export async function blockviz(view={}) {
    if (!database.db) { throw new Error("expected db") }

    const now = Math.floor((new Date()).getTime() / 1000);
    const interval = 86400 / 16;
    const num = 112;

    let before = now - (interval * num);
    const txs = await database.db.collection("magicnumbers").find({"created_at": {"$gte": before}}).sort({"created_at": 1}).toArray();

    let buckets = [];
    while (before < now) {

        let after = before + interval;
        let bucket = [];

        while (txs.length && (txs[0].created_at < after)) {
            const tx = txs.shift();
            bucket.push({
                mined: tx.mined,
                power: tx.magicnumber.length,
                txid: tx.txid,
            });
        }

        buckets.push(bucket);

        before += interval;
    }

    return Object.assign(view, {
        blockviz: buckets
    });
}

export async function homepage(view={}) {
    if (!database.db) { throw new Error("expected db") }

    const now = Date.now();

    console.log("ts 1", Date.now() - now)

    console.log("ts 2", Date.now() - now)
    const bsvusd = await helpers.bsvusd();
    if (!bsvusd) { throw new Error(`expected bsvusd to be able to price homepage`) }

    view.bsvusd = bsvusd;

    console.log("ts 3", Date.now() - now)
    view = await blockviz(view);
    console.log("ts 4", Date.now() - now)

    view = await dashboard(view);
    console.log("ts 5", Date.now() - now)

    view.num = 20;
    view = await mined(view);
    console.log("ts 6", Date.now() - now)

    view.num = 10;
    view = await unmined(view);
    console.log("ts 7", Date.now() - now)

    return view;
}


export async function tx({ tx, hash, type, header }) {
    if (!database.db) { throw new Error("expected db") }

    const bsvusd = await helpers.bsvusd();
    if (!bsvusd) { throw new Error(`expected bsvusd to be able to price homepage`) }

    tx = process({ tx, bsvusd, hash, type, header });

    const txs = (await database.db.collection("magicnumbers").find({
        "$or": [
            {"target": tx.txid},
            {"target": tx.mined_number},
        ]
    }).limit(10).toArray()).filter(t => {
        return t.txid !== tx.txid;
    }).map(t => {
        return process({ tx: t, bsvusd, type, hash, header });
    });

    if (txs.length > 0) {
        tx.txs = txs;
    }

    const powers = [];
    powers.push({ power: tx.power, polarity: (BAD_EMOJIS.indexOf(tx.emoji) >= 0 ? -1 : 1)});

    for (const t of txs) {
        powers.push({ power: t.power, polarity: (BAD_EMOJIS.indexOf(t.emoji) >= 0 ? -1 : 1)});
    }

    tx.power = Math.floor(helpers.aggregatepower(powers) * 100) / 100;

    return tx;
}

export async function txs({ txs, hash, type, header }) {
    if (!database.db) { throw new Error("expected db") }

    const bsvusd = await helpers.bsvusd();
    if (!bsvusd) { throw new Error(`expected bsvusd to be able to price homepage`) }

    const powers = [];

    for (let tx of txs) {
        tx = processMagicNumber(tx, { bsvusd });

        if (tx.mined_bsvusd) {
            tx.bsvusd = helpers.satoshisToDollars(tx.value, tx.mined_bsvusd);
        } else {
            tx.bsvusd = helpers.satoshisToDollars(tx.value, bsvusd);
        }

        if (tx.mined_at) {
            tx.mined_in = helpers.humanReadableInterval(Math.floor(((tx.mined_at - tx.created_at) * 100)) / 100);
        }

        tx.type = type;
        tx.header = header;
        if (tx.mined_number) {
            tx.power = helpers.countpow(tx.mined_number, tx.magicnumber);
            powers.push({ power: tx.power, polarity: (BAD_EMOJIS.indexOf(tx.emoji) >= 0 ? -1 : 1)});
        }
    }


    const aggregatepower = Math.floor(helpers.aggregatepower(powers) * 100) / 100;

    return {
        aggregatepower,
        txs,
        hash,
        header,
        type,
    };
}


