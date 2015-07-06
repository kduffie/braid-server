var assert = require('assert');
var bcrypt = require('bcrypt');
var BraidAddress = require('./braid-address').BraidAddress;
var factory = require('./braid-factory');
var eventBus = require('./braid-event-bus');
var lru = require('lru-cache');

function AuthServer() {
}

AuthServer.prototype.initialize = function(configuration, domainServices) {
	console.log("auth: initializing");
	this.config = configuration;
	this.address = new BraidAddress(null, this.config.domain, "!auth");
	this.factory = domainServices.factory;
	this.eventBus = domainServices.eventBus;
	this.messageSwitch = domainServices.messageSwitch;
	this.braidDb = domainServices.braidDb;
	this.userCache = lru({
		max : 1000,
		maxAge : 1000 * 60 * 60
	});
	this.messageSwitch.registerResource('!auth', this.config.domain, this._handleMessage.bind(this));
	this.initialized = true;
};

AuthServer.prototype._createUser = function(userId, password, callback) {
	assert(this.initialized);
	bcrypt.genSalt(10, function(err, salt) {
		bcrypt.hash(password, salt, function(err, hash) {
			var userRecord = this.factory.newAccountRecord(userId, this.config.domain, hash);
			this.braidDb.insertAccount(userRecord, function() {
				this.userCache.set(userId, userRecord);
				this.eventBus.fire('user-added', userRecord);
				callback(null, userRecord);
			}.bind(this));
		}.bind(this));
	}.bind(this));
};

AuthServer.prototype._processRegisterMessage = function(message) {
	assert(this.initialized);
	if (!message.data || !message.data.user || !message.data.password) {
		this.messageSwitch.deliver(this.factory.newErrorReplyMessage(message, this.address, 400, "Missing credentials"));
		return;
	}
	var userId = message.data.user;
	var password = message.data.password;
	if (!userId.match(/[a-z][a-z\.0-9]?/)) {
		this.messageSwitch.deliver(this.factory.newErrorReplyMessage(message, this.address, 406, "Invalid userId"));
	} else if (userId.length < 2 || userId.length > 64) {
		this.messageSwitch.deliver(this.factory.newErrorReplyMessage(message, this.address, 406, "UserId must be 2 to 64 characters"));
	} else if (password.length < 4 || password.length > 64) {
		this.messageSwitch.deliver(this.factory.newErrorReplyMessage(message, this.address, 406, "Password must be 4 to 64 characters"));
	} else {
		this.getUserRecord(userId, function(err, existing) {
			if (err) {
				console.error(err);
				console.trace();
				this.messageSwitch.deliver(this.factory.newErrorReplyMessage(message, this.address, 500, "Internal error: " + err));
			} else if (existing) {
				this.messageSwitch.deliver(this.factory.newErrorReplyMessage(message, this.address, 409, "UserId is not available"));
			} else {
				this._createUser(userId, password, function(err, user) {
					if (err) {
						console.error(err);
						console.trace();
						this.messageSwitch.deliver(this.factory.newErrorReplyMessage(message, this.address, 500, "Internal error: " + err));
					} else {
						var clientAddress = new BraidAddress(userId, this.config.domain, message.from.resource);
						this.messageSwitch.deliver(this.factory.newRegisterReplyMessage(message, this.address, clientAddress));
					}
				}.bind(this));
			}
		}.bind(this));
	}
};

AuthServer.prototype.getUserRecord = function(userId, callback) {
	assert(this.initialized);
	var record = this.userCache.get(userId);
	if (record) {
		if (record.notFound) {
			callback(null, null);
		} else {
			callback(null, record);
		}
	} else {
		this.braidDb.findAccountById(userId, function(err, record) {
			if (err) {
				callback(err);
			} else if (record) {
				this.userCache.set(userId, record);
				callback(null, record);
			} else {
				this.userCache.set(userId, {
					notFound : true
				});
				callback(null, null);
			}
		}.bind(this));
	}
};

AuthServer.prototype._authenticateUser = function(userId, password, callback) {
	assert(this.initialized);
	this.getUserRecord(userId, function(err, user) {
		if (err) {
			callback(err);
		} else if (user) {
			bcrypt.compare(password, user.password, function(err, result) {
				if (err) {
					callback(err);
				} else if (result) {
					callback(null, user);
				} else {
					callback(null, null);
				}
			}.bind(this));
		} else {
			callback();
		}
	}.bind(this));
};

AuthServer.prototype._processAuthMessage = function(message) {
	assert(this.initialized);
	if (!message.data || !message.data.user) {
		this.messageSwitch.deliver(this.factory.newErrorReplyMessage(message, this.address, 400, "Missing credentials"));
		return;
	}
	this._authenticateUser(message.data.user, message.data.password, function(err, user) {
		if (err) {
			console.error(err);
			console.trace();
			this.messageSwitch.deliver(this.factory.newErrorReplyMessage(message, this.address, 500, "Internal error: " + err));
		} else if (!user) {
			this.messageSwitch.deliver(this.factory.newErrorReplyMessage(message, this.address, 401, "Unauthorized"));
		} else {
			var clientAddress = new BraidAddress(message.data.user, this.config.domain, message.from.resource);
			this.messageSwitch.deliver(this.factory.newAuthReplyMessage(message, this.address, clientAddress));
		}
	}.bind(this));
};

AuthServer.prototype._handleMessage = function(message) {
	assert(this.initialized);
	console.log("auth: handleMessage", message);
	switch (message.type) {
	case 'request':
		switch (message.request) {
		case 'register':
			this._processRegisterMessage(message);
			break;
		case 'auth':
			this._processAuthMessage(message);
			break;
		case 'ping':
			this.messageSwitch.deliver(this.factory.newPingReplyMessage(message, this.address));
			break;
		default:
			this.messageSwitch.deliver(this.factory.newUnhandledMessageErrorReply(message, this.address));
			break;
		}
		break;
	default:
		break;
	}
};

var clientCapabilities = {
	v : 1,
	register : {
		v : 1
	},
	credentials : {
		v : 1
	}
};

var federationCapabilities = {
	v : 1
};

module.exports = {
	clientCapabilities : clientCapabilities,
	federationCapabilities : federationCapabilities,
	AuthServer : AuthServer
};