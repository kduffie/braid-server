var async = require('async');
var BraidAddress = require('./braid-address').BraidAddress;
var newUuid = require('./braid-uuid');
var domainNameServer = require('./braid-name-service');
var WebSocket = require('ws');

var MAX_IDLE_PERIOD = 1000 * 60 * 10;

/*
 * A FederationSession object represents one websocket connection to another braid server.
 * 
 * Federation works by having either server open a socket to the other. That server then sends a 'federate' request over the socket containing a token. The
 * receiving server uses the from address on that message to open a new socket back to the originating server (thus ensuring its proper identity) and sends a
 * 'callback' request to authenticate using the token provided by the originating server. Assuming the originating server gives a positive reply, the socket is
 * then authenticated for domain-to-domain message exchanges in both directions.
 * 
 */

function FederationSession(manager) {
	this.config = manager.config;
	this.manager = manager;
	this.factory = manager.services.factory;
	this.messageSwitch = manager.services.messageSwitch;
	this.state = 'uninitialized';
	this.domainAddress = new BraidAddress(null, this.config.domain);
	this.lastActive = Date.now();
	this.id = newUuid();
	this.manager.sessionsById[this.id] = this;
	this.transmitQueue = [];
	this.foreignDomain = null;
}

FederationSession.prototype.toJSON = function() {
	return {
		domain : this.foreignDomain,
		type : this.type,
		state : this.state,
		id : this.id,
		lastActive : this.lastActive
	};
};

FederationSession.prototype.initializeBasedOnOutbound = function(domain, connection) {
	console.log("federation: opening federation-request connection to ", domain);
	this.type = 'outbound';
	this.connection = connection;
	this.foreignDomain = domain;
	this.initializeSocket();
	this.token = newUuid();
	this.manager.pendingTokensByDomain[domain] = this.token;
	var federateRequest = this.factory.newFederateMessage(this.token, new BraidAddress(null, domain, null), this.domainAddress);
	this.sendMessage(federateRequest);
	this.state = 'outbound-idle';
	// That should be it. The far end should close the socket once they
	// have the token and initiate a callback
};

FederationSession.prototype.initializeBasedOnInbound = function(connection) {
	console.log("federation: connection opened by remote");
	this.type = 'inbound';
	this.connection = connection;
	this.initializeSocket();
	this.state = 'unauthenticated';
};

FederationSession.prototype.initializeBasedOnFederationRequest = function(foreignDomain, token, connection) {
	console.log("federation: opening callback connection to " + foreignDomain);
	this.type = 'federation';
	this.connection = connection;
	this.initializeSocket();
	this.foreignDomain = foreignDomain;
	this.state = 'pending-callback';
	var callbackMessage = this.factory.newCallbackRequest(token, new BraidAddress(null, foreignDomain), this.domainAddress);
	this.pendingCallbackId = callbackMessage.id;
	this.sendMessage(callbackMessage);
};

FederationSession.prototype.initializeSocket = function() {
	this.connection.on("message", this.onSocketMessageReceived.bind(this));
	this.connection.on("close", this.onConnectionClosed.bind(this));
};

FederationSession.prototype.onSocketMessageReceived = function(msg) {
	this.lastActive = Date.now();
	var message = this.parseMessage(msg);
	if (!message) {
		return;
	}
	console.log("federation: RX (" + this.foreignDomain + ")", message);
	if (!message.type) {
		this.sendErrorResponseIfAppropriate(message, "Invalid message.  Missing type.", 400, true);
		return;
	}
	if (!message.request) {
		this.sendErrorResponseIfAppropriate(message, "Invalid message.  Missing request.", 400, true);
		return;
	}
	if (message.to) {
		if (!Array.isArray(message.to)) {
			message.to = [ message.to ];
		}
	}
	if (!message.from) {
		this.sendErrorResponseIfAppropriate(message, "Invalid message.  Missing from.", 400, true);
		return;
	}
	if (this.foreignDomain && message.from.domain !== this.foreignDomain) {
		this.sendErrorResponseIfAppropriate(message, "Message is not from negotiated domain.  Forwarding not acceptable.", 406, false);
		return;
	}
	if (message.request === 'hello') {
		this.federationHello = message;
		var package = require('./package.json');
		var reply = this.factory.newHelloReply(message, this.factory.newHelloPayload(package.product, package.version, this.config.federation.capabilities),
				this.domainAddress);
		this.sendMessage(reply);
	} else {
		try {
			switch (this.state) {
			case 'unauthenticated':
				switch (message.request) {
				case 'federate':
					this.handleFederateRequest(message);
					break;
				case 'callback':
					this.handleCallbackRequest(message);
					break;
				default:
					this.sendErrorResponseIfAppropriate(message, "Invalid message in this state (unauthenticated)", 400, true);
					break;
				}
				break;
			case 'outbound-idle':
				this.sendErrorResponseIfAppropriate(message, "Invalid message in this state (outbound-idle)", 400, true);
				break;
			case 'pending-callback':
				switch (message.type) {
				case 'reply':
					if (message.request === 'callback' && message.id === this.pendingCallbackId) {
						this.handleCallbackReply(message);
					}
					break;
				default:
					this.sendErrorResponseIfAppropriate(message, "Invalid message in this state (pending-callback)", 400, true);
					break;
				}
				break;
			case 'active':
				switch (message.type) {
				case 'request':
					switch (message.request) {
					case 'close':
						this.handleCloseRequest(message);
						return;
					}
					break;
				case 'cast':
					switch (message.request) {
					case 'presence':
						message.to = [ this.presenceHandlerAddress ];
						break;
					}
				}
				this.messageSwitch.deliver(message);
				break;
			case 'closing':
				switch (message.type) {
				case 'reply':
					switch (message.request) {
					case 'close':
						this.handleCloseReply(message);
						return;
					}
					break;
				}
				this.messageSwitch.deliver(message);
				break;
			default:
				this.sendErrorResponseIfAppropriate(message, "Invalid state", 400, true);
				break;
			}
		} catch (err) {
			console.error("federation.onSocketMessageReceived", err, err.stack);
			this.sendErrorResponseIfAppropriate(message, "Internal error: " + err, 500, true);
		}
	}
};

FederationSession.prototype.handleCloseRequest = function(message) {
	this.deactivateSession();
	setTimeout(function() {
		var reply = this.factory.newReply(message, this.domainAddress);
		this.sendMessage(reply);
	}.bind(this), 500);
};

FederationSession.prototype.handleCloseReply = function(message) {
	this.close();
};

FederationSession.prototype.handleCallbackReply = function(message) {
	this.activateSession(message.from.domain);
};

FederationSession.prototype.activateSession = function(domain) {
	console.log("federation: activating session with " + domain);
	this.foreignDomain = domain;
	this.state = 'active';
	this.manager.activeSessionsByDomain[domain] = this;
	delete this.manager.pendingTokensByDomain[domain];
	var pendingTransmits = this.manager.pendingTransmitQueuesByDomain[domain];
	if (pendingTransmits) {
		for (var i = 0; i < pendingTransmits.length; i++) {
			this.sendMessage(pendingTransmits[i]);
		}
		delete this.manager.pendingTransmitQueuesByDomain[domain];
	}
};

FederationSession.prototype.deactivateSession = function() {
	console.log("federation: deactivating session with " + this.foreignDomain);
	this.state = 'closed';
	if (this.foreignDomain) {
		delete this.manager.activeSessionsByDomain[this.foreignDomain];
	}
};

FederationSession.prototype.handleFederateRequest = function(message) {
	if (this.type !== 'inbound') {
		this.sendErrorResponseIfAppropriate(message, "Invalid message on socket we initiated", 400, true);
		return;
	}
	var token = null;
	if (message.data) {
		token = message.data.token;
	}
	if (token) {
		// Now we have a token. We will now close our connection, and initiate
		// a new outbound connection with the token
		console.log("federation: opening callback connection to " + message.from.domain);
		var connectionUrl = domainNameServer.resolveServer(message.from.domain);
		console.log("federation: using URL " + connectionUrl);
		var ws = new WebSocket(connectionUrl);
		ws.on('open', function() {
			var session = new FederationSession(this.manager);
			session.initializeBasedOnFederationRequest(message.from.domain, token, ws);
		}.bind(this));
		ws.on('error', function(err) {
			console.warn("Unable to establish connection to foreign domain: " + domain, err);
			delete this.manager.pendingTransmitQueuesByDomain[domain];
		}.bind(this));
		var reply = this.factory.newReply(message, this.domainAddress);
		this.sendMessage(reply);
		setTimeout(this.close().bind(this), 300);
	} else {
		this.sendErrorResponseIfAppropriate(message, "Invalid federate request.  Missing token.", 400, false);
	}
};

FederationSession.prototype.handleCallbackRequest = function(message) {
	if (this.type !== 'inbound') {
		this.sendErrorResponseIfAppropriate(message, "Invalid message on socket we initiated", 400, true);
		return;
	}
	var token;
	if (message.data) {
		token = message.data.token;
	}
	var domain = message.from.domain;
	var pendingToken = this.manager.pendingTokensByDomain[domain];
	if (pendingToken && pendingToken === token) {
		this.sendMessage(this.factory.newReply(message, this.domainAddress, new BraidAddress(null, domain)));
		this.activateSession(domain);
	} else {
		this.sendErrorResponseIfAppropriate(message, "This is not a valid federation token", 401, true);
	}
};

FederationSession.prototype.parseMessage = function(text) {
	try {
		var message = JSON.parse(text);
		return message;
	} catch (err) {
		console.warn("federation.parseMessage error", err, err.stack);
		this.sendError(null, "Invalid JSON: " + err, 400, true);
	}
};

FederationSession.prototype.sendErrorResponseIfAppropriate = function(message, errorMessage, errorCode, close) {
	if (message.type === 'request' || message.type === 'cast') {
		var reply = this.factory.newErrorReply(message, errorCode, errorMessage);
		this.sendMessage(reply, function() {
			if (close) {
				this.close();
			}
		}.bind(this));
	}
};

FederationSession.prototype.sendMessage = function(message, callback) {
	this.lastActive = Date.now();
	this.transmitQueue.push({
		message : message,
		callback : callback
	});
	this.kickTransmit();
};

FederationSession.prototype.sendBinary = function(buffer, callback) {
	this.transmitQueue.push({
		buffer : buffer,
		callback : callback
	});
	this.kickTransmit();
};

FederationSession.prototype.kickTransmit = function() {
	if (!this.transmitInProgress && this.transmitQueue.length > 0) {
		this.transmitInProgress = true;
		var pendingItem = this.transmitQueue.shift();
		if (pendingItem.message) {
			console.log("federation: TX (" + this.foreignDomain + ")", pendingItem.message);
			this.connection.send(JSON.stringify(pendingItem.message), function() {
				if (pendingItem.callback) {
					pendingItem.callback();
				}
				this.transmitInProgress = false;
				process.nextTick(this.kickTransmit.bind(this));
			}.bind(this));
		} else {
			this.connection.sendBinary(pendingItem.buffer, function() {
				if (pendingItem.callback) {
					pendingItem.callback();
				}
				this.transmitInProgress = false;
				process.nextTick(this.kickTransmit.bind(this));
			}.bind(this));
		}
	}
};

FederationSession.prototype.closeBecauseIdle = function() {
	console.log('federation: closing connection with ' + this.foreignDomain + ' because idle');
	if (this.foreignDomain) {
		this.state = 'closing';
		var message = this.factory.newCloseRequest(new BraidAddress(null, this.foreignDomain), this.domainAddress);
		this.sendMessage(message);
	} else {
		this.close();
	}
};

FederationSession.prototype.close = function() {
	this.finalize();
};

FederationSession.prototype.finalize = function() {
	console.log("federation: closing connection with " + this.foreignDomain);
	this.state = 'closed';
	delete this.manager.sessionsById[this.id];
	if (this.foreignDomain) {
		delete this.manager.activeSessionsByDomain[this.foreignDomain];
	}
	eventBus.fire('federation-session-closed', this);
};

FederationSession.prototype.onConnectionError = function(err) {
	console.log(this, "onConnectionError", err);
};

FederationSession.prototype.onBinaryReceived = function(inStream) {
	console.log(this, "onBinaryReceived");
};

FederationSession.prototype.onConnectionClosed = function(code, reason) {
	console.log(this, "onConnectionClosed", code, reason);
	this.finalize();
};

function FederationManager() {

}

FederationManager.prototype.initialize = function(configuration, services) {
	console.log("federation: initializing");
	this.config = configuration;
	this.services = services;
	this.factory = services.factory;
	this.messageSwitch = services.messageSwitch;

	this.pendingTransmitQueuesByDomain = {};
	this.sessionsById = {};
	this.activeSessionsByDomain = {};

	this.pendingTokensByDomain = {};

	this.presenceHandlerAddress = new BraidAddress(null, this.config.domain, "!roster");
	this.messageSwitch.registerForeignDomains(this.config.domain, this._handleSwitchedMessage.bind(this));
	setInterval(function() {
		var now = Date.now();
		var toClose = [];
		for (id in this.sessionsById) {
			if (this.sessionsById.hasOwnProperty(id)) {
				if (now - this.sessionsById[id].lastActive > MAX_IDLE_PERIOD) {
					toClose.push(id);
				}
			}
		}
		for (var i = 0; i < toClose.length; i++) {
			console.log("Closing federation session to " + this.sessionsById.foreignDomain + " because IDLE");
			this.sessionsById[toClose[i]].closeBecauseIdle();
		}
	}.bind(this), 60000);
}

FederationManager.prototype.acceptFederationSession = function(connection) {
	var session = new FederationSession(this);
	session.initializeBasedOnInbound(connection);
};

FederationManager.prototype.initiateFederation = function(domain) {
	// We open a websocket to the server responsible for that domain. If they
	// answer, we just provide a token that will be used to authenticate on
	// a callback connection
	var connectionUrl = domainNameServer.resolveServer(domain);
	var session = new FederationSession();
	console.log("federation: initiating connection to " + domain + " at " + connectionUrl);
	var ws = new WebSocket(connectionUrl);
	ws.on('open', function() {
		session.initializeBasedOnOutbound(domain, ws);
	});
	ws.on('error', function(err) {
		console.warn("Unable to establish connection to foreign domain: " + domain, err);
		delete this.pendingTransmitQueuesByDomain[domain];
	});
};

FederationManager.prototype._handleSwitchedMessage = function(message) {
	if (message.from.domain !== this.config.domain) {
		// Ignore messages unless they originated on our domain
		return;
	}
	var domains = [];
	for (var i = 0; i < message.to.length; i++) {
		var domain = message.to[i].domain;
		if (domains.indexOf(domain) < 0) {
			domains.push(domain);
		}
	}
	for (var i = 0; i < domains.length; i++) {
		var domain = domains[i];
		var session = this.activeSessionsByDomain[domain];
		if (session) {
			session.sendMessage(message);
		} else {
			// No active session, so we'll look for a pending transmit queue
			var queue = this.pendingTransmitQueuesByDomain[domain];
			if (queue) {
				// There is already a queue, meaning that we're already waiting
				// for a session to be completed, so we just add to that queue
				queue.push(message);
			} else {
				console.log("federation:  New domain connection required", message);
				// There's no queue, so we need to initiate a new connection,
				// understanding that they are just then going to call us back,
				// at which point we will process the pending queue at that point
				queue = [ message ];
				this.pendingTransmitQueuesByDomain[domain] = queue;
				this.manager.initiateFederation(domain);
			}
		}
	}
};

var clientCapabilities = {
	v : 1,
	delivery : {
		v : 1
	}
};

var federationCapabilities = {
	v : 1,
	delivery : {
		v : 1
	}
};

module.exports = {
	clientCapabilities : clientCapabilities,
	federationCapabilities : federationCapabilities,
	FederationManager : FederationManager
};