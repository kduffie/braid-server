/*jshint eqeqeq: false*/

var factory;
var BraidAddress;
var isWebClient = true;

if (typeof require !== 'undefined') {
	BraidAddress = require('./braid-address').BraidAddress;
	factory = require('./braid-factory');
	var WebSocket = require('ws');
	isWebClient = false;
}

// braid-address
function BraidClient(domain, port, server) {
	this.domain = domain;
	this.server = server;
	if (!server) {
		this.server = domain;
	}
	this.port = port;
	this.pendingRequests = {};
	this.roster = {};
	this.state = 'pending';
}

BraidClient.prototype.onImReceived = function(handler) {
	this.imHandler = handler;
};

BraidClient.prototype.connect = function(callback) {
	console.log(this.userId + ": connect");
	this.connectCallback = callback;
	this.socket = new WebSocket("ws://" + this.server + ":" + this.port + "/braid-client", []);
	if (isWebClient) {
		this.socket.onopen = this.onSocketOpen.bind(this);
		this.socket.onerror = this.onSocketError.bind(this);
		this.socket.onmessage = this.onSocketMessage.bind(this);
		this.socket.onclose = this.onSocketClosed.bind(this);
	} else {
		this.socket.on('open', this.onSocketOpen.bind(this));
		this.socket.on('error', this.onSocketError.bind(this));
		this.socket.on('message', this.onSocketMessage.bind(this));
		this.socket.on('close', this.onSocketClosed.bind(this));
	}
};

BraidClient.prototype.sendHello = function(payload, callback) {
	var hello = factory.newHelloRequest(payload, this.address);
	this.sendRequest(hello, callback);
};

BraidClient.prototype.register = function(userId, password, callback) {
	this.userId = userId;
	console.log(this.userId + ": register", userId);
	var request = factory.newRegisterRequest(userId, password);
	this.sendRequest(request, function(err, reply) {
		if (err) {
			if (callback) {
				callback(err);
			}
		} else {
			if (reply.type === 'reply') {
				if (Array.isArray(reply.to)) {
					if (reply.to.length > 0) {
						this.address = reply.to[0];
					}
				} else {
					this.address = reply.to;
				}
				this.state = 'active';
				if (callback) {
					callback(null, reply);
				}
			} else {
				callback(this.getErrorDisplay(reply));
			}
		}
	}.bind(this));
};

BraidClient.prototype.getErrorDisplay = function(reply) {
	var message;
	if (reply.message) {
		message = reply.message;
	} else if (reply.code) {
		message = "Error " + reply.code;
	} else {
		message = "Failure";
	}
	return message;
};

BraidClient.prototype.authenticate = function(userId, password, callback) {
	this.userId = userId;
	console.log(this.userId + ": authenticate", userId);
	var request = factory.newAuthRequest(userId, password);
	this.sendRequest(request, function(err, reply) {
		if (err) {
			if (callback) {
				callback(err);
			}
		} else {
			if (reply.type === 'reply') {
				if (Array.isArray(reply.to)) {
					if (reply.to.length > 0) {
						this.address = reply.to[0];
					}
				} else {
					this.address = reply.to;
				}
				if (reply.data) {
					this.roster = reply.data;
				}
				this.state = 'active';
				if (callback) {
					callback(null, reply);
				}
			} else {
				callback(this.getErrorDisplay(reply));
			}
		}
	}.bind(this));
};

BraidClient.prototype.pingServer = function(callback) {
	console.log(this.userId + ": pingServer");
	this.pingEndpoint(null, callback);
};

BraidClient.prototype.parseAddressEntry = function(value) {
	if (!value) {
		return null;
	}
	if (value.domain) {
		return value;
	}
	var domain = this.address.domain;
	var resource = null;
	var parts = value.split("/", 2);
	if (parts.length > 1) {
		resource = parts[1];
		value = parts[0];
	}
	parts = value.split("@");
	var userId = parts[0];
	if (parts.length > 1) {
		domain = parts[1];
	}
	return new BraidAddress(userId, domain, resource);
}

BraidClient.prototype.pingEndpoint = function(address, callback) {
	console.log(this.userId + ": pingEndpoint", address);
	to = this.parseAddressEntry(address);
	var request = factory.newPingRequest(to);
	this.sendRequest(request, function(err, reply) {
		if (err) {
			if (callback) {
				callback(err);
			}
		} else {
			if (callback) {
				callback(null, reply);
			}
		}
	}.bind(this));
};

BraidClient.prototype.sendTextMessage = function(user, textMessage) {
	var to = this.parseAddressEntry(user);
	var message = factory.newTextMessage(textMessage, to);
	this.sendMessage(message);
};

BraidClient.prototype.requestRoster = function(callback) {
	console.log(this.userId + ": requestRoster");
	var cast = factory.newRosterRequest();
	this.sendRequest(cast, callback);
};

BraidClient.prototype.subscribe = function(user) {
	console.log(this.userId + ": subscribe", user);
	var to = this.parseAddressEntry(user);
	var cast = factory.newSubscribeMessage(to);
	this.sendCast(cast);
};

BraidClient.prototype.unsubscribe = function(user) {
	console.log(this.userId + ": unsubscribe", user);
	var to = this.parseAddressEntry(user);
	var cast = factory.newUnsubscribeMessage(to);
	this.sendCast(cast);
};

BraidClient.prototype.onSocketOpen = function(event) {
	console.log(this.userId + ": onSocketOpen");
	if (this.connectCallback) {
		this.connectCallback();
		this.connectCallback = null;
	}
};

BraidClient.prototype.onSocketError = function(event) {
	console.log(this.userId + ": onSocketError", event);
	if (this.connectCallback) {
		this.connectCallback("Failure connecting to server");
	}
};

BraidClient.prototype.dumpRoster = function(event) {
	console.log(this.userId + ": current roster", this.roster);
};

BraidClient.prototype.onSocketMessage = function(event) {
	var messageString = isWebClient ? event : event.data;
	var message;
	try {
		message = JSON.parse(messageString);
	} catch (err) {
		console.log("Invalid message received", messageString, err);
		return;
	}
	// console.log(this.userId + " RX", message);
	if (message.id && (message.type === 'reply' || message.type === 'error')) {
		var pendingCallback = this.pendingRequests[message.id];
		if (pendingCallback) {
			delete this.pendingRequests[message.id];
			pendingCallback(null, message);
		} else {
			console.log("Received reply or error for request with no pending callback", message);
		}
	} else if (message.type === 'cast') {
		switch (message.request) {
		case 'subscribe':
			this.handleSubscribe(message);
			break;
		case 'unsubscribe':
			this.handleUnsubscribe(message);
			break;
		case 'presence':
			this.handlePresence(message);
			break;
		case 'im':
			this.handleIm(message);
			break;
		default:
			console.log("Unhandled cast received", message);
			break;
		}
	} else if (message.type === 'request') {
		switch (message.request) {
		case 'ping':
			this.handlePingRequest(message);
			break;
		default:
			console.log("Unhandled request received", message);
			break;
		}
	} else {
		console.log("Unhandled message received", message);
	}
};

BraidClient.prototype.handleIm = function(message) {
	if (this.imHandler) {
		this.imHandler(message);
	}
};

BraidClient.prototype.handleSubscribe = function(message) {
	if (message.from && message.data && message.data.resources) {
		var from = newAddress(message.from);
		this.roster[from.asString(true)] = message.data.resources;
	}
	// todo: callback to outside code
};

BraidClient.prototype.handleUnsubscribe = function(message) {
	if (message.from) {
		var from = newAddress(message.from);
		delete this.roster[from.asString(true)];
	}
	// todo: callback to outside code
};

BraidClient.prototype.handlePresence = function(message) {
	if (message.data && message.data.address) {
		var address = newAddress(message.data.address);
		var rosterItem = this.roster[address.asString(true)];
		if (rosterItem) {
			if (message.data.online) {
				rosterItem.push(address.resource);
			} else {
				var index = rosterItem.indexOf(address.resource);
				if (index >= 0) {
					rosterItem.splice(index, 1);
				}
			}
		} else {
			if (message.data.online) {
				rosterItem = [ address.resource ];
				this.roster[address.asString(true)] = rosterItem;
			}
		}
		// if (message.data.online) {
		// // todo: callback to caller
		// } else {
		// // todo: callback to caller
		// }
	} else {
		console.log(this.userId + ": Invalid braid presence message", message);
	}
};
BraidClient.prototype.handlePingRequest = function(message) {
	var reply = factory.newReply(message, this.address, message.from);
	this.sendReply(reply);
};

BraidClient.prototype.onSocketBinary = function() {
};

BraidClient.prototype.onSocketClosed = function() {
	console.log(this.userId + ": Braid socket closed");
	this.finalize();
};

BraidClient.prototype.close = function() {
	console.log(this.userId + ": Braid socket closing");
	if (this.socket) {
		this.socket.close();
	}
	this.finalize();
};

BraidClient.prototype.finalize = function() {
};

BraidClient.prototype.sendMessage = function(message) {
	this.socket.send(JSON.stringify(message));
};

BraidClient.prototype.sendRequest = function(requestMessage, callback) {
	var id = requestMessage.id;
	this.pendingRequests[id] = callback;
	setTimeout(function() {
		var cb = this.pendingRequests[id];
		if (cb) {
			cb(this.userId + ": Request timeout");
		}
	}.bind(this), 15000);
	// console.log(this.userId + ": REQUEST", requestMessage);
	this.socket.send(JSON.stringify(requestMessage));
};

BraidClient.prototype.sendCast = function(castMessage) {
	// console.log(this.userId + ": CAST", castMessage);
	this.socket.send(JSON.stringify(castMessage));
};

BraidClient.prototype.sendReply = function(replyMessage) {
	// console.log(this.userId + ": REPLY", replyMessage);
	this.socket.send(JSON.stringify(replyMessage));
};

if (typeof module !== 'undefined') {
	module.exports = BraidClient;
}
