var assert = require('assert');
var factory = require('../braid-factory');

describe("Braid Factory", function() {
	it("creates a register message", function(done) {
		var request = factory.newRegisterRequest("user", "pw");
		assert(request, "Request created");
		assert(request.id, "Non-zero id");
		assert.equal(request.type, "request");
		assert.equal(request.request, "register");
		assert.equal(request.data.user, "user");
		assert.equal(request.data.password, new Buffer("pw").toString('base64'));
		done();
	});
});
