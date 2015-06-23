var express = require('express');
var path = require('path');

var factory = require('./braid-factory');
var BraidDb = require('./braid-db');
var EventBus = require('./braid-event-bus');
var MessageSwitch = require('./braid-message-switch');
var AuthServer = require('./braid-auth').AuthServer;
var RosterManager = require('./braid-roster').RosterManager;
var ClientSessionManager = require('./braid-client-sessions').ClientSessionManager;
var FederationManager = require('./braid-federation').FederationManager;
var BotManager = require('./braid-bot').BotManager;

var WebSocketServer = require('ws').Server;
var http = require('http');

function BraidServer() {

}

BraidServer.prototype.initialize = function(config) {
	this.config = config;
};

BraidServer.prototype.start = function(callback) {
	var braidDb = new BraidDb();
	braidDb.initialize(this.config, function(err) {
		if (err) {
			console.log("Error opening mongo.  Are you running mongo?");
			throw "Mongo error: " + err;
		}
		var eventBus = new EventBus();
		var messageSwitch = new MessageSwitch();
		var authServer = new AuthServer();
		var rosterManager = new RosterManager();
		var clientSessionManager = new ClientSessionManager();
		var federationManager = new FederationManager();
		var botManager = new BotManager();
		this.services = {
			factory : factory,
			braidDb : braidDb,
			eventBus : eventBus,
			messageSwitch : messageSwitch,
			authServer : authServer,
			rosterManager : rosterManager,
			clientSessionManager : clientSessionManager,
			federationManager : federationManager,
			botManager : botManager
		};
		eventBus.initialize(this.config, this.services);
		messageSwitch.initialize(this.config, this.services);
		authServer.initialize(this.config, this.services);
		rosterManager.initialize(this.config, this.services);
		clientSessionManager.initialize(this.config, this.services);
		federationManager.initialize(this.config, this.services);
		botManager.initialize(this.config, this.services);

		this.startServer(callback);
	}.bind(this));
};

BraidServer.prototype.startServer = function(callback) {
	if (this.config.client && this.config.client.enabled) {
		var clientPort = 25555;
		if (this.config.client.port) {
			clientPort = this.config.client.port;
		}
		this.clientApp = express();
		this.clientApp.use(express.static(path.join(__dirname, 'public')));

		console.log("Listening for client connections on port " + clientPort);
		this.clientServer = http.createServer(this.clientApp);
		this.clientServer.listen(clientPort);

		var clientWss = new WebSocketServer({
			server : this.clientServer
		});
		clientWss.on('connection', function(conn) {
			this.services.clientSessionManager.acceptSession(conn);
		}.bind(this));
	}
	if (this.config.federation && this.config.federation.enabled) {
		var federationPort = 25557;
		if (this.config.federation.port) {
			federationPort = this.config.federation.port;
		}
		this.federationApp = express();
		this.federationApp.use(express.static(path.join(__dirname, 'public')));

		console.log("Listening for federation connections on port " + federationPort);
		this.federationServer = http.createServer(this.federationApp);
		this.federationServer.listen(federationPort);

		var federationWss = new WebSocketServer({
			server : this.federationServer
		});
		federationWss.on('connection', function(conn) {
			this.services.federationManager.acceptFederationSession(conn);
		}.bind(this));
	}
	callback();
}

BraidServer.prototype.shutdown = function(callback) {
	this.services.clientSessionManager.shutdown();
	this.services.federationManager.shutdown();
	this.clientServer.close();
	this.federationServer.close();
	this.services.braidDb.close(callback);
};

module.exports = BraidServer;
