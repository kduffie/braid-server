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
var config;
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

function notifyPresence(presenceEntry, includeForeign) {
	braidDb.findSubscribersByTarget(presenceEntry.address.userId, presenceEntry.address.domain, function(err, records) {
		if (err) {
			throw err;
		}
		var localUsers = [];
		var foreignDomains = [];
		for (var i = 0; i < records.length; i++) {
			if (records[i].subscriber.domain === config.domain) {
				localUsers.push(records[i].subscriber);
			} else {
				if (foreignDomains.indexOf(records[i].subscriber.domain) < 0) {
					foreignDomains.push(records[i].subscriber.domain);
				}
			}
		}
		async.each(localUsers, function(localUser, callback) {
			var presenceMessage = factory.newPresenceMessage(presenceEntry, localUser, this.address);
			messageSwitch.deliver(presenceMessage);
			callback();
		});
		if (includeForeign) {
			async.each(foreignDomains, function(foreignDomain, callback) {
				var presenceMessage = factory.newPresenceMessage(presenceEntry, new BraidAddress(null, foreignDomain), this.address);
				messageSwitch.deliver(presenceMessage);
				callback();
			});
		}
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
	case 'presence':
		// Presence messages from foreign domains will be directed here. We need to deliver these to the
		// appropriate subscribers in this domain. And we want to update our own roster accordingly.
		// First, we need to make sure that they aren't telling us about users that aren't in their own domain.
		if (message.data && message.data.address && message.data.address.domain && message.data.address.domain === message.from.domain) {
			if (message.data.online) {
				this.onForeignClientSessionActivated(message.data);
			} else {
				this.onForeignClientSessionClosed(message.data);
			}
		} else {
			// This is an invalid presence message. We'll ignore it.
			console.warn("Received invalid presence message", message);
		}
		break;
	default:
		break;
	}
}

function onForeignClientSessionActivated(entry) {
	var address = newAddress(entry.address);
	console.log("braid-roster: onForeignClientSessionActivated", entry);
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
	notifyPresence(entry, false);
}

function onForeignClientSessionClosed(entry) {
	console.log("braid-roster: onForeignClientSessionClosed", entry);
	var address = newAddress(address, true);
	var key = address.asString();
	var activeUser = activeUsers[key];
	if (activeUser) {
		var index = activeUser.resources.indexOf(address.resource);
		if (index >= 0) {
			activeUser.resources.splice(index, 1);
		}
		if (activeUser.resources.length === 0) {
			delete activeUsers[key];
		}
	}
	notifyPresence(entry, false);
}

function onClientSessionActivated(session) {
	console.log("braid-roster: onClientSessionActivated", session.userAddress);
	var entry = factory.newPresenceEntry(session.userAddress, true);
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
	notifyPresence(entry, true);
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
		notifyPresence(entry, true);
	}
}

function initialize(configuration, db) {
	config = configuration;
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

var clientCapabilities = {
	v : 1,
	subscriptions : {
		v : 1
	},
	roster : {
		v : 1
	},
	presence : {
		v : 1
	}
};

var federationCapabilities = {
	v : 1,
	subscriptions : {
		v : 1
	},
	presence : {
		v : 1
	}
};

module.exports = {
	clientCapabilities : clientCapabilities,
	federationCapabilities : federationCapabilities,
	initialize : initialize
};