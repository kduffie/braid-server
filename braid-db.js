var MongoClient = require('mongodb').MongoClient;
var async = require('async');

function BraidDb() {
}

BraidDb.prototype.initialize = function(configuration, callback) {
	console.log("db: initializing");
	this.config = configuration;
	this.mongoUrl = this.config.mongo.mongoUrl;
	this.options = this.config.mongo.options;
	this.accounts = null;
	this.subscriptions = null;
	this.userTiles = null;
	this.tiles = null;
	this.mutations = null;
	this.files = null;
	this.tileProperties = null;
	this.mutationReverseSort = {
		created : -1,
		originator : -1
	};
	this.mutationForwardSort = {
		created : 1,
		originator : 1
	};
	this._open(callback);
}

BraidDb.prototype._open = function(callback) {
	var steps = [];
	steps.push(function(callback) {
		MongoClient.connect(this.mongoUrl, callback);
	}.bind(this));

	steps.push(function(db, callback) {
		this.db = db;
		if (this.options && this.options.dropDbOnStartup) {
			db.dropDatabase(function(err, result) {
				if (err) {
					callback(err);
				} else {
					db.open(function(err, reopenedDb) {
						if (err) {
							callback(err);
						}
						this.db = reopenedDb;
						this._setup(callback);
					}.bind(this));
				}
			}.bind(this));
		} else {
			this._setup(callback);
		}
	}.bind(this));

	async.waterfall(steps, callback);
};

BraidDb.prototype.close = function(callback) {
	// this.db.close(false, callback); KD: seems to be a bug in the mongo driver for node. This throws an uncatchable.
	callback();
};

BraidDb.prototype._setup = function(callback) {
	async.parallel([
					this._setupAccounts.bind(this),
					this._setupSubscriptions.bind(this),
					this._setupTiles.bind(this),
					this._setupUserTiles.bind(this),
					this._setupMutations.bind(this),
					this._setupFiles.bind(this),
					this._setupTileProperties.bind(this) ], function(err) {
		if (err) {
			callback(err);
		} else {
			callback(null, this);
		}
	}.bind(this));
};

BraidDb.prototype._setupAccounts = function(callback) {
	this.accounts = this.db.collection("accounts");
	this.accounts.ensureIndex({
		userId : 1
	}, {
		unique : true,
		w : 1
	}, callback);
};

BraidDb.prototype._setupSubscriptions = function(callback) {
	this.subscriptions = this.db.collection("subscriptions");
	var steps = [];
	steps.push(function(callback) {
		this.subscriptions.ensureIndex({
			"target.userId" : 1,
			"target.domain" : 1
		}, {
			unique : true,
			w : 1
		}, callback);
	}.bind(this));
	steps.push(function(callback) {
		this.subscriptions.ensureIndex({
			"subscriber.userId" : 1,
			"subscriber.domain" : 1
		}, {
			w : 1
		}, callback);
	}.bind(this));
	async.parallel(steps, callback);
};

BraidDb.prototype._setupTiles = function(callback) {
	this.tiles = this.db.collection("tiles");
	var steps = [];
	steps.push(function(callback) {
		this.tiles.ensureIndex({
			tileId : 1
		}, {
			unique : true,
			w : 1
		}, callback);
	}.bind(this));
	steps.push(function(callback) {
		this.tiles.ensureIndex({
			"members.userId" : 1,
			"members.domain" : 1
		}, {
			unique : false,
			w : 1
		}, callback);
	}.bind(this));
	async.parallel(steps, callback);
};

BraidDb.prototype._setupUserTiles = function(callback) {
	this.userTiles = this.db.collection("user_tiles");
	this.userTiles.ensureIndex({
		userId : 1,
		tileId : 1
	}, {
		unique : true,
		w : 1
	}, callback);
};

BraidDb.prototype._setupMutations = function(callback) {
	this.mutations = this.db.collection("mutations");
	var steps = [];
	steps.push(function(callback) {
		this.mutations.ensureIndex({
			tileId : 1,
			mutationId : 1,
			integrated : 1
		}, {
			unique : true,
			w : 1
		}, callback);
	}.bind(this));
	steps.push(function(callback) {
		this.mutations.ensureIndex({
			tileId : 1,
			mutationId : 1,
			integrated : 1
		}, {
			unique : true,
			w : 1
		}, callback);
	}.bind(this));
	steps.push(function(callback) {
		this.mutations.ensureIndex({
			tileId : 1,
			integrated : 1,
			created : -1,
			originator : -1
		}, {
			unique : true,
			w : 1
		}, callback);
	}.bind(this));
	steps.push(function(callback) {
		this.mutations.ensureIndex({
			tileId : 1,
			integrated : 1,
			created : 1,
			originator : 1
		}, {
			unique : true,
			w : 1
		}, callback);
	}.bind(this));
	async.parallel(steps, callback);
};

BraidDb.prototype._setupFiles = function(callback) {
	this.files = this.db.collection("files");
	this.files.ensureIndex({
		fileId : 1
	}, {
		unique : true,
		w : 1
	}, callback);
};

BraidDb.prototype._setupTileProperties = function(callback) {
	this.tileProperties = this.db.collection("tile_properties");
	this.tileProperties.ensureIndex({
		tileId : 1,
		name : 1
	}, {
		unique : true,
		w : 1
	}, callback);
};

BraidDb.prototype.insertAccount = function(record, callback) {
	this.accounts.insert(record, {
		w : 1
	}, callback);
};

BraidDb.prototype.findAccountById = function(userId, callback /* (err, record) */) {
	this.accounts.findOne({
		userId : userId
	}, callback);
};

BraidDb.prototype.iterateAccounts = function(callback /* (err, cursor) */) {
	var cursor = this.accounts.find({});
	callback(null, cursor);
};

BraidDb.prototype.insertSubscription = function(record, callback) {
	this.subscriptions.insertOne(record, {
		w : 1
	}, callback);
};

BraidDb.prototype.findSubscribersByTarget = function(targetUserId, targetDomain, callback /* (err, records) */) {
	this.subscriptions.find({
		"target.userId" : targetUserId,
		"target.domain" : targetDomain
	}).toArray(callback);
};

BraidDb.prototype.findSubscription = function(targetUserId, targetDomain, subscriberUserId, subscriberDomain, callback /* (err, record) */) {
	this.subscriptions.findOne({
		"target.userId" : targetUserId,
		"target.domain" : targetDomain,
		"subscriber.userId" : subscriberUserId,
		"subscriber.domain" : subscriberDomain
	}, callback);
};

BraidDb.prototype.findTargetsBySubscriber = function(subscriberUserId, subscriberDomain, callback /* (err, records) */) {
	this.subscriptions.find({
		"subscriber.userId" : subscriberUserId,
		"subscriber.domain" : subscriberDomain
	}).toArray(callback);
};

BraidDb.prototype.removeSubscription = function(targetUserId, targetDomain, subscriberUserId, subscriberDomain, callback) {
	this.subscriptions.deleteOne({
		"target.userId" : targetUserId,
		"target.domain" : targetDomain,
		"subscriber.userId" : subscriberUserId,
		"subscriber.domain" : subscriberDomain
	}, {
		w : 1
	}, callback);
};

BraidDb.prototype.insertTile = function(record, callback) {
	this.tiles.insert(record, {
		w : 1
	}, callback);
};

BraidDb.prototype.findTileById = function(tileId, callback /* (err, record) */) {
	this.tiles.findOne({
		tileId : tileId
	}, callback);
};

BraidDb.prototype.findTilesByMember = function(member, callback /* (err, records) */) {
	this.tiles.find({
		members : {
			"$elemMatch" : {
				"members.userId" : member.userId,
				"members.domain" : member.domain
			}
		}
	}).toArray(callback);
};

BraidDb.prototype.insertUserTile = function(record, callback) {
	this.userTiles.insert(record, {
		w : 1
	}, callback);
};

BraidDb.prototype.findUserTile = function(userId, tileId, callback /* (err, record) */) {
	this.userTiles.findOne({
		userId : userId,
		tileId : tileId
	}, callback);
};

BraidDb.prototype.insertMutation = function(record, callback) {
	this.mutations.insert(record, {
		w : 1
	}, callback);
};

BraidDb.prototype.findMutation = function(tileId, mutationId, callback /* (err, record) */) {
	this.mutations.findOne({
		tileId : tileId,
		mutationId : mutationId
	}, callback);
};

BraidDb.prototype.isMutationExists = function(tileId, mutationId, integratedOnly, unintegratedOnly, callback /* (exists) */) {
	var query;
	if (integratedOnly) {
		query = {
			tileId : tileId,
			mutationId : mutationId,
			integrated : true
		};
	} else if (unintegratedOnly) {
		query = {
			tileId : tileId,
			mutationId : mutationId,
			integrated : false
		};
	} else {
		query = {
			tileId : tileId,
			mutationId : mutationId
		};
	}
	this.mutations.find(query).count(function(err, count) {
		if (err) {
			callback(false);
		} else {
			callback(count > 0);
		}
	}.bind(this));
};

BraidDb.prototype.getLatestMutation = function(tileId, callback /* (err, record) */) {
	this.mutations.find({
		tileId : tileId,
		integrated : true
	}).sort(this.mutationReverseSort).nextObject(callback);
};

BraidDb.prototype.decrementTilePendingMutations = function(tileId, callback) {
	this.tiles.update({
		tileId : tileId
	}, {
		$incr : {
			pendingMutations : -1
		}
	}, {
		w : 1
	}, callback);
};

BraidDb.prototype.countMutations = function(tileId, callback /* (err, count) */) {
	var cursor = this.mutations.find({
		tileId : tileId,
		integrated : true
	}).count(false, {}, callback);
};

BraidDb.prototype.iterateMutations = function(tileId, reverseChronological, callback /* (err, cursor) */) {
	var sort;
	if (reverseChronological) {
		sort = this.mutationReverseSort;
	} else {
		sort = this.mutationForwardSort;
	}
	var cursor = this.mutations.find({
		tileId : tileId,
		integrated : true
	}).sort(sort);
	callback(null, cursor);
};

BraidDb.prototype.setTileIntegrated = function(tileId, mutationId, integrated, callback) {
	this.mutations.update({
		tileId : tileId,
		mutationId : mutationId
	}, {
		$set : {
			integrated : integrated
		}
	}, {
		w : 1
	}, callback);
};

BraidDb.prototype.updateMutationState = function(tileId, mutationId, stateHash, integrated, index, callback) {
	this.mutations.update({
		tileId : tileId,
		mutationId : mutationId
	}, {
		$set : {
			stateHash : stateHash,
			integrated : integrated,
			index : index
		}
	}, {
		w : 1
	}, callback);
};

BraidDb.prototype.updateTileSummaryInfo = function(tileId, summaryInfo, callback) {
	this.tiles.update({
		tileId : tileId
	}, {
		$set : {
			summaryInfo : summaryInfo
		}
	}, {
		w : 1
	}, callback);
};

BraidDb.prototype.addTileMember = function(processor, memberDescriptor, callback) {
	this.tiles.update({
		tileId : processor.tileId
	}, {
		$addToSet : {
			members : memberDescriptor
		}
	}, {
		w : 1
	}, callback);
};

BraidDb.prototype.removeTileMember = function(processor, memberDescriptor, callback) {
	this.tileCollection.update({
		tileId : processor.tileId
	}, {
		$pull : {
			members : memberDescriptor
		}
	}, {
		w : 1
	}, callback);
};

BraidDb.prototype.insertFile = function(record, callback) {
	this.files.insert(record, {
		w : 1
	}, callback);
};

BraidDb.prototype.isFileExists = function(fileId, callback /* (exists) */) {
	this.files.find({
		fileId : fileId
	}).count(function(err, count) {
		if (err) {
			return false;
		} else {
			return count > 0;
		}
	}.bind(this));
};

BraidDb.prototype.getTileProperty = function(tileId, propertyName, callback /* (err, record) */) {
	this.tileProperties.findOne({
		tileId : tileId,
		name : propertyName
	}, callback);
};

BraidDb.prototype.setTileProperty = function(record, callback) {
	this.tileProperties.update({
		tileId : record.tileId,
		name : record.name
	}, record, {
		upsert : true,
		w : 1
	}, callback);
};

BraidDb.prototype.deleteTileProperty = function(tileId, name, callback) {
	this.tilePropertiesCollection.remove({
		tileId : tileId,
		name : name
	}, {
		w : 1
	}, callback);
};

module.exports = BraidDb;
