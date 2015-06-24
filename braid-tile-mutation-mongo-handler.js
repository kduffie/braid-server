function TileMutationMongoHandler(manager, db) {
	this.manager = manager;
	this.braidDb = db;
}

TileMutationMongoHandler.prototype.isMutationExists = function(processor, mutationId, callback /* (exists) */) {
	this.braidDb.isMutationExists(processor.tileId, mutationId, true, false, callback);
};

TileMutationMongoHandler.prototype.getLatestMutation = function(processor, callback /* (err, mutation) */) {
	this.braidDb.getLatestMutation(processor.tileId, function(err, mutation) {
		if (err) {
			callback();
		} else {
			callback(null, mutation);
		}
	}.bind(this));
};

TileMutationMongoHandler.prototype.decrementPendingMutations = function(processor, callback) {
	this.braidDb.decrementTilePendingMutations(processor.tileId, callback);
};

TileMutationMongoHandler.prototype.iterateMutations = function(processor, reverseChronological,
		recordCallback /* (err, mutation, function(deleteAndContinue) */, completeCallback /* (err) */) {
	this.braidDb.iterateMutations(processor.tileId, reverseChronological, function(cursor) {
		this.iterateMutationsRecursive(cursor, processor, recordCallback, completeCallback);
	}.bind(this));
};

TileMutationMongoHandler.prototype.iterateMutationsRecursive = function(cursor, processor, recordCallback, completeCallback) {
	cursor.nextObject(function(err, record) {
		if (err) {
			cursor.close();
			completeCallback(err);
		} else if (record) {
			recordCallback(null, record, function(deleteAndContinue) {
				if (deleteAndContinue) {
					this.mutationCollection.remove({
						tileId : processor.tileId,
						mutationId : record.mutationId
					}, {
						w : 1
					}, function(err, result) {
						if (err) {
							completeCallback(err);
						} else {
							this.iterateMutationsRecursive(cursor);
						}
					}.bind(this));
				} else {
					cursor.close();
					completeCallback();
				}
			}.bind(this));
		} else {
			cursor.close();
			completeCallback();
		}
	}.bind(this));
};

TileMutationMongoHandler.prototype.isFileExists = function(processor, fileId, callback /* (exists) */) {
	this.braidDb.isFileExists(fileId, callback);
};

TileMutationMongoHandler.prototype.onFileMissing = function(processor, mutation) {
	this.manager.onFileMissing(processor.tileId, mutation);
};

TileMutationMongoHandler.prototype.saveMutation = function(processor, mutation, callback) {
	this.braidDb.setTileIntegrated(processor.tileId, mutation.mutationId, true, callback);
};

TileMutationMongoHandler.prototype.unsaveMutation = function(processor, mutation, callback) {
	this.braidDb.setTileIntegrated(processor.tileId, mutation.mutationId, false, callback);
};

TileMutationMongoHandler.prototype.addTileMember = function(processor, memberDescriptor, callback) {
	this.braidDb.addTileMember(processor.tileId, memberDescriptor, callback);
};

TileMutationMongoHandler.prototype.removeTileMember = function(processor, memberDescriptor, callback) {
	this.braidDb.removeTileMember(processor.tileId, memberDescriptor, callback);
};

TileMutationMongoHandler.prototype.setTileProperty = function(processor, propertyRecord, callback) {
	this.braidDb.setTileProperty(propertyRecord, callback);
};

TileMutationMongoHandler.prototype.deleteTileProperty = function(processor, propertyDescriptor, callback) {
	this.braidDb.deleteTileProperty(processor.tileId, propertyDescriptor.name, callback);
};

TileMutationMongoHandler.prototype.setTileRecord = function(processor, collectionRecord, callback) {
	this.tileRecordsCollection.update({
		tileId : processor.tileId,
		collection : collectionRecord.collection,
		recordId : collectionRecord.recordId
	}, collectionRecord, {
		upsert : true,
		w : 1
	}, callback);
};

TileMutationMongoHandler.prototype.reorderTileRecord = function(processor, recordPositionDescriptor, callback) {
	this.tileRecordsCollection.update({
		tileId : processor.tileId,
		collection : recordPositionDescriptor.collection,
		recordId : recordPositionDescriptor.recordId
	}, {
		$set : {
			sort : recordPositionDescriptor.sort
		}
	}, {
		w : 1
	}, callback);
};

TileMutationMongoHandler.prototype.deleteTileRecord = function(processor, recordDescriptor, callback) {
	this.tilePropertiesCollection.remove({
		tileId : processor.tileId,
		collection : recordDescriptor.collection,
		recordId : recordDescriptor.recordId
	}, {
		w : 1
	}, callback);
};

TileMutationMongoHandler.prototype.setTileFile = function(processor, fileDescriptor, callback) {
	this.tileFilesCollection.update({
		tileId : processor.tileId,
		name : fileDescriptor.fileName
	}, fileDescriptor, {
		upsert : true,
		w : 1
	}, callback);
};

TileMutationMongoHandler.prototype.deleteTileFile = function(processor, fileDescriptor, callback) {
	this.tileFilesCollection.remove({
		tileId : processor.tileId,
		name : fileDescriptor.fileName
	}, {
		w : 1
	}, callback);
};

TileMutationMongoHandler.prototype.getTileProperty = function(processor, propertyName, callback /* (err, propertyRecord) */) {
	this.braidDb.getTileProperty(processor.tileId, propertyName, callback);
};

TileMutationMongoHandler.prototype.getTileRecord = function(processor, collection, recordId, callback /* (err, collectionRecord) */) {
	this.tileRecordsCollection.find({
		tileId : processor.tileId,
		collection : collection,
		recordId : recordId
	}).nextObject(callback);
};

TileMutationMongoHandler.prototype.getTileFile = function(processor, fileName, callback /* (err, fileDescriptor) */) {
	this.tileFilesCollection.find({
		tileId : processor.tileId,
		name : fileName
	}).nextObject(callback);
};

TileMutationMongoHandler.prototype.onMutationsCompleted = function(processor) {
	this.manager.onMutationsCompleted(processor.tileId);
};

module.exports = TileMutationMongoHandler;