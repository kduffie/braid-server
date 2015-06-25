/*
 * The roster manager is responsible for tracking who is online and
 * notifying others subscribed to their presence as they go online and
 * offline.
 */

var async = require('async');
var BraidAddress = require('./braid-address').BraidAddress;
var newAddress = require('./braid-address').newAddress;

var BOT_RESOURCE = '!bot';

function RosterManager() {
}

RosterManager.prototype.initialize = function(configuration, services) {
	this.config = configuration;
	this.factory = services.factory;
	this.braidDb = services.braidDb;
	this.messageSwitch = services.messageSwitch;
	this.eventBus = services.eventBus;
	this.activeUsers = {};

	this.rosterAddress = new BraidAddress(null, this.config.domain, "!roster");

	this.messageSwitch.registerResource('!roster', this.config.domain, this._handleRosterMessage.bind(this));
	this.messageSwitch.registerForRequests('subscribe', this._handleSubscribeMessage.bind(this));
	this.messageSwitch.registerForRequests('unsubscribe', this._handleUnsubscribeMessage.bind(this));

	this.eventBus.on('client-session-activated', this._onClientSessionActivated.bind(this));
	this.eventBus.on('client-session-closed', this._onClientSessionClosed.bind(this));
};

RosterManager.prototype._handleSubscribeMessage = function(message) {
	// Someone has sent a subscribe message. This means that they are making themselves a target so that the recipient
	// will become a subscriber of their presence. If there isn't already a record for this subscription, we will add one.
	async.eachSeries(message.to, function(recipient, callback) {
		if (recipient.userId && recipient.domain) {
			this.braidDb.findSubscription(message.from.userId, message.from.domain, recipient.userId, recipient.domain, function(err, record) {
				if (err) {
					callback(err);
				} else if (record) {
					callback();
				} else {
					var subscription = this.factory.newSubscriptionRecord(message.from.userId, message.from.domain, recipient.userId, recipient.domain);
					console.log("braid-roster: adding subscription", subscription);
					this.braidDb.insertSubscription(subscription, callback);
				}
			}.bind(this));
		}
	}.bind(this));
};

RosterManager.prototype._handleUnsubscribeMessage = function(message) {
	async.eachSeries(message.to, function(recipient, callback) {
		if (recipient.userId && recipient.domain) {
			this.braidDb.findSubscription(message.from.userId, message.from.domain, recipient.userId, recipient.domain, function(err, record) {
				if (err) {
					callback(err);
				} else if (record) {
					var subscription = this.factory.newSubscriptionRecord(message.from.userId, message.from.domain, recipient.userId, recipient.domain);
					console.log("braid-roster: adding subscription", subscription);
					this.braidDb.removeSubscription(message.from.userId, message.from.domain, recipient.userId, recipient.domain, callback);
				} else {
					callback();
				}
			}.bind(this));
		}
	}.bind(this));
};

RosterManager.prototype._notifyPresence = function(presenceEntry, includeForeign) {
	this.braidDb.findSubscribersByTarget(presenceEntry.address.userId, presenceEntry.address.domain, function(err, records) {
		if (err) {
			throw err;
		}
		var localUsers = [];
		var foreignDomains = [];
		for (var i = 0; i < records.length; i++) {
			if (records[i].subscriber.domain === this.config.domain) {
				localUsers.push(records[i].subscriber);
			} else {
				if (foreignDomains.indexOf(records[i].subscriber.domain) < 0) {
					foreignDomains.push(records[i].subscriber.domain);
				}
			}
		}
		async.each(localUsers, function(localUser, callback) {
			var presenceMessage = this.factory.newPresenceMessage(presenceEntry, localUser, this.rosterAddress);
			this.messageSwitch.deliver(presenceMessage);
			callback();
		}.bind(this));
		if (includeForeign) {
			async.each(foreignDomains, function(foreignDomain, callback) {
				var presenceMessage = this.factory.newPresenceMessage(presenceEntry, new BraidAddress(null, foreignDomain), this.rosterAddress);
				this.messageSwitch.deliver(presenceMessage);
				callback();
			}.bind(this));
		}
	}.bind(this));
}

RosterManager.prototype._handleRosterMessage = function(message) {
	// Someone has sent a message to the roster manager.
	switch (message.request) {
	case 'roster':
		// The user wants a list of the users they are subscribed to, and a list of active resources for each
		this.braidDb.findTargetsBySubscriber(message.from.userId, message.from.domain, function(err, records) {
			if (err) {
				throw err;
			}
			var entries = [];
			async.each(records, function(record, callback) {
				var address = newAddress(record.target);
				var activeUser = this.getOrCreateActiveUser(address);
				var entry = this.factory.newRosterEntry(new BraidAddress(record.target.userId, record.target.domain), activeUser.resources);
				entries.push(entry);
				callback();
			}.bind(this), function(err) {
				var reply = this.factory.newRosterReply(message, entries, this.rosterAddress);
				this.messageSwitch.deliver(reply);
			}.bind(this));
		}.bind(this));
		break;
	case 'presence':
		// Presence messages from foreign domains will be directed here. We need to deliver these to the
		// appropriate subscribers in this domain. And we want to update our own roster accordingly.
		// First, we need to make sure that they aren't telling us about users that aren't in their own domain.
		if (message.data && message.data.address && message.data.address.domain && message.data.address.domain === message.from.domain) {
			if (message.data.online) {
				this._onForeignClientSessionActivated(message.data);
			} else {
				this._onForeignClientSessionClosed(message.data);
			}
		} else {
			// This is an invalid presence message. We'll ignore it.
			console.warn("Received invalid presence message", message);
		}
		break;
	default:
		break;
	}
};

RosterManager.prototype.getOrCreateActiveUser = function(address) {
	var key = address.asString();
	var activeUser = this.activeUsers[key];
	if (!activeUser) {
		activeUser = {
			address : address,
			resources : [ BOT_RESOURCE ]
		};
		this.activeUsers[key] = activeUser;
	}
	return activeUser;
};

RosterManager.prototype._onForeignClientSessionActivated = function(entry) {
	var address = newAddress(entry.address);
	console.log("braid-roster: onForeignClientSessionActivated", entry);
	var activeUser = this.getOrCreateActiveUser(address);
	activeUser.resources.push(address.resource);
	this._notifyPresence(entry, false);
};

RosterManager.prototype._onForeignClientSessionClosed = function(entry) {
	console.log("braid-roster: onForeignClientSessionClosed", entry);
	var address = newAddress(entry.address, true);
	var activeUser = this.getOrCreateActiveUser(address);
	var index = activeUser.resources.indexOf(address.resource);
	if (index >= 0) {
		activeUser.resources.splice(index, 1);
	}
	if (activeUser.resources.length === 0) {
		delete this.activeUsers[key];
	}
	this._notifyPresence(entry, false);
};

RosterManager.prototype._onClientSessionActivated = function(session) {
	console.log("braid-roster: onClientSessionActivated", session.userAddress);
	var entry = this.factory.newPresenceEntry(session.userAddress, true);
	var address = newAddress(session.userAddress, true);
	var activeUser = this.getOrCreateActiveUser(address);
	activeUser.resources.push(session.userAddress.resource);
	this._notifyPresence(entry, true);
};

RosterManager.prototype._onClientSessionClosed = function(session) {
	if (session.userAddress) {
		var entry = this.factory.newPresenceEntry(session.userAddress, false);
		var address = newAddress(session.userAddress, true);
		var key = address.asString();
		var activeUser = this.activeUsers[key];
		if (activeUser) {
			var index = activeUser.resources.indexOf(session.userAddress.resource);
			if (index >= 0) {
				activeUser.resources.splice(index, 1);
			}
			if (activeUser.resources.length === 0) {
				delete this.activeUsers[key];
			}
		}
		this._notifyPresence(entry, true);
	}
};

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
	RosterManager : RosterManager
};