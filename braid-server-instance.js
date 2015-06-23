var express = require('express');
var path = require('path');

var factory = require('./braid-factory');
var BraidDb = require('./braid-db');
var EventBus = require('./braid-event-bus');
var MessageSwitch = require('./braid-message-switch');
var AuthServer = require('./braid-auth').AuthServer;
var RosterManager = require('./braid-roster').RosterManager;
var ClientSessionManager = require('./braid-clients').ClientSessionManager;
var FederationManager = require('./braid-federation').FederationManager;
var BotManager = require('./braid-bot').BotManager;

var WebSocketServer = require('ws').Server;
var http = require('http');

function BraidServer() {

}

BraidServer.prototype.initialize = function(config) {
	this.config = config;
};

BraidServer.prototype.start = function() {
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

		this.startServer();
	}.bind(this));
};

BraidServer.prototype.startServer = function() {
	if (this.config.client && this.config.client.enabled) {
		var clientPort = 25555;
		if (this.config.client.port) {
			clientPort = this.config.client.port;
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
			this.services.clientSessionManager.acceptSession(conn);
		}.bind(this));
	}
	if (this.config.federation && this.config.federation.enabled) {
		var federationPort = 25557;
		if (this.config.federation.port) {
			federationPort = this.config.federation.port;
		}
		var federationApp = express();
		federationApp.use(express.static(path.join(__dirname, 'public')));

		console.log("Listening for federation connections on port " + federationPort);
		var federationServer = http.createServer(federationApp);
		federationServer.listen(federationPort);

		var federationWss = new WebSocketServer({
			server : federationServer
		});
		federationWss.on('connection', function(conn) {
			this.services.federationManager.acceptFederationSession(conn);
		}.bind(this));
	}
}

module.exports = BraidServer;
