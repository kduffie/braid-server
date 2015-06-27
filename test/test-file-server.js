var assert = require('assert');
var createTestConfig = require('./test-util').createTestConfig;
var createTestServicesWithStubs = require('./test-util').createTestServicesWithStubs;
var FileServer = require('../braid-file-server').FileServer;
var request = require('request');
var fs = require('fs');
var path = require('path');

var config1;
var config2;
var services1;
var services2;
var fileServer1;
var fileServer2;

describe('file-server:', function() {
	before(function(done) {
		config1 = createTestConfig('test.26111', 26101, 26111);
		createTestServicesWithStubs(config1, function(err, svcs) {
			assert(!err);
			services1 = svcs;
			fileServer1 = new FileServer();
			fileServer1.initialize(config1, services1);
			config2 = createTestConfig('test.26211', 26201, 26211);
			createTestServicesWithStubs(config2, function(err, svcs) {
				assert(!err);
				services2 = svcs;
				fileServer2 = new FileServer();
				fileServer2.initialize(config2, services2);
				done();
			});
		});
	});

	after(function(done) {
		fileServer1.close();
		fileServer2.close();
		services1.braidDb.close(done);
		services2.braidDb.close(done);
	});

	it('put and retrieve file', function(done) {
		fs.createReadStream(path.join(__dirname, 'braid.png')).pipe(request.put({
			uri : 'http://localhost:26121',
			headers : [ {
				name : 'Content-Type',
				value : 'image/png'
			} ]
		}, function(error, response, body) {
			assert.equal(response.statusCode, 200);
			var details = JSON.parse(body);
			assert.equal(details.domain, 'test.26111');
			assert.equal(details.contentType, 'image/png');

			request.get({
				uri : 'http://localhost:26121/' + details.domain + "/" + details.fileId,
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

	it('using encryption', function(done) {
		fs.createReadStream(path.join(__dirname, 'braid.png')).pipe(request.put({
			uri : 'http://localhost:26121?encrypt=true',
			headers : [ {
				name : 'Content-Type',
				value : 'image/png'
			} ]
		}, function(error, response, body) {
			assert.equal(response.statusCode, 200);
			var details = JSON.parse(body);
			assert.equal(details.domain, 'test.26111');
			assert.equal(details.contentType, 'image/png');
			assert(details.encryptionKey !== null);
			request.get({
				uri : 'http://localhost:26121/' + details.domain + "/" + details.fileId + "?decrypt=true&key=" + details.encryptionKey,
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

	it('files on remote domains', function(done) {
		fs.createReadStream(path.join(__dirname, 'braid.png')).pipe(request.put({
			uri : 'http://localhost:26221',
			headers : [ {
				name : 'Content-Type',
				value : 'image/png'
			} ]
		}, function(error, response, body) {
			assert.equal(response.statusCode, 200);
			var details = JSON.parse(body);
			assert.equal(details.domain, 'test.26211');
			assert.equal(details.contentType, 'image/png');
			request.get({
				uri : 'http://localhost:26121/' + details.domain + "/" + details.fileId,
				encoding : null
			}, function(error, response, body) {
				assert.equal(response.statusCode, 200);
				assert.equal(response.headers['content-type'], 'image/png');
				assert.equal(response.body.length, 65048)
				done();
			});
		}).on('error', function(err) {
			throw err;
		}));
	});

});
