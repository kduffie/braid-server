/*jshint bitwise: false*/
var factory = require('./braid-factory');

/*
 * A TileMutationProcessor is a class that handles the work to maintain a tile's state as mutations are made to it. This has been designed to be used in a
 * variety of different use-cases by having the caller provide a set of "handlers" that do the case-specific work, such as fetching tile state (from memory, db,
 * etc.), handling changes, etc.
 * 
 * handlers is an object that has the following callback functions as members:
 * 
 * isMutationExists(processor, mutationId, function(exists)) getLatestMutation(processor, function(mutation)) decrementPendingMutations(processor, function())
 * iterateMutations(processor, reverseChronological, function(mutation, function(deleteAndContinue), function()) isFileExists(processor, fileId,
 * function(exists)) onFileMissing(processor, mutation) saveMutation(processor, mutation, function()) addTileMember(processor, memberDescriptor, function())
 * removeTileMember(processor, memberDescriptor, function()) setTileProperty(processor, propertyDescriptor, function()) deleteTileProperty(processor,
 * propertyDescriptor, function()) setTileRecord(processor, collectionRecord, function()) reorderTileRecord(processor, recordPositionDescriptor, function())
 * deleteTileRecord(processor, recordDescriptor, function()) setTileFile(processor, fileDescriptor, function()) deleteTileFile(processor, fileDescriptor,
 * function()) getTileProperty(processor, propertyName, function(propertyDescriptor)) getTileRecord(processor, collection, recordId, function(collectionRecord))
 * getTileFile(processor, fileName, function(fileDescriptor)) onMutationsCompleted(processor)
 * 
 * The first argument to all of these methods is the TileMutationProcessor object that is calling back. From it you can get the context needed to fulfill the
 * need (processor.tileId).
 * 
 * onMutationsCompleted is for the case where the caller only needs this object temporarily to process one or more mutations. Once that is done, the caller can
 * discard this object and create a new one later as needed. Alternatively, the caller can keep this object around and use it again later when more mutations
 * arrive.
 * 
 * Typically an instance of this class is created when a tile has been received. Assuming that the use case requires persistence, then a record of the tile is
 * saved in a database.
 */

function TileMutationProcessor(tileId, expectedMutations, handlers) {
	this.tileId = tileId;
	this.expectedMutations = expectedMutations;
	this.handlers = handlers;
	this.pendingMutations = [];
	this.pendingRollbacks = [];
	this.mutationsQueued = 0;
}

TileMutationProcessor.prototype.now = function() {
	return Date.now();
};

TileMutationProcessor.prototype.addMutation = function(mutation) {
	this.pendingMutations.push(mutation);
	this.mutationsQueued++;
	this.process();
};

TileMutationProcessor.prototype.process = function() {
	if (!this.cycleInProgress) {
		this.cycleInProgress = true;
		if (this.pendingRollbacks.length > 0) {
			this.processRollbacks();
		} else if (this.pendingMutations.length > 0) {
			this.processMutations();
		} else {
			this.cycleInProgress = false;
			if (this.mutationsQueued > 0) {
				this.handlers.onMutationsCompleted(this);
			}
		}
	}
};

TileMutationProcessor.prototype.onCycleComplete = function() {
	this.cycleInProgress = false;
	process.nextTick(function() {
		this.process();
	}.bind(this));
};

TileMutationProcessor.prototype.processMutations = function() {
	this.sortPendingMutations();
	var mutation = this.pendingMutations[0];
	this.handlers.isMutationExists(this, mutation.id, function(exists) {
		if (exists) {
			console.warn("Mutation already available.  Skipping.", mutation);
			this.pendingMutations.shift();
			this.onCycleComplete();
		} else {
			this.handlers.getLatestMutation(this, function(err, m) {
				if (err) {
					throw err;
				} else {
					this.processMutationWithLatest(mutation, m);
				}
			}.bind(this));
		}
	}.bind(this));
};

TileMutationProcessor.prototype.processMutationWithLatest = function(mutation, latestMutation) {
	var comparison = -1;
	if (latestMutation) {
		comparison = this.mutationCompare(latestMutation, mutation);
	}
	if (comparison === 0) {
		console.warn("Identical mutation unexpected.  Skipping.");
		this.pendingMutations.shift();
		this.onCycleComplete();
	} else if (comparison < 0) {
		console.log("Processing mutation");
		this.verifyMutation(mutation, function(valid) {
			console.log("Popping mutation");
			this.pendingMutations.shift();
			if (valid) {
				this.applyMutation(mutation, latestMutation, function(err) {
					if (err) {
						throw err;
					}
					if (this.expectedMutations > 0) {
						this.expectedMutations--;
						this.handlers.decrementPendingMutations(this, function(err) {
							if (err) {
								throw err;
							}
							this.onCycleComplete();
						}.bind(this));
					} else {
						this.onCycleComplete();
					}
				}.bind(this));
			} else {
				console.warn("Invalid mutation.  Ignoring.", mutation);
				this.onCycleComplete();
			}
		}.bind(this));
	} else {
		console.log("Mutation being processed is out-of-order.  Starting rollback");
		// This mutation is out-of-order, so we need to do rollbacks. We'll
		// iterate backward
		// through the mutations that have already been applied, putting them
		// onto the rollback
		// list until we run out or find one that comes before this new one.
		this.handlers.iterateMutations(this, true, function(err, record, callback) {
			if (err) {
				throw err;
			}
			// The first function will be called for each
			// mutation record in sequence. The callback
			// provided is used to tell the caller whether to
			// delete the record and continue iterating
			// or to abort and call the onComplete (the other
			// function)
			if (this.mutationCompare(record, mutation) < 0) {
				console.log("Found existing mutation that predates new one.  Rollback complete");
				callback(false);
			} else {
				console.log("Pushing existing mutation onto rollback queue and deleting", record);
				this.pendingRollbacks.push(record);
				callback(true);
			}
		}.bind(this), function() {
			// This is called when complete -- either because
			// there are no more records or because
			// the onRecord callback (above) returned false
			if (this.pendingRollbacks.length === 0) {
				throw "Pending rollbacks should not be empty!";
			}
			console.log("Finished pulling out mutations to be rolled back.");
			this.onCycleComplete();
		}.bind(this));
	}
};

TileMutationProcessor.prototype.verifyMutation = function(mutation, callback) {
	if (mutation.action === 'add-file' || mutation.action === 'set-record') {
		if (mutation.fileId) {
			this.handlers.isFileExists(this, mutation.fileId, function(exists) {
				if (exists) {
					callback(true);
				} else {
					console.log("Found mutation for which I do not yet have the file.  Fetching.", mutation);
					this.handlers.onFileMissing(this, mutation);
					callback(false);
				}
			}.bind(this));
		} else {
			callback(true);
		}
	} else {
		callback(true);
	}
};

TileMutationProcessor.prototype.processRollbacks = function() {
	console.log("Popping mutation from rollback stack");
	var mutation = this.pendingRollbacks.shift();
	this.rollbackMutation(mutation, function() {
		console.log("Pushing rolled-back mutation");
		this.pendingMutations.push(mutation);
		this.onCycleComplete();
	}.bind(this));
};

TileMutationProcessor.prototype.applyMutation = function(mutation, latestAppliedMutation, callback) {
	this.updateMutationState(mutation, latestAppliedMutation, function(err) {
		if (err) {
			throw err;
		}
		this.handlers.saveMutation(this, mutation, function(err) {
			if (err) {
				throw err;
			}
			this.performMutation(mutation, callback);
		}.bind(this));
	}.bind(this));
};

TileMutationProcessor.prototype.performMutation = function(mutation, callback) {
	switch (mutation.action) {
	case 'member-add':
		this.handlers.addTileMember(this, mutation.value, callback);
		break;
	case 'member-remove':
		this.handlers.removeTileMember(this, mutation.value, callback);
		break;
	case 'property-set':
		if (mutation.value.value) {
			var record = factory.newPropertyRecord(mutation.tileId, mutation.value.name, mutation.value.type, mutation.value.value, mutation.originator,
					mutation.created);
			this.handlers.setTileProperty(this, record, callback);
		} else {
			this.handlers.deleteTileProperty(this, mutation.value.name, callback);
		}
		break;
	case 'record-set':
		this.handlers.setTileRecord(this, mutation.value, callback);
		break;
	case 'record-reorder':
		this.handlers.reorderTileRecord(this, mutation.value, callback);
		break;
	case 'record-delete':
		this.handlers.deleteTileRecord(this, mutation.value, callback);
		break;
	case 'file-set':
		this.handlers.setTileFile(this, mutation.value, callback);
		break;
	case 'file-delete':
		this.handlers.deleteTileFile(this, mutation.value, callback);
		break;
	default:
		console.error("Unhandled mutation action '" + mutation.action + "'");
		callback();
		break;
	}
};

TileMutationProcessor.prototype.rollbackMutation = function(mutation, callback) {
	this.handlers.unsaveMutation(this, mutation, function() {
		switch (mutation.action) {
		case 'member-add':
			this.handlers.removeTileMember(this, mutation.value, callback);
			break;
		case 'member-remove':
			this.handlers.addTileMember(this, mutation.value, callback);
			break;
		case 'property-set':
			if (mutation.previousValue) {
				this.handlers.setTileProperty(this, mutation.previousValue, callback);
			} else {
				this.handlers.deleteTileProperty(this, mutation.value.name, callback);
			}
			break;
		case 'record-set':
			if (mutation.previousValue) {
				this.handlers.setTileRecord(this, mutation.previousValue, callback);
			} else {
				this.handlers.deleteTileRecord(this, mutation.value, callback);
			}
			break;
		case 'record-reorder':
			this.handlers.reorderTileRecord(this, mutation.previousValue, callback);
			break;
		case 'record-delete':
			this.handlers.setTileRecord(this, mutation.previousValue, callback);
			break;
		case 'file-set':
			if (mutation.previousValue) {
				this.handlers.setTileFile(this, mutation.previousValue, callback);
			} else {
				this.handlers.deleteTileFile(this, mutation.value, callback);
			}
			break;
		case 'file-delete':
			this.handlers.setTileFile(this, mutation.previousValue, callback);
			break;
		default:
			console.error("Unhandled mutation action '" + mutation.action + "'");
			callback();
			break;
		}
	}.bind(this));
};

TileMutationProcessor.prototype.updateMutationState = function(mutation, latestAppliedMutation, callback) {
	var hashCode = 0;
	mutation.index = 0;
	if (latestAppliedMutation) {
		hashCode = latestAppliedMutation.stateHash;
		mutation.index = latestAppliedMutation.index + 1;
	}
	mutation.stateHash = this.moveHashCodeForward(hashCode, mutation);
	switch (mutation.action) {
	case 'member-add':
	case 'member-remove':
		callback();
		break;
	case 'property-set':
		this.handlers.getTileProperty(this, mutation.value.name, function(property) {
			mutation.previousValue = property;
			callback();
		}.bind(this));
		break;
	case 'record-set':
	case 'record-delete':
		this.handlers.getTileRecord(this, mutation.value.collection, mutation.value.recordId, function(record) {
			mutation.previousValue = record;
			callback();
		}.bind(this));
		break;
	case 'record-reorder':
		this.handlers.getTileRecord(this, mutation.value.collection, mutation.value.recordId, function(record) {
			mutation.previousValue = factory.newTileMutationRecordPosition(record);
			callback();
		}.bind(this));
		break;
	case 'file-set':
	case 'file-delete':
		this.handlers.getTileFile(this, mutation.value.fileName, function(file) {
			mutation.previousValue = file;
			callback();
		}.bind(this));
		break;
	default:
		console.error("Unhandled mutation action '" + mutation.action + "'");
		callback("Unhandled mutation action " + mutation.action);
		break;
	}
};

TileMutationProcessor.prototype.moveHashCodeForward = function(hashCode, mutation) {
	hashCode += this.computeHash(mutation.mutationId);
	return hashCode & hashCode;
};

// from:
// http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
TileMutationProcessor.prototype.computeHash = function(value) {
	var hash = 0, i, chr, len;
	if (value.length === 0) {
		return hash;
	}
	for (i = 0, len = this.length; i < len; i++) {
		chr = value.charCodeAt(i);
		hash = ((hash << 5) - hash) + chr;
		hash = hash & hash; // Convert to 32bit integer
	}
	return hash;
};

TileMutationProcessor.prototype.sortPendingMutations = function() {
	this.pendingMutations.sort(this.mutationCompare);
};

TileMutationProcessor.prototype.mutationCompare = function(m1, m2) {
	if (m1.mutationId === m2.mutationId) {
		return 0;
	}
	if (m1.created < m2.created) {
		return -1;
	}
	if (m1.created > m2.created) {
		return 1;
	}
	return m1.localeCompare(m2);
};

if (typeof module !== 'undefined') {
	module.exports = TileMutationProcessor;
}