var async = require('async');
var BraidAddress = require('./braid-address').BraidAddress;
var newUuid = require('./braid-uuid');

/*
 * A Session object represents one websocket connection to a user. Each Session has a unique full address once it has been authenticated, because a new UUID is
 * assigned as a resource for the session.
 * 
 * The Session object manages the websocket, processing JSON-encoded messages it receives. It may forward or process those messages depending on the state of
 * the session and the contents of the message.
 * 
 * All messages have an ID and a TYPE. 'cast' messages are unidirectional from sender to receiver. 'request' messages are unicast and anticipate a response.
 * 'reply' messages are unicast and are replies to 'request' messages. 'error' messages are unicast and are replies to 'request' or 'cast' messages.
 * 
 * Messages have a 'request' and a 'data' whose contents (if any) are determined by the type of request.
 */

function Session(config, services, connection) {
	console.log("braid-clients:  Handling new connection");
	this.config = config;
	this.factory = services.factory;
	this.eventBus = services.eventBus;
	this.messageSwitch = services.messageSwitch;
	this.connection = connection;
	this.resource = newUuid();
	this.userAddress = null;
	this.state = 'unauthenticated';
	this.transmitQueue = [];
	this.authenticationServerAddress = new BraidAddress(null, this.config.domain, "!auth");
	this.rosterServerAddress = new BraidAddress(null, this.config.domain, "!roster");
}

Session.prototype.initialize = function() {
	this.connection.on("message", this.onSocketMessageReceived.bind(this));
	this.connection.on("error", this.onConnectionError.bind(this));
	this.connection.on("close", this.onConnectionClosed.bind(this));
	this.portSwitchPort = this.messageSwitch.registerResource(this.resource, null, this._handleSwitchedMessage.bind(this));
	this.eventBus.fire('client-session-opened', this);
};

Session.prototype._handleSwitchedMessage = function(message) {
	switch (this.state) {
	case 'unauthenticated':
		if (this.authenticationServerAddress.equals(message.from)) {
			if (message.type === 'reply' && (message.request === 'auth' || message.request === 'register')) {
				this.activateSession(message);
			}
			this.sendMessage(message);
		} else {
			console.warn("Unexpected message while in unauthenticated state");
		}
		break;
	case 'active':
		// If we sent the message, we don't want to send it back, because we are listening to
		// everything sent to the user's address, and the user may send to their own address
		// to get to other sessions with the same identity
		if (!this.from || this.from.resource !== this.resource) {
			this.sendMessage(message);
		}
		break;
	default:
		throw "Unhandled client state: " + this.state;
	}
};

Session.prototype.activateSession = function(message) {
	console.log("braid-clients:  Activating session", message.to);
	if (Array.isArray(message.to)) {
		this.userAddress = message.to[0];
	} else {
		this.userAddress = message.to;
	}
	// We were listening on everything with the resource, but now, instead, we'll listen to
	// all messages sent to the user -- even without a resource
	this.messageSwitch.unregister(this.portSwitchPort);
	this.portSwitchPort = this.messageSwitch.registerUser(this.userAddress.userId, this.userAddress.domain, this._handleSwitchedMessage.bind(this));
	this.state = 'active';
	console.log("Firing client-session-activated", message);
	this.eventBus.fire('client-session-activated', this);
};

Session.prototype.onSocketMessageReceived = function(msg) {
	var message = this.parseMessage(msg);
	if (!message) {
		return;
	}
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
	if (this.userAddress) {
		message.from = this.userAddress;
	} else {
		message.from = {
			resource : this.resource
		};
	}
	if (message.request === 'hello') {
		this.clientHello = message;
		this.clientCapabilities = this.clientHello.capabilities;
		var package = require('./package.json');
		var reply = this.factory.newHelloReply(message, this.factory.newHelloPayload(package.name, package.version, this.config.client.capabilities),
				this.userAddress);
		this.sendMessage(reply);
	} else {
		try {
			switch (this.state) {
			case 'unauthenticated':
				message.to = this.authenticationServerAddress;
				this.messageSwitch.deliver(message);
				break;
			case 'active':
				switch (message.request) {
				case 'roster':
					message.to = this.rosterServerAddress;
					break;
				default:
					break;
				}
				this.messageSwitch.deliver(message);
				break;
			default:
				this.sendErrorResponseIfAppropriate(message, "Invalid state", 400, true);
				break;
			}
		} catch (err) {
			console.error("braid-clients.onSocketMessageReceived", err, err.stack);
			this.sendErrorResponseIfAppropriate(message, "Internal error: " + err, 500, true);
		}
	}
};

Session.prototype.parseMessage = function(text) {
	try {
		var message = JSON.parse(text);
		return message;
	} catch (err) {
		console.warn("braid-clients.parseMessage error", err, err.stack);
	}
};

Session.prototype.sendErrorResponseIfAppropriate = function(message, errorMessage, errorCode, closeSocket) {
	if (message.type === 'request' || message.type === 'cast') {
		var reply = this.factory.newErrorReply(message, errorCode, errorMessage);
		this.sendMessage(reply, function() {
			if (closeSocket) {
				this.close();
			}
		}.bind(this));
	}
};

Session.prototype.sendMessage = function(message, callback) {
	this.transmitQueue.push({
		message : message,
		callback : callback
	});
	this.kickTransmit();
};

Session.prototype.sendBinary = function(buffer, callback) {
	this.transmitQueue.push({
		buffer : buffer,
		callback : callback
	});
	this.kickTransmit();
};

Session.prototype.kickTransmit = function() {
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

Session.prototype.close = function() {
	this.finalize();
};

Session.prototype.finalize = function() {
	this.state = 'closed';
	this.messageSwitch.unregister(this.portSwitchPort);
	this.eventBus.fire('client-session-closed', this);
};

Session.prototype.onConnectionError = function(err) {
	console.log(this, "onConnectionError", err);
};

Session.prototype.onConnectionClosed = function(code, reason) {
	console.log(this, "onConnectionClosed", code, reason);
	this.finalize();
};

function ClientSessionManager() {
}

ClientSessionManager.prototype.initialize = function(configuration, services) {
	console.log("clients: initializing");
	this.config = configuration;
	this.services = services;
};

ClientSessionManager.prototype.acceptSession = function(connection) {
	var session = new Session(this.config, this.services, connection);
	session.initialize();
}

module.exports = {
	ClientSessionManager : ClientSessionManager
};