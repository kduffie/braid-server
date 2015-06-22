var factory = require('./braid-factory');
var config;
var messageSwitch = require('./braid-message-switch');
var BraidAddress = require('./braid-address').BraidAddress;
var getUserRecord = require('./braid-auth').getUserRecord;
var BOT_RESOURCE = '!bot';

function sendMessage(message) {
	messageSwitch.deliver(message);
}

function createProxyAddress(userId) {
	return new BraidAddress(userId, config.domain, BOT_RESOURCE);
}

function handlePing(message, to) {
	var reply = factory.newReply(message, createProxyAddress(to.userId));
	sendMessage(reply);
}

function handleMessage(message, to, isDirected) {
	getUserRecord(to.userId, function(err, userRecord) {
		if (err) {
			console.warn("braid-client-bot: error getting user record", err);
		} else if (userRecord) {
			switch (message.type) {
			case 'request':
				switch (message.request) {
				case 'ping':
					handlePing(message, to);
					break;
				}
				break;
			case 'cast':
				switch (message.request) {
				case 'tile-share':
					break;
				}
				break;
			case 'reply':
				break;
			case 'error':
				break;
			}
		} else {
			console.warn("braid-client-bot: ignoring message sent to non-existent user: " + to.userId);
		}
	});
}

function messageHandler(message) {
	// We're seeing every message going through the switch. We need to efficiently select those
	// that we need to process

	// If the messages are not sent to anyone, then I'm not interested
	if (!message.to || message.to.length === 0) {
		return;
	}

	if (!message.from) {
		console.warn("braid-client-bot: message with no 'from'", message);
	}

	// Don't want to process messages I have sent
	if (message.from.domain === config.domain && message.from.resource === BOT_RESOURCE) {
		return;
	}

	// If the message is specifically to my resource on behalf of any user, I'll handle it
	for (var i = 0; i < message.to.length; i++) {
		var to = message.to[i];
		if (to.userId && to.resource === BOT_RESOURCE && to.domain === config.domain) {
			handleMessage(message, to, true);
			return;
		}
	}

	// If the message is sent to a user in my domain, but without a resource, then I'll act as an active session
	for (var i = 0; i < message.to.length; i++) {
		var to = message.to[i];
		if (to.userId && !to.resource && to.domain === config.domain) {
			handleMessage(message, to, false);
			return;
		}
	}

}

function initialize(configuration) {
	console.log("braid-client-bot: initializing");
	config = configuration;
	messageSwitch.registerHook(messageHandler);

}
module.exports = {
	initialize : initialize
};