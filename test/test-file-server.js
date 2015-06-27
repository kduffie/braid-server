var assert = require('assert');
var createTestConfig = require('./test-util').createTestConfig;
var createTestServicesWithStubs = require('./test-util').createTestServicesWithStubs;
var FileServer = require('../braid-file-server').FileServer;
var request = require('request');
var fs = require('fs');
var path = require('path');

var config;
var services;
var fileServer;

describe('file-server:', function() {
	before(function(done) {
		config = createTestConfig();
		createTestServicesWithStubs(config, function(err, svcs) {
			services = svcs;
			assert(!err);
			fileServer = new FileServer();
			fileServer.initialize(config, services);
			done();
		});
	});

	after(function(done) {
		fileServer.close();
		services.braidDb.close(done);
	});

	it('get missing file', function(done) {
		fs.createReadStream(path.join(__dirname, 'braid.png')).pipe(request.put({
			uri : 'http://localhost:25565',
			headers : [ {
				name : 'Content-Type',
				value : 'image/png'
			} ]
		}, function(error, response, body) {
			assert.equal(response.statusCode, 200);
			var details = JSON.parse(body);
			assert.equal(details.domain, 'test.com');
			assert.equal(details.contentType, 'image/png');

			request.get({
				uri : 'http://localhost:25565/' + details.domain + "/" + details.fileId,
				encoding : null
			}, function(error, response, body) {
				assert.equal(response.body.length, 65048)
				assert.equal(response.headers['content-type'], 'image/png');
				assert.equal(response.statusCode, 200);
				done();
			});
		}).on('error', function(err) {
			throw err;
		}));
	});
});
