const log = require("debug")("pow:server");

import express from "express"

import bsv from "bsv"

import compression from "compression"
import mustacheExpress from "mustache-express"
import bodyParser from "body-parser"

import { connect } from "./db"
import * as helpers from "./helpers"

import * as views from "./views"

function getip(req) {
    return req.headers['x-forwarded-for'] || req.connection.remoteAddress;
}

export async function start(port=8000) {

    const app = express();

    app.use(express.static(__dirname + "/../public"))
    app.use(compression());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());
    app.engine('html', mustacheExpress());
    app.set('view engine', 'html');
    app.set('views', __dirname + '/../views');

    app.get('/api/mined', async function(req, res) {
        log(`/api/mined request from ${getip(req)}`);
        const db = await connect();
        let view = await views.dashboard({}, db);
        view = await views.mined(view, db);
        const response = helpers.apiify(view.mined);
        db.close();
        return res.json({
            bsvusd: view.bsvusd,
            magicnumbers: response
        });
    });

    app.get('/api/unmined', async function(req, res) {
        log(`/api/unmined request from ${getip(req)}`);
        const db = await connect();
        let view = await views.dashboard({}, db);
        view = await views.unmined(view, db);
        const response = helpers.apiify(view.unmined);
        db.close();
        return res.json({
            bsvusd: view.bsvusd,
            magicnumbers: response
        });
    });

    app.get('/api', async function(req, res) {
        log(`/api request from ${getip(req)}`);
        const db = await connect();
        let view = await views.dashboard({}, db);
        view = await views.all(view, db);
        const response = helpers.apiify(view.mined);
        db.close();
        return res.json({
            bsvusd: view.bsvusd,
            magicnumbers: response
        });
    });

    app.get('/mined', async function(req, res) {
        log(`/mined request from ${getip(req)}`);
        const db = await connect();
        let view = await views.dashboard({}, db);
        view = await views.mined(view, db);
        db.close();
        res.render('mined', view);
    });

    app.get('/unmined', async function(req, res) {
        log(`/unmined request from ${getip(req)}`);
        const db = await connect();
        let view = await views.dashboard({}, db);
        view = await views.unmined(view, db);
        db.close();
        res.render('unmined', view);
    });

    app.get('/:hash', async function(req, res) {
        const hash = req.params.hash;
        log(`/${hash} request from ${getip(req)}`);

        const db = await connect();
        const tx = await db.collection("magicnumbers").findOne({"txid": hash});
        db.close();
        if (tx) {
            res.render('tx', await views.tx(tx, hash));
        } else {
            res.render('hash', await views.hash(hash));
        }
    });

    app.get('/', async function(req, res) {
        log(`/ request from ${getip(req)}`);
        res.render('index', await views.homepage());
    });

    log(`starting server at http://localhost:${port}`);

    return app.listen(port);
}


start();
