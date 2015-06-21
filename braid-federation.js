var async = require('async');
var BraidAddress = require('./braid-address').BraidAddress;
var factory = require('./braid-factory');
var newUuid = require('./braid-uuid');
var messageSwitch = require('./braid-message-switch');
var eventBus = require('./braid-event-bus');
var domainNameServer = require('./braid-name-service');
var WebSocket = require('ws');

var config;

var pendingTransmitQueuesByDomain = {};
var sessionsById = {};
var activeSessionsByDomain = {};

var pendingTokensByDomain = {};

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

function FederationSession() {
	this.state = 'uninitialized';
	this.domainAddress = new BraidAddress(null, config.domain);
	this.lastActive = Date.now();
	this.id = newUuid();
	sessions[this.id] = this;
	this.foreignDomain = "<unknown>";
}

FederationSession.prototype.initializeBasedOnOutbound = function(domain, connection) {
	this.type = 'outbound';
	this.connection = connection;
	this.foreignDomain = domain;
	this.initializeSocket();
	this.token = newUuid();
	pendingTokensByDomain[domain] = this.token;
	var federateRequest = factory.newFederateRequest(token, new BraidAddress(null, domain, null), this.domainAddress);
	this.sendMessage(federateRequest);
	this.state = 'outbound-idle';
	// That should be it. The far end should close the socket once they
	// have the token and initiate a callback
};

FederationSession.prototype.initializeBasedOnInbound = function(connection) {
	this.type = 'inbound';
	this.connection = connection;
	this.initializeSocket();
	this.state = 'unauthenticated';
};

FederationSession.prototype.initiateBasedOnFederationRequest = function(foreignDomain, token, connection) {
	this.type = 'federation';
	this.connection = connection;
	this.initializeSocket();
	this.foreignDomain = foreignDomain;
	this.state = 'pending-callback';
	var callbackMessage = factory.newCallbackRequest(token, new BraidAddress(null, foreignDomain), this.domainAddress);
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
	if (!message.type) {
		this.sendErrorResponseIfAppropriate(message, "Invalid message.  Missing type.", 400, true);
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
		var reply = factory.newHelloReply(message, factory.newHelloPayload(package.product, package.version, config.federation.capabilities),
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
				messageSwitch.deliver(message);
				break;
			default:
				this.sendErrorResponseIfAppropriate(message, "Invalid state", 400, true);
				break;
			}
		} catch (err) {
			console.error("braid-federation.onSocketMessageReceived", err, err.stack);
			this.sendErrorResponseIfAppropriate(message, "Internal error: " + err, 500, true);
		}
	}
};

FederationSession.prototype.handleCallbackReply = function(message) {
	this.activateSession(message.from.domain);
};

FederationSession.prototype.activateSession = function(domain) {
	this.state = 'active';
	activeSessionsByDomain[domain] = this;
	delete pendingTokensByDomain[domain];
	this.processPendingTransmitByDomain(domain);
	var pendingTransmits = pendingTransmitQueuesByDomain[domain];
	if (pendingTransmits) {
		for (var i = 0; i < pendingTransmits.length; i++) {
			this.sendMessage(pendingTransmits[i]);
		}
		delete pendingTransmitQueuesByDomain[domain];
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
		var connectionUrl = domainNameServer.resolveFederationUrl(message.from.domain);
		var ws = new WebSocket(connectionUrl);
		ws.on('open', function(ws) {
			var session = new FederationSession();
			session.initializeBasedOnFederationRequest(message.from.domain, token, ws);
		});
		ws.on('error', function(err) {
			console.warn("Unable to establish connection to foreign domain: " + domain, err);
			delete pendingTransmitQueuesByDomain[domain];
		});
		this.close();
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
	var pendingToken = pendingTokensByDomain[domain];
	if (pendingToken && pendingToken === token) {
		this.sendMessage(factory.newReply(this.domainAddress, new BraidAddress(null, domain)));
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
		console.warn("braid-federation.parseMessage error", err, err.stack);
		this.sendError(null, "Invalid JSON: " + err, 400, true);
	}
};

FederationSession.prototype.sendErrorResponseIfAppropriate = function(message, errorMessage, errorCode, closeSocket) {
	if (message.type === 'request' || message.type === 'cast') {
		this.sendError(message, errorMessage, errorCode, closeSocket);
		var reply = factory.newErrorReply(message, errorCode, errorMessage);
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

FederationSession.prototype.close = function() {
	this.finalize();
};

FederationSession.prototype.finalize = function() {
	this.state = 'closed';
	sessionsById[this.id];
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

function initiateFederation(domain) {
	// We open a websocket to the server responsible for that domain. If they
	// answer, we just provide a token that will be used to authenticate on
	// a callback connection
	var connectionUrl = domainNameServer.resolveServer(domain);
	var session = new FederationSession();
	var ws = new WebSocket(connectionUrl);
	ws.on('open', function() {
		session.initializeBasedOnOutbound(domain, ws);
	});
	ws.on('error', function(err) {
		console.warn("Unable to establish connection to foreign domain: " + domain, err);
		delete pendingTransmitQueuesByDomain[domain];
	});
}

function handleSwitchedMessage(message) {
	if (message.from.domain !== config.domain) {
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
		var session = activeSessionsByDomain[domain];
		if (session) {
			session.sendMessage(message);
		} else {
			// No active session, so we'll look for a pending transmit queue
			var queue = pendingTransmitQueuesByDomain[domain];
			if (queue) {
				// There is already a queue, meaning that we're already waiting
				// for a session to be completed, so we just add to that queue
				queue.push(message);
			} else {
				console.log("braid-federation:  New domain connection required", message);
				// There's no queue, so we need to initiate a new connection,
				// understanding that they are just then going to call us back,
				// at which point we will process the pending queue at that point
				queue = [ message ];
				pendingTransmitQueuesByDomain[domain] = queue;
				initiateFederation(domain);
			}
		}
	}
}

function initialize(cfg) {
	config = cfg;
	messageSwitch.registerForeignDomains(config.domain, function(message) {
		handleSwitchedMessage(message);
	});
	setInterval(function() {
		var now = Date.now();
		var toClose = [];
		for (id in sessionsById) {
			if (sessionsById.hasOwnProperty(id)) {
				if (now - sessionsById[id].lastActive > MAX_IDLE_PERIOD) {
					toClose.push(id);
				}
			}
		}
		for (var i = 0; i < toClose.length; i++) {
			console.log("Closing federation session to " + sessionsById.foreignDomain + " because IDLE");
			sessionsById[toClose[i]].close();
		}
	}, 60000);
}

function acceptFederationSession(connection) {
	var session = new FederationSession();
	session.initializeBasedOnInbound(connection);
}

module.exports = {
	initialize : initialize,
	acceptFederationSession : acceptFederationSession
};