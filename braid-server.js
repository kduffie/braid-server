/**
 * This is the main entry point for the braid server.
 * 
 * The server is configured using a JSON-encoded configuration file. The path to that file must be provided as the only argument on the command line when
 * starting braid-server using node.
 * 
 * 
 */

var fs = require('fs');
var express = require('express');
var path = require('path');

var WebSocketServer = require('ws').Server;
var http = require('http');

var args = process.argv.slice(2);
var config = {};

function startServer() {
	if (config.client && config.client.enabled) {
		var clientPort = 25555;
		if (config.client.port) {
			clientPort = config.client.port;
		}
		var clientApp = express();
		clientApp.use(express.static(path.join(__dirname, 'public')));

		var clientServer = http.createServer(clientApp);
		clientServer.listen(clientPort);

		var clientWss = new WebSocketServer({
			server : clientServer
		});
		clientWss.on('connection', function(conn) {
			require('./braid-clients').acceptSession(conn);
		});
	}
	if (config.federation && config.federation.enabled) {
		var federationPort = 25557;
		if (config.federation.port) {
			federationPort = config.federation.port;
		}
		var federationApp = express();

		var federationServer = http.createServer(federationApp);
		federationServer.listen(federationPort);

		var federationWss = new WebSocketServer({
			server : federationServer
		});
		federationWss.on('connection', function(conn) {
			require('./braid-federation').acceptFederationSession(conn);
		});
	}
}

function start() {
	var configPath = path.join(__dirname, 'config.json');
	if (args && args.length > 0) {
		configPath = args[0];
	}
	console.log("Reading configuration from " + configPath);
	fs.readFile(configPath, 'utf8', function(err, data) {
		if (err) {
			console.log(err);
			process.exit();
		}
		config = JSON.parse(data);
		console.log("Braid server initializing for domain: " + config.domain);
		console.log("Configuration", config);
		if (!config.domain) {
			throw "You must specify a domain in the configuration";
		}
		config.client = {
			capabilities : {
				register : {
					v : 1
				},
				auth : {
					v : 1
				},
				presence : {
					v : 1
				}
			}
		};
		config.federation = {
			capabilities : {
				federate : {
					v : 1
				},
				callback : {
					v : 1
				}
			}
		};
		require('./braid-db').initialize(config, function(err, braidDb) {
			if (err || !braidDb) {
				console.log("Error opening mongo.  Are you running mongo?");
				throw "Mongo error: " + err;
			}
			require('./braid-auth-server').initialize(config, braidDb);
			require('./braid-roster-manager').initialize(config, braidDb);
			require('./braid-clients').initialize(config);
			require('./braid-federation').initialize(config);
			startServer();
		});
	});
}

start();
