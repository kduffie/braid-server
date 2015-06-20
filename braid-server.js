/**
 * This is the main entry point for the braid server.
 * 
 * The server is configured using a JSON-encoded configuration file. The path to that file must be provided as the only argument on the command line when
 * starting braid-server using node.
 * 
 * 
 */

var fs = require('fs');
var ws = require("nodejs-websocket");
var express = require('express');
var path = require('path');

var args = process.argv.slice(2);
var config = {};
var webServer;

function startServer() {
	if (config.web && config.web.enabled) {
		var httpPort = 8080;
		if (config.web.port) {
			httpPort = config.web.port;
		}
		var app = express();
		app.use(express.static(path.join(__dirname, 'public')));
		webServer = app.listen(httpPort);
	}
	var wsPort = 25555;
	if (config && config.client && config.client.port) {
		wsPort = config.client.port;
	}
	console.log("Creating websocket server on port " + wsPort);
	var server = ws.createServer(function(conn) {
		require('./braid-clients').acceptSession(conn);
	}).listen(wsPort);
}

function start() {
	if (!args || args.length === 0) {
		console.log("Missing configuration file argument");
		process.exit();
		return;
	}
	console.log("Reading configuration from " + args[0]);
	fs.readFile(args[0], 'utf8', function(err, data) {
		if (err) {
			console.log(err);
			process.exit();
		}
		config = JSON.parse(data);
		console.log("Configuration", config);
		if (!config.domain) {
			throw "You must specify a domain in the configuration";
		}
		require('./braid-db').initialize(config, function(err, braidDb) {
			if (err || !braidDb) {
				console.log("Error opening mongo.  Are you running mongo?");
				throw "Mongo error: " + err;
			}
			require('./braid-auth-server').initialize(config, braidDb);
			require('./braid-roster-manager').initialize(config, braidDb);
			require('./braid-clients').initialize(config);
			startServer();
		});
	});
}

start();
