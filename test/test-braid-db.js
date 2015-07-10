var assert = require('assert');
var factory = require('../braid-factory');
var BraidDb = require('../braid-db');

var MONGO_URL = "mongodb://localhost:27017/test1";

var braidDb;

describe("braid-db:", function() {
	before(function(done) {
		var config = {
			mongo : {
				domain : 'test.com',
				mongoUrl : MONGO_URL,
				options : {
					dropDbOnStartup : true
				}
			}
		};
		braidDb = new BraidDb();
		braidDb.initialize(config, done);
	});

	after(function(done) {
		braidDb.close(done);
	});

	it("ensure basic account operations", function(done) {
		var account = factory.newAccountRecord("joe", "domain1", "hash1");
		braidDb.insertAccount(account, function() {
			braidDb.findAccountById("joe", function(err, record) {
				if (err) {
					throw err;
				}
				assert.equal(record.userid, "joe");
				assert.equal(record.domain, "domain1");
				done();
			});
		});
	});

	it("ensure subscriber operations", function(done) {
		braidDb.insertSubscription(factory.newSubscriptionRecord("joe", "test.com", "bob", "test.com"), function(err) {
			if (err) {
				throw err;
			}
			braidDb.findSubscribersByTarget("joe", "test.com", function(err, records) {
				if (err) {
					throw err;
				}
				assert.equal(records.length, 1);
				assert.equal(records[0].target.userid, "joe");
				assert.equal(records[0].target.domain, "test.com");
				assert.equal(records[0].subscriber.userid, "bob");
				assert.equal(records[0].subscriber.domain, "test.com");
				braidDb.findTargetsBySubscriber("bob", "test.com", function(err, records) {
					if (err) {
						throw err;
					}
					assert.equal(records.length, 1);
					assert.equal(records[0].target.userid, "joe");
					assert.equal(records[0].target.domain, "test.com");
					assert.equal(records[0].subscriber.userid, "bob");
					assert.equal(records[0].subscriber.domain, "test.com");
					braidDb.removeSubscription("joe", "test.com", "bob", "test.com", function(err) {
						if (err) {
							throw err;
						}
						braidDb.findSubscribersByTarget("joe", "test.com", function(err, records) {
							if (err) {
								throw err;
							}
							assert.equal(records.length, 0);
							done();
						});
					})
				});
			});
		});
	});

});