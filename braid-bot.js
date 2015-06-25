var async = require('async');
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
	this.mutationHandler = new TileMutationMongoHandler({
		onFileMissing : this.handleOnFileMissing.bind(this),
		onMutationsCompleted : this.handleOnMutationsCompleted.bind(this),
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

	if (message.from.domain !== this.config.domain) {
		return;
	}

	// The tile share could have been sent to multiple addresses. We only
	// need to accept it once regardless, because when we accept from the
	// same identity, it won't cause anyone to be added as a member.

	var ownShare = false;

	for (var i = 0; i < message.to.length; i++) {
		var to = message.to[i];
		if (message.from.userId === to.userId && to.domain === this.config.domain) {
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
				var summaryInfo = this.factory.newTileRecordSummaryInfo(0, 0, null, 0, null);
				var record = this.factory.newTileRecordFromInfo(message.data, summaryInfo);
				this.braidDb.insertTile(record, function(err) {
					if (err) {
						console.error("Failure inserting tile", err);
					} else {
						// We also need a record that this user has this tile
						var userRecord = this.factory.newUserTileRecord(message.from.userId, message.data.tileId);
						this.braidDb.insertUserTile(userRecord, function(err) {
							if (err) {
								console.error("Failure inserting tile", err);
							} else {
								var acceptMessage = this.factory.newTileAcceptRequest(message.from, this.createProxyAddress(message.from.userId),
										message.data.tileId);
								this.sendMessage(acceptMessage);
							}
						}.bind(this));
					}
				}.bind(this));
			}
		}.bind(this));
	}
};

BotManager.prototype.processMutation = function(tileRecord, mutation) {
	process.nextTick(function() {
		// Find or create a tile mutation processor for the tile
		var mp = this.mutationProcessorsByTileId[mutation.tileId];
		if (!mp) {
			mp = new TileMutationProcessor(mutation.tileId, tileRecord.mutationCount, this.mutationHandler);
			this.mutationProcessorsByTileId[mutation.tileId] = mp;
		}
		mp.addMutation(mutation);
	}.bind(this));
};

BotManager.prototype.handleTileMutation = function(message, to) {
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
					} else {
						if (mutationRecord) {
							if (!mutationRecord.integrated) {
								this.processMutation(tileRecord, message.data);
							}
						} else {
							var mutationRecord = this.factory.newMutationRecord(message.data.tileId, message.data.mutationId, message.data.created,
									message.data.originator, message.data.action, message.data.value, message.data.fileId, 0, null, false, 0);
							this.braidDb.insertMutation(mutationRecord, function(err) {
								if (err) {
									console.error("Failure inserting mutation into db", err);
								} else {
									this.processMutation(tileRecord, message.data);
								}
							}.bind(this));
						}
					}
				}.bind(this));
			}
		}.bind(this));
	}
};

BotManager.prototype.handleTileAccept = function(message, to) {
	// A tile-accept will only be processed if it is directly to the bot. In that case, it will
	// check to see if the caller is a member of the tile, or already has this tile. In either case
	// the request will be accepted and the mutations will be delivered to the caller.

	if (!to || to.resource !== BOT_RESOURCE) {
		return;
	}

	this.braidDb.findTileById(message.data.tileId, function(err, tileRecord) {
		if (err) {
			console.error("Failure getting tile", err);
			this.sendMessage(this.factory.newErrorReply(message, 500, "Internal db failure: " + err, new BraidAddress(to.userId, this.config.domain,
					BOT_RESOURCE)));
			return;
		}
		if (!tileRecord) {
			console.warn("Received tile-accept for missing tile", message);
			var errorReply = this.factory.newErrorReply(message, 404, "No such tile", new BraidAddress(to.userId, this.config.domain, BOT_RESOURCE));
			this.sendMessage(errorReply);
			return;
		}
		var isMember = false;
		for (var i = 0; i < tileRecord.members.length; i++) {
			var member = tileRecord.members[i];
			if (message.from.userId === member.userId && message.from.domain === member.domain) {
				isMember = true;
				break;
			}
		}
		if (isMember) {
			this.processAccept(tileRecord, message);
		} else if (message.from.domain === this.config.domain) {
			// Not a member. But perhaps already owns this tile?
			this.braidDb.findUserTile(message.from.userId, message.data.tileId, function(err, userTileRecord) {
				if (err) {
					console.error("Failure getting tile", err);
					this.sendMessage(this.factory.newErrorReply(message, 500, "Internal db failure: " + err, new BraidAddress(to.userId, this.config.domain,
							BOT_RESOURCE)));
					return;
				}
				if (!userTileRecord) {
					this.sendMessage(this.factory.newErrorReply(message, 401, "Not authorized to access tile", new BraidAddress(to.userId, this.config.domain,
							BOT_RESOURCE)));
					return;
				}
				this.processAccept(tileRecord, message, to);
			}.bind(this));
		} else {
			// Not in my domain, so return an error
			this.sendMessage(this.factory.newErrorReply(message, 401, "Not authorized to access tile", new BraidAddress(to.userId, this.config.domain,
					BOT_RESOURCE)));
		}
	}.bind(this));
};

BotManager.prototype.processAccept = function(tileRecord, message, to) {
	this.braidDb.countMutations(tileRecord.tileId, function(err, mutationCount) {
		this.sendMessage(this.factory.newTileAcceptReply(message, tileRecord.tileId, mutationCount, new BraidAddress(to.userId, this.config.domain,
				BOT_RESOURCE)));
		this.braidDb.iterateMutations(tileRecord.tileId, false, function(err, cursor) {
			if (err) {
				console.error("Failure while iterating tile records", err);
			} else {
				cursor.forEach(function(mutationRecord) {
					var mutationMessage = this.factory.newTileMutationMessage(message.from, new BraidAddress(to.userId, this.config.domain, BOT_RESOURCE),
							mutationRecord);
					this.sendMessage(mutationMessage);
				}.bind(this), function(err) {
					if (err) {
						console.error("Failure walking tile records", err);
					}
				}.bind(this));
			}
		}.bind(this));
	}.bind(this));
};

BotManager.prototype.handleTileInventoryRequest = function(message, to) {
	// Someone has sent me a tile inventory request. I'm going to find all of the tiles I share with them
	// and compare what I find with what they report in their request and generate a set of deltas that
	// go into the response

	// Remember that the bot is acting on behalf of a user. So we need to compare against the set of tiles
	// that the targeted user conceptually has (based on userTile records).

	// First find all of the tile records whose membership includes the requester

	this.braidDb.findTilesByMember(message.from, function(err, tileRecords) {
		if (err) {
			this.sendMessage(this.factory.newErrorReply(message, 500, "Internal failure: " + err),
					new BraidAddress(to.userId, this.config.domain, BOT_RESOURCE));
		} else {
			var missingTiles = [];
			var mismatchedTiles = [];
			async.each(tileRecords, function(tileRecord, callback) {
				// First, we need to see if the targeted user actually has this tile
				this.braidDb.findUserTile(to.userId, tileRecord.tileId, function(err, userTileRecord) {
					if (err) {
						console.error("Failure getting user tile", err);
						callback(err);
					} else if (userTileRecord) {
						// Targeted user does have this tile. So we need to put it into the correct list
						// based on comparing with what we see in the request, if anything, for this tile
						var matchingSummary;
						for (var i = 0; i < message.data.summaries.length; i++) {
							if (message.data.summaries[i].tileId === tileRecord.tileId) {
								matchingSummary = message.data.summaries[i];
								break;
							}
						}
						if (matchingSummary) {
							// Found a tile they have with same tileId, so we'll compare to see if and how
							// to populate our response
							if (matchingSummary.stateHash == tileRecord.summaryInfo.stateHash
									&& matchingSummary.mutationCount == tileRecord.summary.mutationCount) {
								// Perfect match, so it doesn't belong anywhere in our response
								callback();
							} else {
								// We both have the tile, but they don't match. We're going to declare this
								// a mismatch, and will provide some extra information
								if (matchingSummary.latestMutationId) {
									this.braidDb.findMutation(this.tileId, matchingSummary.latestMutationId, function(err, remoteLatestMutationRecord) {
										if (err) {
											callback(err);
										} else if (remoteLatestMutationRecord) {
											// We have this mutation which is their latest
											var match = remoteLatestMutationRecord.index === matchingSummary.mutationCount - 1
													&& remoteLatestMutationRecord.stateHash === matchingSummary.stateHash;
											var mismatchSummary = this.factory.newTileSummary(tileRecord.tileId, tileRecord.appId, tileRecord.appVersion,
													tileRecord.summaryInfo.mutationCount, tileRecord.summaryInfo.stateHash,
													tileRecord.summaryInfo.latestMutationId, this.factory.newRemoteMutationSummary(true, match));
											mismatchedTiles.push(mismatchSummary);
											callback();
										} else {
											// We don't have their latest mutation
											var mismatchSummary = this.factory.newTileSummary(tileRecord.tileId, tileRecord.appId, tileRecord.appVersion,
													tileRecord.summaryInfo.mutationCount, tileRecord.summaryInfo.stateHash,
													tileRecord.summaryInfo.latestMutationId, this.factory.newRemoteMutationSummary(false, false));
											mismatchedTiles.push(mismatchSummary);
											callback();
										}
									}.bind(this));
								} else {
									if (tileRecord.summaryInfo.mutationCount === 0) {
										// Neither of us has any mutations, so they match. Nothing to report
									} else {
										// We have mutations. They don't. So we report a mismatch
										var mismatchSummary = this.factory.newTileSummary(tileRecord.tileId, tileRecord.appId, tileRecord.appVersion,
												tileRecord.summaryInfo.mutationCount, tileRecord.summaryInfo.stateHash, tileRecord.summaryInfo.latestMutation,
												this.factory.newRemoteMutationSummary(false, false));
										mismatchedTiles.push(mismatchSummary);
									}
									callback();
								}
							}
						} else {
							// Not found, so we will add it to the missing list
							missingTiles.push(this.factory.newTileSummaryFromTileRecord(tileRecord));
							callback();
						}
					} else {
						callback();
					}
				}.bind(this));
			}.bind(this), function(err) {
				// All records have been reviewed. Now we assemble our response
				var reply = this.factory.newTileInventoryReply(message, new BraidAddress(to.userId, this.config.domain, BOT_RESOURCE), mismatchedTiles,
						missingTiles, []);
				this.sendMessage(reply);

				// Now we also want to know whether we should issue our own tile-inventory request. We'll do this in the case where the request
				// refers to tiles that we don't have, or when there is a mismatch that suggests they have mutations that we might need.

				this.checkForInventoryNeed(message, reply, tileRecords);
			}.bind(this));
		}
	}.bind(this));
};

BotManager.prototype.checkForInventoryNeed = function(request, reply, tileRecords) {
	var needed = false;
	for (var i = 0; i < reply.data.mismatchedTiles.length; i++) {
		var mismatch = reply.data.mismatchedTiles[i];
		if (!mismatch.remoteMutation || !mismatch.remoteMutation.match || !mismatch.remoteMutation.available) {
			needed = true;
			break;
		}
	}
	if (!needed) {
		for (var i = 0; i < request.data.summaries.length; i++) {
			var remoteSummary = request.data.summaries[i];
			var found = false;
			for (var j = 0; j < tileRecords.length; j++) {
				if (remoteSummary.tileId === tileRecords[j].tileId) {
					found = true;
					break;
				}
			}
			if (!found) {
				needed = true;
				break;
			}
		}
	}
	var inventoryDelay = 15000;
	if (this.config.bot && this.config.bot.inventoryRequestDelay) {
		inventoryDelay = this.config.bot.inventoryRequestDelay;
	}
	if (needed) {
		// We have reason to believe that the caller has information that we might need. So we're going
		// to issue a reciprocal tile-inventory request. However, to keep things sane, we're going to
		// delay this to give time for things to settle -- e.g., after the client synchronizes following
		// our tile-inventory reply to them.
		setTimeout(function() {
			this.initiateTileInventoryRequest(request.from);
		}.bind(this), inventoryDelay);
	}
};

BotManager.prototype.initiateTileInventoryRequest = function(to) {
	// We need to assemble summaries for all of the tiles we have in common with this recipient
	this.braidDb.findTilesByMember(message.from, function(err, tileRecords) {
		if (err) {
			console.error("Failure fetching tiles for inventory", err);
			return;
		}
		var summaries = [];
		async.each(tileRecords, function(tileRecord, callback) {
			this.braidDb.findUserTile(to.userId, tileRecord.tileId, function(err, userTileRecord) {
				if (err) {
					console.error("Failure getting user tile", err);
					callback(err);
				} else if (userTileRecord) {
					summaries.push(this.factory.newTileSummaryFromTileRecord(tileRecord));
				} else {
					callback();
				}
			}.bind(this));
		}.bind(this), function(err) {
			// We now have a full set of summaries relevant to the target user
			var request = this.factory.newTileInventoryRequest(to, new BraidAddress(to.userId, this.config.domain, BOT_RESOURCE), summaries);
			this.sendMessage(request);
		}.bind(this));
	}.bind(this));
};

BotManager.prototype.handleTileInventoryResponse = function(reply, to) {
	// Presumably, we issued a tile-inventory request and this is the reply we got in return. We'll process this information
	// to decide if and whether to request more information from the sender.

	// For missing tiles, we'll accept them if and only if they are being shared by the sender to his/her own bot
	async.each(reply.data.missingTiles, function(summary, callback) {
		if (reply.from.userId === to.userId && reply.from.domain === to.domain) {
			var tileAccept = this.factory.newTileAcceptRequest(reply.from, to, summary.tileId);
			this.sendMessage(tileAccept);
		}
		callback();
	}.bind(this));

	// For each mismatched tile, we'll check to see if we need all of the mutations, or just a limited set
	async.each(reply.data.mismatchedTiles, function(summary, callback) {
		if (summary.remoteSummary && summary.remoteSummary.match && summary.remoteSummary.available && summary.latestMutationId) {
			// It looks like they have only mutations later than our last one. Just ask for the later ones fully delivered
			var mutationRequest = this.factory.newTileMutationListRequest(reply.from, to, summary.tileId, summary.latestMutationId, true, true);
			this.sendMessage(mutationRequest);
		} else {
			// Don't know how the mutations don't match. So request a list of them and we'll issue a resend request for those that
			// we are missing
			var mutationRequest = this.factory.newTileMutationListRequest(reply.from, to, summary.tileId, null, false, false);
			this.sendMessage(mutationRequest);
		}
		callback();
	}.bind(this));
};

BotManager.prototype.handlePing = function(message, to) {
	var reply = this.factory.newReply(message, this.createProxyAddress(to.userId));
	this.sendMessage(reply);
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

BotManager.prototype.handleTileMutationListRequest = function(request, to) {
	// They have asked us to provide a list of mutations for a given tile, and possibly to send the actual mutations
	// with or without dependencies

	// First, we need to be sure that the user associated with the target bot does, indeed, have the tile in question

	this.braidDb.findUserTile(to.userId, request.data.tileId,
			function(err, userTileRecord) {
				if (err) {
					console.error("Failure getting user tile", err);
					this.sendMessage(this.factory.newErrorReply(request, 500, "Internal error: " + err, new BraidAddress(to.userId, this.config.domain,
							BOT_RESOURCE)));
				} else if (userTileRecord) {
					var mutationDescriptors = [];
					if (request.data.startingAfter) {
						this.braidDb.findMutation(request.data.tileId, request.data.startingAfter, function(err, mutationRecord) {
							if (err) {
								console.error("Failure getting mutation", err);
								this.sendMessage(this.factory.newErrorReply(request, 500, "Internal error: " + err, new BraidAddress(to.userId,
										this.config.domain, BOT_RESOURCE)));
							} else if (mutationRecord) {
								this.processTileMutationListRequest(request, to, mutationRecord);
							} else {
								this.sendMessage(this.factory.newErrorReply(request, 404, "startingAfter mutation not found", new BraidAddress(to.userId,
										this.config.domain, BOT_RESOURCE)));
							}
						}.bind(this));
					} else {
						this.processTileMutationListRequest(request, to);
					}
				} else {
					this.sendMessage(this.factory.newErrorReply(request, 404, "No such tile", new BraidAddress(to.userId, this.config.domain, BOT_RESOURCE)));
				}
			}.bind(this));
};

BotManager.prototype.processTileMutationListRequest = function(request, to, afterMutationRecord) {
	// We've been asked to provide a list of mutations, and perhaps to deliver them. We now know where in the list they want us to start
	var index = -1;
	if (afterMutationRecord) {
		index = afterMutationRecord.index;
	}
	this.braidDb.iterateMutationsAfterIndex(request.data.tileId, index,
			function(err, cursor) {
				if (err) {
					this.sendMessage(this.factory.newErrorReply(request, 500, "Internal error: " + err, new BraidAddress(to.userId, this.config.domain,
							BOT_RESOURCE)));
				} else {
					cursor.toArray(function(err, mutationRecords) {
						if (err) {
							this.sendMessage(this.factory.newErrorReply(request, 500, "Internal error: " + err, new BraidAddress(to.userId, this.config.domain,
									BOT_RESOURCE)));
						} else {
							var descriptors = [];
							async.eachSeries(mutationRecords, function(mutationRecord, callback) {
								descriptors.push(mutationRecord.mutationId, mutationRecord.stateHash, request.deliverFull);
								if (request.deliverFull) {
									var mutation = factory.newMutationFromMutationRecord(mutationRecord);
									var mutationMessage = factory.newTileMutationMessage(request.from, to, mutation);
									this.sendMessage(mutationMessage);
								}
								callback();
							}.bind(this), function(err) {
								if (err) {
									this.sendMessage(this.factory.newErrorReply(request, 500, "Internal error: " + err, new BraidAddress(to.userId,
											this.config.domain, BOT_RESOURCE)));
								} else {
									var reply = newTileMutationListReply(request, to, request.data.tileId, descriptors);
									this.sendMessage(reply);
								}
							}.bind(this));
						}
					}.bind(this));
				}
			}.bind(this));
};

BotManager.prototype.processTileMutationListResponse = function(reply, to) {
	// Presumably, we issued a tile-mutation-list and this is the reply that we are now processing. We can determine from this
	// response whether there are mutations that we need to ask to be resent. Otherwise, we will be receiving tile-mutation
	// messages that are handled separately.

	var tileId = reply.data.tileId;
	async.each(reply.data.descriptors, function(descriptor, callback) {
		// If they are already resending the mutation, there's nothing we need to do. Otherwise, we need to check to
		// see if we have that mutation, and if not, request that it be resent
		if (!descriptor.resent) {
			this.braidDb.isMutationExists(tileId, descriptor.mutationId, false, false, function(exists) {
				if (!exists) {
					var resendRequest = this.factory.newTileMutationResendRequest(reply.from, to, tileId, descriptor.mutationId, null);
					this.sendMessage(resendRequest);
				}
			}.bind(this));
		}
	}.bind(this));
};

BotManager.prototype.handleTileMutationResendRequest = function(request, to) {
	// We are being asked to resend a mutation. First we need to make sure that the user associated with this bot actually has that tile
	this.braidDb.findUserTile(to.userId, request.data.tileId,
			function(err, userTileRecord) {
				if (err) {
					this.sendMessage(this.factory.newErrorReply(request, 500, "Internal error: " + err, new BraidAddress(to.userId, this.config.domain,
							BOT_RESOURCE)));
				} else if (userTileRecord) {
					this.braidDb.findMutation(request.data.tileId, request.data.mutationId, function(err, mutationRecord) {
						if (err) {
							this.sendMessage(this.factory.newErrorReply(request, 500, "Internal error: " + err, new BraidAddress(to.userId, this.config.domain,
									BOT_RESOURCE)));
						} else if (mutationRecord) {
							var mutationMessage = this.factory.newTileMutationMessage(request.from, to, this.factory
									.newTileMutationFromMutationRecord(mutationRecord));
							this.sendMessage(mutationMessage);
							// TODO: if appropriate, we should also send dependencies (files)
						} else {
							this.sendMessage(this.factory.newErrorReply(request, 404, "No such tile", new BraidAddress(to.userId, this.config.domain,
									BOT_RESOURCE)));
						}
					}.bind(this));
				} else {
					this.sendMessage(this.factory.newErrorReply(request, 404, "No such tile", new BraidAddress(to.userId, this.config.domain, BOT_RESOURCE)));
				}
			}.bind(this));
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
				case 'tile-inventory':
					this.handleTileInventoryRequest(message, to);
					break;
				case 'tile-mutation-list':
					this.handleTileMutationListRequest(message, to);
					break;
				case 'tile-mutation-resend':
					this.handleTileMutationResendRequest(message, to);
					break;
				default:
					if (isDirected) {
						this.sendMessage(this.factory.newErrorReply(message, 406, "This request type is not supported", new BraidAddress(to.userId,
								this.config.domain, BOT_RESOURCE)));
					}
					break;
				}
				break;
			case 'cast':
				switch (message.request) {
				case 'tile-share':
					this.handleTileShare(message, to);
					break;
				case 'tile-accept':
					this.handleTileAccept(message, to);
					break;
				case 'tile-mutation':
					this.handleTileMutation(message, to);
					break;
				}
				break;
			case 'reply':
				if (isDirected) {
					switch (message.request) {
					case 'tile-inventory':
						this.handleTileInventoryResponse(message, to);
						break;
					case 'tile-mutation-list':
						this.handleTileMutationListResponse(message, to);
						break;
					}
					break;
				}
			case 'error':
				break;
			}
		} else {
			console.warn("braid-client-bot: ignoring message sent to non-existent user: " + to.userId);
		}
	}.bind(this));
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