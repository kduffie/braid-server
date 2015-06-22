var bcrypt = require('bcrypt');
var messageSwitch = require('./braid-message-switch');
var BraidAddress = require('./braid-address').BraidAddress;
var factory = require('./braid-factory');
var eventBus = require('./braid-event-bus');
var lru = require('lru-cache');

var braidDb;
var address;
var domain;

var userCache = lru({
	max : 5000,
	maxAge : 1000 * 60 * 60
});

function createUser(userId, password, callback) {
	bcrypt.genSalt(10, function(err, salt) {
		bcrypt.hash(password, salt, function(err, hash) {
			var userRecord = factory.newAccountRecord(userId, domain, hash);
			braidDb.insertAccount(userRecord, function() {
				userCache.set(userId, userRecord);
				eventBus.fire('user-added', userRecord);
				callback(null, userRecord);
			});
		});
	});
}

function processRegisterMessage(message) {
	if (!message.data || !message.data.user || !message.data.password) {
		messageSwitch.deliver(factory.newErrorReply(message, 400, "Missing credentials", address));
		return;
	}
	var userId = message.data.user;
	var password = message.data.password;
	if (!userId.match(/[a-z][a-z\.0-9]?/)) {
		messageSwitch.deliver(factory.newErrorReply(message, 406, "Invalid userId", address));
	} else if (userId.length < 4 || userId.length > 64) {
		messageSwitch.deliver(factory.newErrorReply(message, 406, "UserId must be 4 to 64 characters", address));
	} else if (password.length < 4 || password.length > 64) {
		messageSwitch.deliver(factory.newErrorReply(message, 406, "Password must be 4 to 64 characters", address));
	} else {
		getUserRecord(userId, function(err, existing) {
			if (err) {
				console.error(err);
				console.trace();
				messageSwitch.deliver(factory.newErrorReply(message, 500, "Internal error: " + err, address));
			} else if (existing) {
				messageSwitch.deliver(factory.newErrorReply(message, 409, "UserId is not available", address));
			} else {
				createUser(userId, password, function(err, user) {
					if (err) {
						console.error(err);
						console.trace();
						messageSwitch.deliver(factory.newErrorReply(message, 500, "Internal error: " + err, address));
					} else {
						var clientAddress = new BraidAddress(userId, domain, message.from.resource);
						messageSwitch.deliver(factory.newReply(message, address, clientAddress));
					}
				});
			}
		});
	}
}

function authenticateUser(userId, password, callback) {
	getUserRecord(userId, function(err, user) {
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
			});

		} else {
			callback();
		}
	});
}

function processAuthMessage(message) {
	if (!message.data || !message.data.user) {
		messageSwitch.deliver(factory.newErrorReply(message, 400, "Missing credentials", address));
		return;
	}
	authenticateUser(message.data.user, message.data.password, function(err, user) {
		if (err) {
			console.error(err);
			console.trace();
			messageSwitch.deliver(factory.newErrorReply(message, 500, "Internal error: " + err, address));
		} else if (!user) {
			messageSwitch.deliver(factory.newErrorReply(message, 401, "Unauthorized", address));
		} else {
			var clientAddress = new BraidAddress(message.data.user, domain, message.from.resource);
			messageSwitch.deliver(factory.newReply(message, address, clientAddress));
		}
	});
}

function handleMessage(message) {
	switch (message.type) {
	case 'request':
		switch (message.request) {
		case 'register':
			processRegisterMessage(message);
			break;
		case 'auth':
			processAuthMessage(message);
			break;
		default:
			messageSwitch.deliver(factory.newUnhandledMessageErrorReply(message, address));
			break;
		}
		break;
	default:
		break;
	}
}

function getUserRecord(userId, callback) {
	var record = userCache.get(userId);
	if (record) {
		if (record.notFound) {
			callback(null, null);
		} else {
			callback(null, record);
		}
	} else {
		braidDb.findAccountById(userId, function(err, record) {
			if (err) {
				callback(err);
			} else if (record) {
				userCache.set(userId, record);
				callback(null, record);
			} else {
				userCache.set(userId, {
					notFound : true
				});
				callback(null, null);
			}
		});
	}
}

function initialize(config, db) {
	console.log("auth: initializing");
	domain = config.domain;
	braidDb = db;
	address = new BraidAddress(null, domain, "!auth");
	messageSwitch.registerResource('!auth', domain, handleMessage);
}

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
	initialize : initialize,
	getUserRecord : getUserRecord
};