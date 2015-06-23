var BraidAddress = require('./braid-address').BraidAddress;
var TileMutationProcessor = require('./braid-tile-mutation-processor');
var TileMutationMongoHandler = require('./braid-tile-mutation-mongo-handler');
var BOT_RESOURCE = '!bot';

function BotManager() {

}

BotManager.prototype.initialize = function(config, services) {
	console.log("braid-client-bot: initializing");
	this.config = config;
	this.factory = services.factory;
	this.messageSwitch = services.messageSwitch;
	this.authServer = services.authServer;
	this.braidDb = services.braidDb;
	this.messageSwitch.registerHook(this.messageHandler.bind(this));
	this.mutationProcessorsByTileId = {};
	mutationHandler = new TileMutationMongoHandler({
		onFileMissing : handleOnFileMissing,
		onMutationsCompleted : handleOnMutationsCompleted,
	}, this.braidDb);
};

BotManager.prototype.sendMessage = function(message) {
	this.messageSwitch.deliver(message);
};

BotManager.prototype.createProxyAddress = function(userId) {
	return new BraidAddress(userId, this.config.domain, BOT_RESOURCE);
};

BotManager.prototype.handleTileShare = function(message) {
	// When we get a tile-share, it is either from our own user, or from
	// someone else. If the former, we'll accept the tile unless we already
	// have it. If the latter, we'll ignore it, and will eventually add it
	// to a list of pending shares that our user can use later.

	// If the share is not from our domain, then we won't be accepting, because
	// it can have been shared by one of our users.

	if (message.from.domain !== config.domain) {
		return;
	}

	// The tile share could have been sent to multiple addresses. We only
	// need to accept it once regardless, because when we accept from the
	// same identity, it won't cause anyone to be added as a member.

	boolean
	ownShare = false;

	for (var i = 0; i < message.to.length; i++) {
		var to = message.to[i];
		if (message.from.userId === to.userId && to.domain === config.domain) {
			ownShare = true;
			break;
		}
	}

	if (!ownShare) {
		return;
	}

	if (message.data && message.data.tileId) {
		this.braidDb.findTileById(message.data.tileId, function(err, tileRecord) {
			if (err) {
				console.error("Failure finding tile in db", err);
			} else if (!record) {
				// We don't yet have this tile. So we'll save the tile and
				// issue a tile-accept to get them to send us the mutations for it.
				var record = factory.newTileRecordFromInfo(message.data);
				this.braidDb.insertUserTile(record, function(err) {
					if (err) {
						console.error("Failure inserting tile", err);
					} else {
						var acceptMessage = factory.newTileAcceptMessage(message.from, createProxyAddress(message.from.userId), message.data.tileId);
						sendMessage(acceptMessage);
					}
				});
			}
		});
	}
};

BotManager.prototype.processMutation = function(tileRecord, mutation) {
	process.nextTick(function() {
		// Find or create a tile mutation processor for the tile
		var mp = mutationProcessorsByTileId[mutation.tileId];
		if (!mp) {
			mp = new TileMutationProcessor(mutation.tileId, tileRecord.mutationCount, tileMutationHandlers);
			mutationProcessorsByTileId[mutation.tileId] = mp;
		}
		mp.addMutation(mutation);
	});
};

fBotManager.prototype.handleTileMutation = function(message, to) {
	// If we receive a tile mutation, we will process it, but only if it is
	// for a tile that we have. In that case, we don't care who they were
	// sending it to.

	if (message.data && message.data.tileId) {
		this.braidDb.findTileById(message.data.tileId, function(err, tileRecord) {
			if (err) {
				console.error("Failure finding tile in db", err);
			} else if (tileRecord) {
				// Now we check to see if we already have this mutation and it
				// has been processed.
				this.braidDb.findMutation(message.data.tileId, message.data.mutationId, function(err, mutationRecord) {
					if (err) {
						console.err("Failure finding mutation", err);
					} else if (!record || !record.integrated) {
						console.log("braid-bot:  Received mutation to be integrated", message.data);
						processMutation(tileRecord, message.data);
					}
				});
			}
		});
	}
};

BotManager.prototype.handlePing = function(message, to) {
	var reply = this.factory.newReply(message, this.createProxyAddress(to.userId));
	this.sendMessage(reply);
};

BotManager.prototype.handleMessage = function(message, to, isDirected) {
	this.authServer.getUserRecord(to.userId, function(err, userRecord) {
		if (err) {
			console.warn("braid-client-bot: error getting user record", err);
		} else if (userRecord) {
			switch (message.type) {
			case 'request':
				switch (message.request) {
				case 'ping':
					this.handlePing(message, to);
					break;
				}
				break;
			case 'cast':
				switch (message.request) {
				case 'tile-share':
					handleTileShare(message, to);
					break;
				case 'tile-mutation':
					handleTileMutation(message, to);
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
	}.bind(this));
};

BotManager.prototype.messageHandler = function(message) {
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
	if (message.from.domain === this.config.domain && message.from.resource === BOT_RESOURCE) {
		return;
	}

	// If the message is specifically to my resource on behalf of any user, I'll handle it
	for (var i = 0; i < message.to.length; i++) {
		var to = message.to[i];
		if (to.userId && to.resource === BOT_RESOURCE && to.domain === this.config.domain) {
			this.handleMessage(message, to, true);
			return;
		}
	}

	// If the message is sent to a user in my domain, but without a resource, then I'll act as an active session
	for (var i = 0; i < message.to.length; i++) {
		var to = message.to[i];
		if (to.userId && !to.resource && to.domain === this.config.domain) {
			this.handleMessage(message, to, false);
			return;
		}
	}
};

BotManager.prototype.handleOnFileMissing = function(tileId, mutation) {
	// TODO: request file from originator
};

BotManager.prototype.handleOnMutationsCompleted = function(tileId) {
	delete this.mutationProcessorsByTileId[tileId];
};

module.exports = {
	BotManager : BotManager
};