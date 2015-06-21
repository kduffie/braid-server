/*
 * The roster manager is responsible for tracking who is online and
 * notifying others subscribed to their presence as they go online and
 * offline.
 */

var messageSwitch = require('./braid-message-switch');
var eventBus = require('./braid-event-bus');
var async = require('async');
var factory = require('./braid-factory');
var BraidAddress = require('./braid-address').BraidAddress;
var newAddress = require('./braid-address').newAddress;

var braidDb;
var address;

var activeUsers = {};

function handleSubscribeMessage(message) {
	// Someone has sent a subscribe message. This means that they are making themselves a target so that the recipient
	// will become a subscriber of their presence. If there isn't already a record for this subscription, we will add one.
	async.eachSeries(message.to, function(recipient, callback) {
		if (recipient.userId && recipient.domain) {
			braidDb.findSubscription(message.from.userId, message.from.domain, recipient.userId, recipient.domain, function(err, record) {
				if (err) {
					callback(err);
				} else if (record) {
					callback();
				} else {
					var subscription = factory.newSubscriptionRecord(message.from.userId, message.from.domain, recipient.userId, recipient.domain);
					console.log("braid-roster: adding subscription", subscription);
					braidDb.insertSubscription(subscription, callback);
				}
			});
		}
	});
}

function handleUnsubscribeMessage(message) {
	async.eachSeries(message.to, function(recipient, callback) {
		if (recipient.userId && recipient.domain) {
			braidDb.findSubscription(message.from.userId, message.from.domain, recipient.userId, recipient.domain, function(err, record) {
				if (err) {
					callback(err);
				} else if (record) {
					var subscription = factory.newSubscriptionRecord(message.from.userId, message.from.domain, recipient.userId, recipient.domain);
					console.log("braid-roster: adding subscription", subscription);
					braidDb.removeSubscription(message.from.userId, message.from.domain, recipient.userId, recipient.domain, callback);
				} else {
					callback();
				}
			});
		}
	});
}

function notifyPresence(presenceEntry) {
	braidDb.findSubscribersByTarget(presenceEntry.address.userId, presenceEntry.address.domain, function(err, records) {
		if (err) {
			throw err;
		}
		async.each(records, function(record, callback) {
			var to = newAddress(record.subscriber);
			var presenceMessage = factory.newPresenceMessage(presenceEntry, to, address);
			messageSwitch.deliver(presenceMessage);
			callback();
		});
	});
}

function handleRosterMessage(message) {
	// Someone has sent a message to the roster manager.
	switch (message.request) {
	case 'roster':
		// The user wants a list of the users they are subscribed to, and a list of active resources for each
		braidDb.findTargetsBySubscriber(message.from.userId, message.from.domain, function(err, records) {
			if (err) {
				throw err;
			}
			var entries = [];
			async.each(records, function(record, callback) {
				var address = newAddress(record.target);
				var activeUser = activeUsers[address.asString()];
				var resources = [];
				if (activeUser) {
					resources = activeUser.resources;
				}
				var entry = factory.newRosterEntry(new BraidAddress(record.target.userId, record.target.domain), resources);
				entries.push(entry);
				callback();
			}, function(err) {
				var reply = factory.newRosterReply(message, entries, address);
				messageSwitch.deliver(reply);
			});
		});
		break;
	default:
		break;
	}
}

function onClientSessionActivated(session) {
	console.log("braid-roster: onClientSessionActivated", session.userAddress);
	var entry = factory.newPresenceEntry(session.userAddress, true, session.clientCapabilities);
	var address = newAddress(session.userAddress, true);
	var key = address.asString();
	var activeUser = activeUsers[key];
	if (!activeUser) {
		activeUser = {
			address : address,
			resources : []
		};
		activeUsers[key] = activeUser;
	}
	activeUser.resources.push(session.userAddress.resource);
	notifyPresence(entry);
}

function onClientSessionClosed(session) {
	if (session.userAddress) {
		var entry = factory.newPresenceEntry(session.userAddress, false);
		var address = newAddress(session.userAddress, true);
		var key = address.asString();
		var activeUser = activeUsers[key];
		if (activeUser) {
			var index = activeUser.resources.indexOf(session.userAddress.resource);
			if (index >= 0) {
				activeUser.resources.splice(index, 1);
			}
			if (activeUser.resources.length === 0) {
				delete activeUsers[key];
			}
		}
		notifyPresence(entry);
	}
}

function initialize(config, db) {
	console.log("roster: initializing");
	braidDb = db;
	address = new BraidAddress(null, config.domain, "!roster");
	messageSwitch.registerResource('!roster', config.domain, handleRosterMessage);
	messageSwitch.registerForRequests('subscribe', handleSubscribeMessage);
	messageSwitch.registerForRequests('unsubscribe', handleUnsubscribeMessage);
	console.log("braid-roster: registering with eventBus");
	eventBus.on('client-session-activated', onClientSessionActivated);
	eventBus.on('client-session-closed', onClientSessionClosed);
}

module.exports = {
	initialize : initialize
};