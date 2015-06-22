var factory = require('./braid-factory');
var config;
var messageSwitch = require('./braid-message-switch');
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

function handleDirectedMessage(message, to) {
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
		case 'im':
			break;
		case 'tile-share':
			break;
		}
		break;
	case 'reply':
		break;
	case 'error':
		break;
	}
}

function handleUndirectedMessage(message, to) {
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
}

function messageHandler(message) {
	// We're seeing every message going through the switch. We need to efficiently select those
	// that we need to process

	// If the messages are not sent to anyone, then I'm not interested
	if (!message.to || message.to.length === 0) {
		return;
	}

	// Don't want to process messages I have sent
	if (message.from.domain === config.domain && message.from.resource === BOT_RESOURCE) {
		return;
	}

	for (var i = 0; i < message.to.length; i++) {
		var to = message.to[i];
		// If the message is specifically to my resource on behalf of any user, I'll handle it
		if (to.userId && to.resource === BOT_RESOURCE && to.domain === config.domain) {
			handleDirectedMessage(message, to);
			return;
		}

		// If the message is sent to a user in my domain, but without a resource, then I'll act as an active session
		if (to.userId && !to.resource && to.domain === config.domain) {
			handleUndirectedMessage(message, to);
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