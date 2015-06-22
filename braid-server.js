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
var cliArgs = require("command-line-args");

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

		console.log("Listening for client connections on port " + clientPort);
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

		console.log("Listening for federation connections on port " + federationPort);
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

	/* define the command-line options */
	var cli = cliArgs([ {
		name : "help",
		alias : "h",
		type : Boolean,
		description : "Print usage instructions"
	}, {
		name : "domain",
		alias : "d",
		type : String,
		defaultOption : true,
		description : "Domain (e.g., 'example.org'"
	}, {
		name : "config",
		alias : "c",
		type : String,
		description : "Path to a configuration file (based on config.json)"
	} ]);

	/* parse the supplied command-line values */
	var options = cli.parse();

	/* generate a usage guide */
	var usage = cli.getUsage({
		header : "Braid Server: a federated collaboration server",
		footer : "For more information, visit http://braid.io"
	});

	if (options.help || (!options.domain && !options.config)) {
		console.log(usage);
		process.exit();
	}

	var configPath = path.join(__dirname, 'config.json');
	if (options.config) {
		configPath = options.config;
	}
	console.log("Reading configuration from " + configPath);
	fs.readFile(configPath, 'utf8', function(err, data) {
		if (err) {
			console.log(err);
			process.exit();
		}
		config = JSON.parse(data);
		if (options.domain) {
			config.domain = options.domain;
		}
		if (!config.mongo.mongoUrl) {
			throw "Invalid configuration.  mongo.mongoUrl is mandatory";
		}
		config.mongo.mongoUrl = config.mongo.mongoUrl.replace("{domain}", config.domain.replace(".", "_"));
		console.log("Braid server initializing for domain: " + config.domain);
		console.log("Configuration", config);
		if (!config.domain) {
			throw "You must specify a domain in the configuration";
		}
		config.client.capabilities = {
			auth : require('./braid-auth').clientCapabilities,
			roster : require('./braid-roster').clientCapabilities,
			federation : require('./braid-federation').clientCapabilities
		};
		config.federation.capabilities = {
			auth : require('./braid-auth').federationCapabilities,
			roster : require('./braid-roster').federationCapabilities,
			federation : require('./braid-federation').federationCapabilities
		};
		require('./braid-db').initialize(config, function(err, braidDb) {
			if (err || !braidDb) {
				console.log("Error opening mongo.  Are you running mongo?");
				throw "Mongo error: " + err;
			}
			require('./braid-auth').initialize(config, braidDb);
			require('./braid-roster').initialize(config, braidDb);
			require('./braid-clients').initialize(config);
			require('./braid-federation').initialize(config);
			require('./braid-client-bot').initialize(config);
			startServer();
		});
	});
}

start();
