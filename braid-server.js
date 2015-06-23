#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var cliArgs = require("command-line-args");

var BraidServer = require('./braid-server-instance');

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
		var server = new BraidServer();
		server.initialize(config);
		server.start();
	});
}

start();

