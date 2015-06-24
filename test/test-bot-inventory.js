var assert = require('assert');
var testUtil = require('./test-util');
var BotManager = require('../braid-bot').BotManager;
var BraidAddress = require('../braid-address').BraidAddress;
var handlerCallback;

var config;
var services;
var factory;
var bot;
var botMsgHandler;

describe("bot: tile-inventory", function() {
	before(function(done) {
		config = testUtil.createTestConfig("test.com");
		testUtil.createTestServicesWithStubs(config, function(err, testServices) {
			assert(!err);
			services = testServices;
			factory = services.factory;
			bot = new BotManager();
			bot.initialize(config, services);
			assert.equal(services.messageSwitch.hooks.length, 1);
			botMsgHandler = services.messageSwitch.hooks[0];
			done();
		});
	});

	after(function(done) {
		services.braidDb.close(done);
	});

	it("inventory1: handles case with no tiles on either side", function(done) {
		var summaries = [];
		var request = factory.newTileInventoryRequest(new BraidAddress('joe', 'test.com', '!bot'), new BraidAddress('joe', 'test.com', '12345'), summaries);
		services.messageSwitch.waitForMessage(2000, function(err, reply) {
			assert(!err);
			assert.equal(reply.data.mismatchedTiles.length, 0);
			assert.equal(reply.data.missingTiles.length, 0);
			done();
		});
		botMsgHandler(request);
	});

	it("inventory2: handles case with one tile on my side and none on theirs", function(done) {
		var summaries = [];
		summaries.push(factory.newTileSummary('t1', 'app1', 1, 0, 0));
		var request = factory.newTileInventoryRequest(new BraidAddress('joe', 'test.com', '!bot'), new BraidAddress('joe', 'test.com', '12345'), summaries);
		services.messageSwitch.waitForMessage(2000, function(err, reply) {
			assert(!err);
			assert.equal(reply.data.mismatchedTiles.length, 0);
			assert.equal(reply.data.missingTiles.length, 0);
			done();
		});
		botMsgHandler(request);
	});

	it("inventory3: handles case with no tiles on my side and one on theirs", function(done) {
		var originator = new BraidAddress('joe', 'test.com', '12345');
		var tileInfo = factory.newTileInfo('t3', 'app1', 1, 0, originator, 1000);
		var tileShare = factory.newTileShareMessage(new BraidAddress('joe', 'test.com', '!bot'), originator, tileInfo);
		services.messageSwitch.waitForMessage(1000, function(err, reply) {
			assert(!err);
			assert(reply.request, 'tile-accept');
			var mutation = factory.newTileMutation('t3', 'm1', 100, originator);
			mutation = factory.newTileMutationAddMember(mutation, originator);
			var mutationMessage = factory.newTileMutationMessage(new BraidAddress('joe', 'test.com', '!bot'), originator, mutation);
			botMsgHandler(mutationMessage);
			// Now it is going to process the mutation. We need to wait briefly.
			setTimeout(function() {
				var summaries = [];
				var request = factory.newTileInventoryRequest(new BraidAddress('joe', 'test.com', '!bot'), new BraidAddress('joe', 'test.com', 'abcdef'),
						summaries);
				services.messageSwitch.waitForMessage(1000, function(err, reply) {
					assert(!err);
					assert.equal(reply.data.mismatchedTiles.length, 0);
					assert.equal(reply.data.missingTiles.length, 1);
					assert.equal(reply.data.missingTiles[0].tileId, 't3');
					done();
				});
				botMsgHandler(request);
			}, 1000);
		});
		botMsgHandler(tileShare);
	});

	it("inventory4: handles mismatched tile", function(done) {
		var originator = new BraidAddress('joe', 'test.com', '12345');
		var tileInfo = factory.newTileInfo('t4', 'app1', 1, 0, originator, 1000);
		var tileShare = factory.newTileShareMessage(new BraidAddress('joe', 'test.com', '!bot'), originator, tileInfo);
		services.messageSwitch.waitForMessage(1000, function(err, reply) {
			assert(!err);
			assert(reply.request, 'tile-accept');
			var mutation = factory.newTileMutation('t4', 'm1', 100, originator);
			mutation = factory.newTileMutationAddMember(mutation, originator);
			var mutationMessage = factory.newTileMutationMessage(new BraidAddress('joe', 'test.com', '!bot'), originator, mutation);
			botMsgHandler(mutationMessage);
			// Now it is going to process the mutation. We need to wait briefly.
			setTimeout(function() {
				var summaries = [];
				summaries.push(factory.newTileSummary('t4', 'app1', 1, 2, 23498, factory.newLatestMutationSummary('m2', 2500, originator)));
				var request = factory.newTileInventoryRequest(new BraidAddress('joe', 'test.com', '!bot'), new BraidAddress('joe', 'test.com', 'abcdef'),
						summaries);
				services.messageSwitch.waitForMessage(1000, function(err, reply) {
					assert(!err);
					assert.equal(reply.data.mismatchedTiles.length, 1);
					assert.equal(reply.data.mismatchedTiles[0].tileId, 't4');
					done();
				});
				botMsgHandler(request);
			}, 1000);
		});
		botMsgHandler(tileShare);
	});

});