var factory = require('./braid-factory');
var config;
var messageSwitch = require('./braid-message-switch');
var BraidAddress = require('./braid-address').BraidAddress;
var getUserRecord = require('./braid-auth').getUserRecord;
var TileMutationProcessor = require('./braid-tile-mutation-processor');
var TileMutationMongoHandler = require('./braid-tile-mutation-mongo-handler');

var braidDb;
var BOT_RESOURCE = '!bot';

var handler;

var mutationProcessorsByTileId = {};

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

function handleTileShare(message) {
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
		braidDb.findTileById(message.data.tileId, function(err, tileRecord) {
			if (err) {
				console.error("Failure finding tile in db", err);
			} else if (!record) {
				// We don't yet have this tile. So we'll save the tile and
				// issue a tile-accept to get them to send us the mutations for it.
				var record = factory.newTileRecordFromInfo(message.data);
				braidDb.insertUserTile(record, function(err) {
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
}

function processMutation(tileRecord, mutation) {
	process.nextTick(function() {
		// Find or create a tile mutation processor for the tile
		var mp = mutationProcessorsByTileId[mutation.tileId];
		if (!mp) {
			mp = new TileMutationProcessor(mutation.tileId, tileRecord.mutationCount, tileMutationHandlers);
			mutationProcessorsByTileId[mutation.tileId] = mp;
		}
		mp.addMutation(mutation);
	});
}

function handleTileMutation(message, to) {
	// If we receive a tile mutation, we will process it, but only if it is
	// for a tile that we have. In that case, we don't care who they were
	// sending it to.

	if (message.data && message.data.tileId) {
		braidDb.findTileById(message.data.tileId, function(err, tileRecord) {
			if (err) {
				console.error("Failure finding tile in db", err);
			} else if (tileRecord) {
				// Now we check to see if we already have this mutation and it
				// has been processed.
				braidDb.findMutation(message.data.tileId, message.data.mutationId, function(err, mutationRecord) {
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

function handleOnFileMissing(tileId, mutation) {
	// TODO: request file from originator
}

function handleOnMutationsCompleted(tileId) {
	delete mutationProcessorsByTileId[tileId];
}

function initialize(configuration, db) {
	console.log("braid-client-bot: initializing");
	config = configuration;
	braidDb = db;
	messageSwitch.registerHook(messageHandler);
	mutationHandler = new TileMutationMongoHandler({
		onFileMissing : handleOnFileMissing,
		onMutationsCompleted : handleOnMutationsCompleted,
	}, braidDb);

}
module.exports = {
	initialize : initialize
};